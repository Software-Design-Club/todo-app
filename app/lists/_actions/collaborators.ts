"use server";

import { sql } from "@vercel/postgres";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { revalidatePath } from "next/cache";
import { ListCollaboratorsTable, UsersTable } from "@/drizzle/schema";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import type { List, ListUser, User } from "@/lib/types";
import { createTaggedListUser, createTaggedUser } from "@/lib/types";
import {
  canBeRemovedAsCollaborator,
  isAuthorizedToEditCollaborators,
} from "./permissions";
import { requireAuth } from "./require-auth";

const db = drizzle(sql);

export async function searchUsers(searchTerm: string): Promise<User[]> {
  await requireAuth();

  if (!searchTerm.trim()) {
    return [];
  }

  const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`;

  try {
    const usersFromDb = await db
      .select({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
      })
      .from(UsersTable)
      .where(
        or(
          ilike(UsersTable.name, lowerSearchTerm),
          ilike(UsersTable.email, lowerSearchTerm)
        )
      )
      .limit(10);

    return usersFromDb.map(createTaggedUser);
  } catch {
    throw new Error("Failed to search users. Please try again.");
  }
}

export async function addCollaborator(
  user: User,
  listId: List["id"]
): Promise<ListUser> {
  const { user: actingUser } = await requireAuth();

  try {
    const collaborators = await getCollaborators(listId);
    if (!isAuthorizedToEditCollaborators(collaborators, actingUser.id)) {
      throw new Error("Only the list owner can manage collaborators.");
    }

    const existingCollaborator = await db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, user.id),
          eq(ListCollaboratorsTable.listId, listId),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      )
      .limit(1);

    if (existingCollaborator.length > 0) {
      throw new Error("User is already a collaborator on this list.");
    }

    const [inserted] = await db
      .insert(ListCollaboratorsTable)
      .values({
        userId: user.id,
        listId,
        inviteStatus: INVITATION_STATUS.ACCEPTED,
        inviteAcceptedAt: new Date(),
      })
      .returning();

    revalidatePath(`/lists/${listId}`);

    if (!inserted?.userId) {
      throw new Error("Failed to persist accepted collaborator membership.");
    }

    return createTaggedListUser({
      id: inserted.userId,
      name: user.name,
      email: user.email,
      role: inserted.role,
      listId: inserted.listId,
    });
  } catch (error) {
    if (error instanceof Error) {
      const expectedErrors = [
        "User is already a collaborator on this list.",
        "Only the list owner can manage collaborators.",
        "Failed to persist accepted collaborator membership.",
      ];

      if (expectedErrors.includes(error.message)) {
        throw error;
      }
    }

    throw new Error("Failed to add collaborator due to a database error.");
  }
}

export async function getCollaborators(
  listId: List["id"]
): Promise<ListUser[]> {
  await requireAuth();

  try {
    const collaboratorsFromDb = await db
      .select({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
        role: ListCollaboratorsTable.role,
        listId: ListCollaboratorsTable.listId,
      })
      .from(ListCollaboratorsTable)
      .innerJoin(UsersTable, eq(ListCollaboratorsTable.userId, UsersTable.id))
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      );

    return collaboratorsFromDb.map(createTaggedListUser);
  } catch {
    throw new Error("Failed to load collaborators.");
  }
}

export async function getCollaboratorsForLists(
  listIds: List["id"][]
): Promise<Map<number, ListUser[]>> {
  await requireAuth();

  if (listIds.length === 0) {
    return new Map();
  }

  try {
    const rows = await db
      .select({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
        role: ListCollaboratorsTable.role,
        listId: ListCollaboratorsTable.listId,
      })
      .from(ListCollaboratorsTable)
      .innerJoin(UsersTable, eq(ListCollaboratorsTable.userId, UsersTable.id))
      .where(
        and(
          inArray(ListCollaboratorsTable.listId, listIds),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      );

    const result = new Map<number, ListUser[]>();
    for (const row of rows) {
      const listId = row.listId;
      const listCollaborators = result.get(listId) ?? [];
      listCollaborators.push(createTaggedListUser(row));
      result.set(listId, listCollaborators);
    }

    return result;
  } catch {
    throw new Error("Failed to load collaborators.");
  }
}

export async function removeCollaborator(listUser: ListUser): Promise<void> {
  const { user: actingUser } = await requireAuth();

  const collaborators = await getCollaborators(listUser.listId);
  const canManageCollaborators = isAuthorizedToEditCollaborators(
    collaborators,
    actingUser.id
  );
  const isSelfRemoval = Number(actingUser.id) === Number(listUser.User.id);

  if (!canManageCollaborators && !isSelfRemoval) {
    throw new Error("Only the list owner can manage collaborators.");
  }

  if (!canBeRemovedAsCollaborator(listUser)) {
    throw new Error("User cannot be removed as a collaborator.");
  }

  try {
    await db
      .delete(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, listUser.User.id),
          eq(ListCollaboratorsTable.listId, listUser.listId),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      )
      .returning();

    revalidatePath(`/lists/${listUser.listId}`);
  } catch {
    throw new Error("Failed to remove collaborator due to a database error.");
  }
}
