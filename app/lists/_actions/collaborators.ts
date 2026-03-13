"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq, or, ilike, and, notInArray } from "drizzle-orm";
import { ListCollaboratorsTable, UsersTable, InvitationsTable } from "@/drizzle/schema";
import { revalidatePath } from "next/cache";
import type { List, User, ListUser } from "@/lib/types";
import { createTaggedUser, createTaggedListUser } from "@/lib/types";
import { canBeRemovedAsCollaborator } from "./permissions";

// Initialize Drizzle client
const db = drizzle(sql);

export async function searchUsers(searchTerm: string): Promise<User[]> {
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

export async function searchInvitableUsers(
  searchTerm: string,
  listId: List["id"]
): Promise<User[]> {
  console.log("[Server Action] Searching invitable users for:", searchTerm);
  if (!searchTerm.trim()) {
    return [];
  }

  const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`;

  try {
    const acceptedCollaboratorIds = db
      .select({ userId: ListCollaboratorsTable.userId })
      .from(ListCollaboratorsTable)
      .where(eq(ListCollaboratorsTable.listId, listId));

    const openInvitationEmails = db
      .select({ email: InvitationsTable.invitedEmailNormalized })
      .from(InvitationsTable)
      .where(
        and(
          eq(InvitationsTable.listId, listId),
          or(
            eq(InvitationsTable.status, "sent"),
            eq(InvitationsTable.status, "pending")
          )
        )
      );

    const usersFromDb = await db
      .select({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
      })
      .from(UsersTable)
      .where(
        and(
          or(
            ilike(UsersTable.name, lowerSearchTerm),
            ilike(UsersTable.email, lowerSearchTerm)
          ),
          notInArray(UsersTable.id, acceptedCollaboratorIds),
          // invitedEmailNormalized is non-null for pending/sent per DB check constraint
          notInArray(UsersTable.email, openInvitationEmails)
        )
      )
      .limit(10);

    return usersFromDb.map(createTaggedUser);
  } catch (error) {
    console.error("Database error while searching invitable users:", error);
    return [];
  }
}

/**
 * @contract getCollaborators
 *
 * Returns only accepted collaborators for a list. Invitation records stored in
 * `invitations` are intentionally ignored so this read path remains stable
 * across the invitation-schema migration.
 *
 * @param listId - The list to query.
 * @returns Accepted collaborators with concrete user records.
 *
 * @effects
 * - Reads from `list_collaborators` joined to `todo_users`.
 * - Does not read from `invitations`.
 * - Preserves the existing collaborator shape expected by list pages.
 */
export async function getCollaborators(
  listId: List["id"]
): Promise<ListUser[]> {
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
      .where(eq(ListCollaboratorsTable.listId, listId));

    // Map id to string to match the User interface
    const results: ListUser[] = collaboratorsFromDb.map(createTaggedListUser);

    return results;
  } catch (error) {
    console.error("Database error while getting collaborators:", error);
    return []; // Return empty array on error to prevent breaking the client
  }
}

export async function removeCollaborator(listUser: ListUser): Promise<void> {
  console.log(
    `[Server Action] Attempting to remove user ${listUser.User.id} from list ${listUser.listId}.`
  );

  if (!canBeRemovedAsCollaborator(listUser)) {
    throw new Error("User cannot be removed as a collaborator.");
  }

  try {
    const result = await db
      .delete(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, listUser.User.id),
          eq(ListCollaboratorsTable.listId, listUser.listId)
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
