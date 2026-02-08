import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListCollaboratorsTable } from "./schema";
import type { List, User } from "../lib/types";

type DatabaseClient = ReturnType<typeof drizzle>;
type CollaboratorRow = typeof ListCollaboratorsTable.$inferSelect;

export type OwnerCollaboratorRow = Omit<CollaboratorRow, "listId" | "userId"> & {
  listId: List["id"];
  userId: User["id"];
};

interface UpsertListOwnerCollaboratorParams {
  listId: List["id"];
  ownerId: User["id"];
}

export async function upsertListOwnerCollaborator(
  db: DatabaseClient,
  params: UpsertListOwnerCollaboratorParams
): Promise<OwnerCollaboratorRow | null> {
  const [ownerRow] = await db
    .insert(ListCollaboratorsTable)
    .values({
      listId: params.listId,
      userId: params.ownerId,
      role: "owner",
    })
    .onConflictDoUpdate({
      target: [ListCollaboratorsTable.listId, ListCollaboratorsTable.userId],
      set: {
        role: "owner",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!ownerRow) {
    return null;
  }

  return {
    ...ownerRow,
    listId: ownerRow.listId as List["id"],
    userId: ownerRow.userId as User["id"],
  };
}
