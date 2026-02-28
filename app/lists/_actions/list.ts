"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq, not, and, or } from "drizzle-orm";
import {
  ListCollaboratorsTable,
  ListsTable,
  TodosTable,
} from "@/drizzle/schema";
import { notFound } from "next/navigation";
import { Todo } from "@/app/lists/_actions/todo";
import { revalidatePath } from "next/cache";
import { createTaggedList, type List, type ListWithRole, type User, type UserRole } from "@/lib/types";
import { getCollaborators } from "./collaborators";
import {
  userCanEditList,
  isAuthorizedToChangeVisibility,
} from "./permissions";

export type UsersListTodos = {
  id: number;
  title: string;
  creatorId: number;
  createdAt: Date;
  updatedAt: Date;
  todos: Array<Todo>;
};

export async function getListWithTodos(
  listId: number
): Promise<UsersListTodos> {
  const db = drizzle(sql);

  const listsWithTodos = await db
    .select()
    .from(ListsTable)
    .leftJoin(TodosTable, eq(ListsTable.id, TodosTable.listId))
    .where(
      and(eq(ListsTable.id, listId), not(eq(TodosTable.status, "deleted")))
    );

  const todos = listsWithTodos
    .map((listWithTodos) => listWithTodos.todos)
    .filter((todo) => todo !== null);

  if (listsWithTodos.length === 0) {
    notFound();
  }
  return {
    id: listsWithTodos[0].lists.id,
    title: listsWithTodos[0].lists.title,
    creatorId: listsWithTodos[0].lists.creatorId,
    createdAt: listsWithTodos[0].lists.createdAt,
    updatedAt: listsWithTodos[0].lists.updatedAt,
    todos: todos,
  };
}

/**
 * Get record for one list given listId
 */
export async function getList(listId: number): Promise<List> {
  const db = drizzle(sql);
  const [list] = await db
    .select()
    .from(ListsTable)
    .where(eq(ListsTable.id, listId));

  return createTaggedList(list);
}

/**
 * Get all lists for a user with their role information
 *
 * @param userId - The ID of the user to get lists for
 * @param includeArchived - Whether to include archived lists (only owners see archived)
 * @returns Array of lists with role information
 *
 * Role determination:
 * - "owner" for lists where user is the creator
 * - "collaborator" for lists where user is added as a collaborator
 * - Owner role takes precedence if user is both creator and collaborator
 *
 * Archived list visibility:
 * - Active lists are visible to both owners and collaborators
 * - Archived lists are only visible to owners
 */
export async function getLists(
  userId: User["id"],
  includeArchived: boolean = false
): Promise<ListWithRole[]> {
  const db = drizzle(sql);

  // Build base query conditions
  const userCondition = or(
    eq(ListsTable.creatorId, userId),
    eq(ListCollaboratorsTable.userId, userId)
  );

  // For archived lists, only show to owners
  // For active lists, show to both owners and collaborators
  let stateCondition;
  if (includeArchived) {
    // Only show archived lists owned by user
    stateCondition = and(
      eq(ListsTable.state, "archived"),
      eq(ListsTable.creatorId, userId)
    );
  } else {
    // Show only active lists
    stateCondition = eq(ListsTable.state, "active");
  }

  const results = await db
    .select({
      lists: ListsTable,
      collaborator: ListCollaboratorsTable,
    })
    .from(ListsTable)
    .leftJoin(
      ListCollaboratorsTable,
      eq(ListsTable.id, ListCollaboratorsTable.listId)
    )
    .where(and(userCondition, stateCondition));

  // Group results by list ID to handle duplicate rows from join
  const listMap = new Map<number, ListWithRole>();

  for (const result of results) {
    const list = result.lists;
    const collaborator = result.collaborator;

    // Determine user's role for this list
    // Owner role takes precedence if user is the creator
    let userRole: UserRole;

    if (list.creatorId === userId) {
      // User is the creator, so they are the owner
      userRole = "owner" as UserRole;
    } else if (collaborator && collaborator.userId === userId) {
      // User is a collaborator (and not the creator)
      userRole = collaborator.role as UserRole;
    } else {
      // Fallback to collaborator (should not happen with proper where clause)
      userRole = "collaborator" as UserRole;
    }

    // Only add the list once, with the determined role
    if (!listMap.has(list.id) || userRole === "owner") {
      // If we haven't seen this list yet, or if this is the owner role (which takes precedence)
      listMap.set(list.id, {
        ...createTaggedList(list),
        userRole,
      });
    }
  }

  // Convert map to array and return
  return Array.from(listMap.values());
}

/**
 * Creates a new list with the given title for a specific user
 */
export async function createList(formData: FormData) {
  const title = formData.get("title")?.toString();
  const creatorIdStr = formData.get("creatorId")?.toString();

  if (!title || !creatorIdStr) {
    throw new Error("Title and creator ID are required");
  }

  const creatorId = parseInt(creatorIdStr, 10);
  if (isNaN(creatorId)) {
    throw new Error("Invalid creator ID");
  }

  const db = drizzle(sql);

  // Create new list
  const [newList] = await db
    .insert(ListsTable)
    .values({
      title,
      creatorId,
    })
    .returning();

  // Revalidate to update the UI
  revalidatePath("/lists");

  return newList;
}

