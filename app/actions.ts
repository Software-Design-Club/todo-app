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
