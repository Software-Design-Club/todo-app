"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq, not, and } from "drizzle-orm";
import { ListsTable, TodosTable, UsersTable } from "@/drizzle/schema";
import { notFound } from "next/navigation";
import { Todo } from "@/app/lists/_actions/todo";

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

export async function getLists(userEmail: string) {
  const db = drizzle(sql);
  const [foundUser] = await db
    .select()
    .from(UsersTable)
    .where(eq(UsersTable.email, userEmail));

  const lists = await db
    .select()
    .from(ListsTable)
    .where(eq(ListsTable.creatorId, foundUser.id));

  return lists;
}
