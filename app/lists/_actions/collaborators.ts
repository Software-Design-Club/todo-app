"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq, or, ilike, and } from "drizzle-orm";
import {
  InvitationStatusEnum,
  ListCollaboratorsTable,
  UsersTable,
} from "@/drizzle/schema";
import { revalidatePath } from "next/cache";
import type { List, User, ListUser } from "@/lib/types";
import { createTaggedUser, createTaggedListUser } from "@/lib/types";
import {
  canBeRemovedAsCollaborator,
  isAuthorizedToEditCollaborators,
} from "./permissions";
import { requireAuth } from "./require-auth";

// Initialize Drizzle client
const db = drizzle(sql);

export async function searchUsers(searchTerm: string): Promise<User[]> {
  await requireAuth();
  console.log("[Server Action] Searching users for:", searchTerm);
  if (!searchTerm.trim()) {
    return [];
  }

  const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`; // Prepare for ilike

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
      .limit(10); // Add a limit to prevent overly large result sets

    // Map id to string to match the User interface
    const results: User[] = usersFromDb.map(createTaggedUser);

    return results;
  } catch (error) {
    console.error("Database error while searching users:", error);
    // Optionally, throw a more specific error or return an empty array
    // throw new Error("Failed to search users due to a database error.");
    return []; // Return empty array on error to prevent breaking the client
  }
}

export async function addCollaborator(
  user: User,
  listId: List["id"]
): Promise<ListUser> {
  const { user: actingUser } = await requireAuth();
  console.log(
    `[Server Action] Attempting to add user ${user.id} to list ${listId}.`
  );

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
          eq(
            ListCollaboratorsTable.inviteStatus,
            InvitationStatusEnum.enumValues[1]
          )
        )
      )
      .limit(1);

    if (existingCollaborator.length > 0) {
      console.log(
        `User ${user.id} is already a collaborator on list ${listId}.`
      );
      // Optionally, throw an error to be caught by useMutation's onError
      throw new Error("User is already a collaborator on this list.");
      // Or just return if no specific client-side error message is needed for this case
      // return;
    }

    // Add the new collaborator
    const result = await db
      .insert(ListCollaboratorsTable)
      .values({
        userId: user.id,
        listId: listId,
        inviteStatus: InvitationStatusEnum.enumValues[1],
        inviteAcceptedAt: new Date(),
      })
      .returning();

    console.log(
      `[Server Action] User ${user.id} successfully added as a collaborator to list ${listId}.`
    );

    // Revalidate the path for the list page to reflect the new collaborator
    revalidatePath(`/lists/${listId}`);

    const insertedUserId = result[0]?.userId;
    if (!insertedUserId) {
      throw new Error("Failed to persist accepted collaborator membership.");
    }

    return createTaggedListUser({
      id: insertedUserId,
      name: user.name,
      email: user.email,
      role: result[0].role,
      listId: result[0].listId,
    });
  } catch (error) {
    console.error("Database error while adding collaborator:", error);
    if (error instanceof Error) {
      const expectedErrors = [
        "User is already a collaborator on this list.",
        "Only the list owner can manage collaborators.",
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
  console.log("[Server Action] Getting collaborators for list:", listId);

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
          eq(
            ListCollaboratorsTable.inviteStatus,
            InvitationStatusEnum.enumValues[1]
          )
        )
      );

    // Map id to string to match the User interface
    const results: ListUser[] = collaboratorsFromDb.map(createTaggedListUser);

    return results;
  } catch (error) {
    console.error("Database error while getting collaborators:", error);
    return []; // Return empty array on error to prevent breaking the client
  }
}

export async function removeCollaborator(listUser: ListUser): Promise<void> {
  const { user: actingUser } = await requireAuth();
  console.log(
    `[Server Action] Attempting to remove user ${listUser.User.id} from list ${listUser.listId}.`
  );

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
    const result = await db
      .delete(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, listUser.User.id),
          eq(ListCollaboratorsTable.listId, listUser.listId),
          eq(
            ListCollaboratorsTable.inviteStatus,
            InvitationStatusEnum.enumValues[1]
          )
        )
      )
      .returning();

    if (result.length === 0) {
      // This could happen if the collaborator was already removed or never existed.
      // Depending on requirements, this might not be an error.
      console.warn(
        `[Server Action] No collaborator found for user ${listUser.User.id} on list ${listUser.listId} to remove.`
      );
      // Optionally, throw an error if it's critical that a record was deleted.
      // throw new Error("Collaborator not found or already removed.");
    } else {
      console.log(
        `[Server Action] User ${listUser.User.id} successfully removed as a collaborator from list ${listUser.listId}.`
      );
    }

    revalidatePath(`/lists/${listUser.listId}`);
  } catch (error) {
    console.error("Database error while removing collaborator:", error);
    throw new Error("Failed to remove collaborator due to a database error.");
  }
}
