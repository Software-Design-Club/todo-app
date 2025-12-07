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
import { Tagged } from "type-fest";
import type { List, ListWithRole, User } from "@/lib/types";
import { getCollaborators } from "./collaborators";
import {
  isAuthorizedToEditList,
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

const createTaggedList = (list: typeof ListsTable.$inferSelect): List => {
  return {
    id: list.id as Tagged<(typeof ListsTable.$inferSelect)["id"], "ListId">,
    title: list.title as Tagged<
      (typeof ListsTable.$inferSelect)["title"],
      "ListTitle"
    >,
    creatorId: list.creatorId as Tagged<
      (typeof ListsTable.$inferSelect)["creatorId"],
      "CreatorId"
    >,
    visibility: list.visibility as Tagged<
      (typeof ListsTable.$inferSelect)["visibility"],
      "ListVisibility"
    >,
    createdAt: list.createdAt as Tagged<
      (typeof ListsTable.$inferSelect)["createdAt"],
      "CreatedAt"
    >,
    updatedAt: list.updatedAt as Tagged<
      (typeof ListsTable.$inferSelect)["updatedAt"],
      "UpdatedAt"
    >,
  };
};

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
 * @returns Array of lists with role information
 *
 * Role determination:
 * - "owner" for lists where user is the creator
 * - "collaborator" for lists where user is added as a collaborator
 * - Owner role takes precedence if user is both creator and collaborator
 */
export async function getLists(userId: User["id"]): Promise<ListWithRole[]> {
  const db = drizzle(sql);
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
    .where(
      or(
        eq(ListsTable.creatorId, userId),
        eq(ListCollaboratorsTable.userId, userId)
      )
    );

  // Group results by list ID to handle duplicate rows from join
  const listMap = new Map<number, ListWithRole>();

  for (const result of results) {
    const list = result.lists;
    const collaborator = result.collaborator;

    // Determine user's role for this list
    // Owner role takes precedence if user is the creator
    let userRole: "owner" | "collaborator";

    if (list.creatorId === userId) {
      // User is the creator, so they are the owner
      userRole = "owner";
    } else if (collaborator && collaborator.userId === userId) {
      // User is a collaborator (and not the creator)
      userRole = collaborator.role;
    } else {
      // Fallback to collaborator (should not happen with proper where clause)
      userRole = "collaborator";
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

    if (!isAuthorizedToEditList(collaborators, userId)) {
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
