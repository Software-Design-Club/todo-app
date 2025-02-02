"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { ListsTable, TodosTable, UsersTable } from "../drizzle/schema";
import { notFound } from "next/navigation";

type User = {
  email: string;
  name?: string;
};

export async function findOrCreateAccount(user: User) {
  const db = drizzle(sql);
  const findUser = await db
    .select()
    .from(UsersTable)
    .where(eq(UsersTable.email, user.email));

  if (findUser.length === 0) {
    const [newUser] = await db
      .insert(UsersTable)
      .values({ email: user.email, name: user.name || user.email })
      .returning();

    const [newList] = await db
      .insert(ListsTable)
      .values({ title: "My first list", creatorId: newUser.id })
      .returning();

    await db
      .insert(TodosTable)
      .values({ title: "My first todo", listId: newList.id });
  }
}

export type UsersListTodos = {
  id: number;
  title: string;
  creatorId: number;
  createdAt: Date;
  updatedAt: Date;
  todos: Array<Todo>;
};

export type Todo = typeof TodosTable.$inferSelect;

// interface UsersListsTodos  extends typeof ListsTable {
//   todos: Array<typeof TodosTable>
// };

export async function getListWithTodos(
  listId: number
): Promise<UsersListTodos> {
  const db = drizzle(sql);

  const listsWithTodos = await db
    .select()
    .from(ListsTable)
    .leftJoin(TodosTable, eq(ListsTable.id, TodosTable.listId))
    .where(eq(ListsTable.id, listId));

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

export async function createTodo(
  todo: Pick<Todo, "title" | "status" | "listId">
) {
  const db = drizzle(sql);
  const [newTodo] = await db.insert(TodosTable).values(todo).returning();

  return newTodo;
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
