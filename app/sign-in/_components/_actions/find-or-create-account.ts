"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { ListsTable, TodosTable, UsersTable } from "@/drizzle/schema";
import { createTaggedUser } from "@/lib/types";

interface FindOrCreateAccountParams {
  email: string;
  name?: string | null;
}

export async function findOrCreateAccount(
  credentials: FindOrCreateAccountParams
) {
  const db = drizzle(sql);
  const findUser = await db
    .select()
    .from(UsersTable)
    .where(eq(UsersTable.email, credentials.email));

  if (findUser.length === 0) {
    const [newUser] = await db
      .insert(UsersTable)
      .values({
        email: credentials.email,
        name: credentials.name || credentials.email,
        status: "active",
      })
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

export async function getUser(email: string) {
  const db = drizzle(sql);
  const [user] = await db
    .select()
    .from(UsersTable)
    .where(eq(UsersTable.email, email));
  return createTaggedUser(user);
}
