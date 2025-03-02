"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { ListsTable, TodosTable, UsersTable } from "@/drizzle/schema";

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
