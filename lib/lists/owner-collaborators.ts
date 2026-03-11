import { sql } from "@vercel/postgres";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import {
  ListCollaboratorsTable,
  ListsTable,
  UsersTable,
} from "@/drizzle/schema";
import { ListNotFoundError, UserNotFoundError } from "@/lib/errors";
import type { List, User } from "@/lib/types";

export type OwnerCollaboratorUpsertResult =
  | "inserted"
  | "repaired"
  | "unchanged";

/**
 * @contract upsertOwnerCollaborator
 *
 * Ensures exactly one accepted owner collaborator row exists for a (listId, ownerId) pair.
 *
 * @param input.listId - The list to ensure ownership for.
 * @param input.ownerId - The user who must be the owner.
 * @returns "inserted" if a new row was created, "repaired" if an existing row was
 * corrected, "unchanged" if the row already existed correctly.
 *
 * @effects
 * - After return, exactly one `list_collaborators` row exists for (listId, ownerId)
 *   with role="owner".
 * - The owner row is usable by the same collaborator read path used elsewhere.
 * - Repeated calls do not create duplicate accepted owner memberships.
 * - Unrelated collaborator rows are not modified.
 *
 * @throws ListNotFoundError if listId does not identify an existing list.
 * @throws UserNotFoundError if ownerId does not identify an existing user.
 */
export async function upsertOwnerCollaborator(input: {
  listId: List["id"];
  ownerId: User["id"];
}): Promise<OwnerCollaboratorUpsertResult> {
  const db = drizzle(sql);
  const [list] = await db
    .select({ id: ListsTable.id })
    .from(ListsTable)
    .where(eq(ListsTable.id, input.listId))
    .limit(1);

  if (!list) {
    throw new ListNotFoundError(Number(input.listId));
  }

  const [owner] = await db
    .select({ id: UsersTable.id })
    .from(UsersTable)
    .where(eq(UsersTable.id, input.ownerId))
    .limit(1);

  if (!owner) {
    throw new UserNotFoundError(Number(input.ownerId));
  }

  const [existingCollaborator] = await db
    .select({
      id: ListCollaboratorsTable.id,
      role: ListCollaboratorsTable.role,
    })
    .from(ListCollaboratorsTable)
    .where(
      and(
        eq(ListCollaboratorsTable.listId, input.listId),
        eq(ListCollaboratorsTable.userId, input.ownerId),
      ),
    )
    .limit(1);

  if (!existingCollaborator) {
    await db.insert(ListCollaboratorsTable).values({
      listId: input.listId,
      userId: input.ownerId,
      role: "owner",
    });

    return "inserted";
  }

  if (existingCollaborator.role === "owner") {
    return "unchanged";
  }

  await db
    .update(ListCollaboratorsTable)
    .set({
      role: "owner",
      updatedAt: new Date(),
    })
    .where(eq(ListCollaboratorsTable.id, existingCollaborator.id));

  return "repaired";
}
