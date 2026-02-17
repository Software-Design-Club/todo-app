"use server";

import { sql } from "@vercel/postgres";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListCollaboratorsTable, ListsTable, UsersTable } from "@/drizzle/schema";
import { revalidatePath } from "next/cache";
import type { List, User, ListUser } from "@/lib/types";
import { createTaggedList, createTaggedListUser, createTaggedUser } from "@/lib/types";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import { canViewList, isAuthorizedToEditCollaborators } from "./permissions";
import { requireAuth } from "./require-auth";

const db = drizzle(sql);

export async function searchUsers(searchTerm: string): Promise<User[]> {
  await requireAuth();

  if (!searchTerm.trim()) {
    return [];
  }

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
          ilike(UsersTable.name, `%${searchTerm.toLowerCase()}%`),
          ilike(UsersTable.email, `%${searchTerm.toLowerCase()}%`)
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

    // Check if the user is already a collaborator
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
    console.error("Database error while adding collaborator:", error);
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
    // For other DB errors
    throw new Error("Failed to add collaborator due to a database error.");
  }
}

export async function getCollaborators(
  listId: List["id"]
): Promise<ListUser[]> {
  await requireAuth();
  const { user: actingUser } = await requireAuth();

  try {
    const [list] = await db
      .select()
      .from(ListsTable)
      .where(eq(ListsTable.id, listId))
      .limit(1);

    if (!list) {
      throw new Error("List not found.");
    }

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

    const collaborators = collaboratorsFromDb.map(createTaggedListUser);

    if (!canViewList(createTaggedList(list), collaborators, actingUser.id)) {
      throw new Error("You do not have permission to view collaborators.");
    }

    return collaborators;
  } catch (error) {
    if (error instanceof Error) {
      const expectedErrors = [
        "List not found.",
        "You do not have permission to view collaborators.",
      ];
      if (expectedErrors.includes(error.message)) {
        throw error;
      }
    }
    throw new Error("Failed to load collaborators.");
  }
}

export async function getCollaboratorsForLists(
  listIds: List["id"][]
): Promise<Map<number, ListUser[]>> {
  const { user: actingUser } = await requireAuth();

  if (listIds.length === 0) {
    return new Map();
  }

  try {
    const listRows = await db
      .select()
      .from(ListsTable)
      .where(inArray(ListsTable.id, listIds));

    const listsById = new Map(listRows.map((list) => [list.id, createTaggedList(list)]));

    if (listsById.size !== listIds.length) {
      throw new Error("List not found.");
    }

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

    for (const listId of listIds) {
      const list = listsById.get(listId);
      if (!list) {
        throw new Error("List not found.");
      }
      const collaborators = result.get(listId) ?? [];
      if (!canViewList(list, collaborators, actingUser.id)) {
        throw new Error("You do not have permission to view collaborators.");
      }
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      const expectedErrors = [
        "List not found.",
        "You do not have permission to view collaborators.",
      ];
      if (expectedErrors.includes(error.message)) {
        throw error;
      }
    }
    throw new Error("Failed to load collaborators.");
  }
}

export async function removeCollaborator(params: {
  listId: List["id"];
  collaboratorUserId: User["id"];
}): Promise<void> {
  const { user: actingUser } = await requireAuth();
  const collaborators = await getCollaborators(params.listId);

  if (!isAuthorizedToEditCollaborators(collaborators, actingUser.id)) {
    throw new Error("Only the list owner can manage collaborators.");
  }

  const [targetCollaborator] = await db
    .select({
      role: ListCollaboratorsTable.role,
    })
    .from(ListCollaboratorsTable)
    .where(
      and(
        eq(ListCollaboratorsTable.userId, params.collaboratorUserId),
        eq(ListCollaboratorsTable.listId, params.listId),
        eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
      )
    )
    .limit(1);

  if (!targetCollaborator) {
    throw new Error("Collaborator not found.");
  }

  if (targetCollaborator.role === "owner") {
    throw new Error("User cannot be removed as a collaborator.");
  }

  try {
    const removed = await db
      .delete(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, params.collaboratorUserId),
          eq(ListCollaboratorsTable.listId, params.listId),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      )
      .returning();

    if (removed.length === 0) {
      throw new Error("Collaborator not found.");
    }

    revalidatePath(`/lists/${params.listId}`);
  } catch (error) {
    if (error instanceof Error) {
      const expectedErrors = [
        "Collaborator not found.",
        "User cannot be removed as a collaborator.",
      ];
      if (expectedErrors.includes(error.message)) {
        throw error;
      }
    }
    throw new Error("Failed to remove collaborator due to a database error.");
  }
}