/**
 * Updates the title of a list
 *
 * @param listId - The ID of the list to update
 * @param newTitle - The new title for the list
 * @param userId - The ID of the user attempting to update the list
 * @returns The updated list object with tagged types
 * @throws Error if validation fails or user is not authorized
 *
 * Validation:
 * - Title must not be empty after trimming whitespace
 * - Title must not exceed 255 characters
 *
 * Authorization:
 * - User must be either the owner or a collaborator of the list
 *
 * Side Effects:
 * - Revalidates cache for /lists and /lists/[listId] pages
 * - Updates the list's updatedAt timestamp
 *
 * Note: In the case of simultaneous edits by multiple users, last write wins.
 * No optimistic locking is implemented in this version.
 */
export async function updateListTitle(
  listId: List["id"],
  newTitle: string,
  userId: User["id"]
): Promise<List> {
  try {
    // Validate title - fail fast approach
    const trimmedTitle = newTitle.trim();

    if (trimmedTitle.length === 0) {
      throw new Error("Title cannot be empty");
    }

    if (trimmedTitle.length > 255) {
      throw new Error("Title cannot exceed 255 characters");
    }

    // Check authorization
    const collaborators = await getCollaborators(listId);

    if (!userCanEditList(collaborators, userId)) {
      throw new Error("You do not have permission to edit this list");
    }

    // Update list in database
    const db = drizzle(sql);
    const [updatedList] = await db
      .update(ListsTable)
      .set({
        title: trimmedTitle,
        updatedAt: new Date(),
      })
      .where(eq(ListsTable.id, listId))
      .returning();

    // Check if list was found and updated
    if (!updatedList) {
      throw new Error("List not found");
    }

    // Revalidate cache for both list pages
    revalidatePath("/lists");
    revalidatePath(`/lists/${listId}`);

    return createTaggedList(updatedList);
  } catch (error) {
    // Re-throw validation and authorization errors as-is
    if (error instanceof Error) {
      // Check if it's one of our expected error messages
      const expectedErrors = [
        "Title cannot be empty",
        "Title cannot exceed 255 characters",
        "You do not have permission to edit this list",
        "List not found",
      ];

      if (expectedErrors.includes(error.message)) {
        throw error;
      }
    }

    // Log unexpected errors for debugging
    console.error("Database error while updating list title:", error);

    // Throw user-friendly error for unexpected database errors
    throw new Error("Failed to update list title due to a database error");
  }
}

/**
 * Updates list visibility (public/private)
 * Only list owners can change visibility
 */
export async function updateListVisibility(
  listId: List["id"],
  visibility: List["visibility"],
  userId: User["id"]
): Promise<List> {
  console.log("inside updateVisibility");
  const collaborators = await getCollaborators(listId);

  if (!isAuthorizedToChangeVisibility(collaborators, userId)) {
    throw new Error("Only the list owner can change visibility");
  }

  const db = drizzle(sql);
  const [updatedList] = await db
    .update(ListsTable)
    .set({
      visibility,
      updatedAt: new Date(),
    })
    .where(eq(ListsTable.id, listId))
    .returning();

  if (!updatedList) {
    throw new Error("List not found");
  }

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);

  return createTaggedList(updatedList);
}

/**
 * Archives a list (owner only)
 */
export async function archiveList(
  listId: List["id"],
  userId: User["id"]
): Promise<List> {
  const list = await getList(listId);

  if (Number(list.creatorId) !== Number(userId)) {
    throw new Error("Only the list owner can archive this list");
  }

  if (list.state === "archived") {
    throw new Error("List is already archived");
  }

  const db = drizzle(sql);
  const [updatedList] = await db
    .update(ListsTable)
    .set({
      state: "archived",
      updatedAt: new Date(),
    })
    .where(eq(ListsTable.id, listId))
    .returning();

  if (!updatedList) {
    throw new Error("List not found");
  }

  revalidatePath("/lists");

  return createTaggedList(updatedList);
}

/**
 * Unarchives a list (owner only)
 */
export async function unarchiveList(
  listId: List["id"],
  userId: User["id"]
): Promise<List> {
  const list = await getList(listId);

  if (Number(list.creatorId) !== Number(userId)) {
    throw new Error("Only the list owner can unarchive this list");
  }

  if (list.state === "active") {
    throw new Error("List is not archived");
  }

  const db = drizzle(sql);
  const [updatedList] = await db
    .update(ListsTable)
    .set({
      state: "active",
      updatedAt: new Date(),
    })
    .where(eq(ListsTable.id, listId))
    .returning();

  if (!updatedList) {
    throw new Error("List not found");
  }

  revalidatePath("/lists");

  return createTaggedList(updatedList);
}

/**
 * Permanently deletes a list and all associated data (owner only)
 * This action is irreversible - todos and collaborator records are deleted via cascade
 */
export async function deleteList(
  listId: List["id"],
  userId: User["id"]
): Promise<void> {
  const list = await getList(listId);

  if (Number(list.creatorId) !== Number(userId)) {
    throw new Error("Only the list owner can delete this list");
  }

  const db = drizzle(sql);
  const result = await db
    .delete(ListsTable)
    .where(eq(ListsTable.id, listId))
    .returning();

  if (result.length === 0) {
    throw new Error("List not found");
  }

  revalidatePath("/lists");
}
