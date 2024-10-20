"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { ListsTable, TodosTable, UsersTable } from "../drizzle/schema";

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

type UsersListTodos = {
  id: number;
  title: string;
  creatorId: number;
  createdAt: Date;
  updatedAt: Date;
  todos: Array<{
    id: number;
    title: string;
    listId: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

// interface UsersListsTodos  extends typeof ListsTable {
//   todos: Array<typeof TodosTable>
// };

export async function getListsWithTodos(user: User) {
  const db = drizzle(sql);
  const [foundUser] = await db
    .select()
    .from(UsersTable)
    .where(eq(UsersTable.email, user.email));

  const listsWithTodos = await db
    .select()
    .from(ListsTable)
    .leftJoin(TodosTable, eq(ListsTable.id, TodosTable.listId))
    .where(eq(ListsTable.creatorId, foundUser.id));

  const result: UsersListTodos[] = listsWithTodos.map((listWithTodo) => {
    const list = listWithTodo.lists;
    const todos = listWithTodo.todos ? [listWithTodo.todos] : [];
    return { ...list, todos: todos };
  });

  console.log(result);
  return result;
}

// [
//   {
//     lists: {
//       id: 1,
//       title: 'My first list',
//       creatorId: 2,
//       createdAt: 2024-10-20T17:02:57.307Z,
//       updatedAt: 2024-10-20T17:02:57.307Z
//     },
//     todos: {
//       id: 1,
//       title: 'My first todo',
//       listId: 1,
//       createdAt: 2024-10-20T17:02:57.360Z,
//       updatedAt: 2024-10-20T17:02:57.360Z
//     }
//   }
// ]
