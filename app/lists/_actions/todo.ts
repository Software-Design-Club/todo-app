"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { TodosTable } from "../../../drizzle/schema";
import { revalidatePath } from "next/cache";
import type { List } from "./list";

export type Todo = typeof TodosTable.$inferSelect;

export async function createTodo(
  todo: Pick<Todo, "title" | "status" | "listId">
) {
  const db = drizzle(sql);
  const [newTodo] = await db.insert(TodosTable).values(todo).returning();

  return newTodo;
}

export async function updateTodoStatus(
  todoId: Todo["id"],
  newStatus: Todo["status"]
) {
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
  const db = drizzle(sql);
  const [updatedTodo] = await db
    .update(TodosTable)
    .set({ title: newTitle })
    .where(eq(TodosTable.id, todoId))
    .returning();
  revalidatePath(`/lists/${updatedTodo.listId}`);
}

export async function deleteTodo(todoId: Todo["id"]) {
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
  const db = drizzle(sql);
  const todos = await db
    .select()
    .from(TodosTable)
    .where(eq(TodosTable.listId, listId));
  return todos;
}
