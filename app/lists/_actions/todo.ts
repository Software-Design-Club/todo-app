"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { and, eq } from "drizzle-orm";
import {
  ListCollaboratorsTable,
  ListsTable,
  TodosTable,
  UsersTable,
} from "../../../drizzle/schema";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import {
  createTaggedList,
  createTaggedListUser,
  type List,
  type ListUser,
} from "@/lib/types";
import { canViewList, userCanEditList } from "@/app/lists/_actions/permissions";
import { getCollaborators } from "./collaborators";
import { requireAuth } from "./require-auth";

export type Todo = typeof TodosTable.$inferSelect;

async function getAcceptedCollaborators(
  listId: List["id"]
): Promise<ListUser[]> {
  const db = drizzle(sql);
  const collaboratorsFromDb = await db
    .select({
      id: UsersTable.id,
      name: UsersTable.name,
      email: UsersTable.email,
      role: ListCollaboratorsTable.role,
      listId: ListCollaboratorsTable.listId,
    })
    .from(ListCollaboratorsTable)
    .innerJoin(UsersTable, eq(ListCollaboratorsTable.userId, UsersTable.id))
    .where(
      and(
        eq(ListCollaboratorsTable.listId, listId),
        eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
      )
    );

  return collaboratorsFromDb.map(createTaggedListUser);
}



async function requireListViewAccess(listId: List["id"]) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const db = drizzle(sql);
  const [list] = await db
    .select()
    .from(ListsTable)
    .where(eq(ListsTable.id, listId))
    .limit(1);

  if (!list) {
    throw new Error("List not found.");
  }

  const collaborators = await getAcceptedCollaborators(listId);
  if (!canViewList(createTaggedList(list), collaborators, userId)) {
    if (!userId) {
      throw new Error("Authentication required.");
    }
    throw new Error("You do not have permission to view this list.");
  }
}

async function requireTodoAccess(todoId: Todo["id"]): Promise<Todo> {
  const db = drizzle(sql);
  const [todo] = await db
    .select()
    .from(TodosTable)
    .where(eq(TodosTable.id, todoId))
    .limit(1);

  if (!todo) {
    throw new Error("Todo not found.");
  }

  await requireListEditAccess(todo.listId as List["id"]);
  return todo;
}

async function requireListEditAccess(listId: List["id"]) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(listId);

  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }
}

export async function createTodo(
  todo: Pick<Todo, "title" | "status" | "listId">
) {
  await requireListEditAccess(todo.listId as List["id"]);
  const db = drizzle(sql);
  const [newTodo] = await db.insert(TodosTable).values(todo).returning();

  revalidatePath(`/lists/${newTodo.listId}`);
  return newTodo;
}

export async function updateTodoStatus(
  todoId: Todo["id"],
  newStatus: Todo["status"]
) {
  const todo = await requireTodoAccess(todoId);
  const db = drizzle(sql);
  await db
    .update(TodosTable)
    .set({ status: newStatus })
    .where(eq(TodosTable.id, todoId));
  revalidatePath(`/lists/${todo.listId}`);
  return newStatus;
}

export async function updateTodoTitle(
  todoId: Todo["id"],
  newTitle: Todo["title"]
) {
  const todo = await requireTodoAccess(todoId);
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
  const todo = await requireTodoAccess(todoId);
  const db = drizzle(sql);
  await db
    .update(TodosTable)
    .set({ status: "deleted" })
    .where(eq(TodosTable.id, todoId));
  revalidatePath(`/lists/${todo.listId}`);
}

/**
 * Get all todos from one list given listId
 */
export async function getTodos(listId: List["id"]) {
  await requireListViewAccess(listId);
  const db = drizzle(sql);
  const todos = await db
    .select()
    .from(TodosTable)
    .where(eq(TodosTable.listId, listId));
  return todos;
}
