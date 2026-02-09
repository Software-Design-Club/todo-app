"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { TodosTable } from "../../../drizzle/schema";
import { revalidatePath } from "next/cache";
import type { List } from "@/lib/types";
import { getCollaborators } from "./collaborators";
import { userCanEditList } from "./permissions";
import { type AuthenticatedSession, requireAuth } from "./require-auth";

export type Todo = typeof TodosTable.$inferSelect;

async function requireTodoAccess(
  todoId: Todo["id"]
): Promise<{ user: AuthenticatedSession["user"]; todo: Todo }> {
  const { user } = await requireAuth();
  const db = drizzle(sql);
  const [todo] = await db
    .select()
    .from(TodosTable)
    .where(eq(TodosTable.id, todoId))
    .limit(1);

  if (!todo) {
    throw new Error("Todo not found.");
  }

  const collaborators = await getCollaborators(todo.listId as List["id"]);
  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }

  return { user, todo };
}

export async function createTodo(
  todo: Pick<Todo, "title" | "status" | "listId">
) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(todo.listId as List["id"]);
  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }

  const db = drizzle(sql);
  const [newTodo] = await db.insert(TodosTable).values(todo).returning();

  return newTodo;
}

export async function updateTodoStatus(
  todoId: Todo["id"],
  newStatus: Todo["status"]
) {
  await requireTodoAccess(todoId);
  const db = drizzle(sql);
  await db
    .update(TodosTable)
    .set({ status: newStatus })
    .where(eq(TodosTable.id, todoId));
  return newStatus;
}

export async function updateTodoTitle(
  todoId: Todo["id"],
  newTitle: Todo["title"]
) {
  const { todo } = await requireTodoAccess(todoId);
  const db = drizzle(sql);
  const [updatedTodo] = await db
    .update(TodosTable)
    .set({ title: newTitle })
    .where(eq(TodosTable.id, todoId))
    .returning();

  if (!updatedTodo) {
    throw new Error("Todo not found.");
  }

  revalidatePath(`/lists/${todo.listId}`);
}

export async function deleteTodo(todoId: Todo["id"]) {
  await requireTodoAccess(todoId);
  const db = drizzle(sql);
  await db
    .update(TodosTable)
    .set({ status: "deleted" })
    .where(eq(TodosTable.id, todoId));
}

/**
 * Get all todos from one list given listId
 */
export async function getTodos(listId: List["id"]) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(listId);
  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }

  const db = drizzle(sql);
  const todos = await db
    .select()
    .from(TodosTable)
    .where(eq(TodosTable.listId, listId));
  return todos;
}
