import { sql } from "@vercel/postgres";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListCollaboratorsTable, ListsTable } from "./schema";

/**
 * @contract backfillOwnerCollaborators
 *
 * Ensures every existing list has an accepted owner collaborator row for its creator.
 *
 * @returns A report of scanned, inserted, repaired, and unchanged counts.
 *
 * @effects
 * - After return, every existing list has an owner collaborator row.
 * - Running multiple times without intervening data changes does not create
 *   additional rows and does not change final database state after the first run.
 */
async function backfillOwnerCollaborators() {
  const db = drizzle(sql);
  return db.transaction(async (tx) => {
    const ownershipRows = await tx
      .select({
        listId: ListsTable.id,
        ownerId: ListsTable.creatorId,
        collaboratorId: ListCollaboratorsTable.id,
        role: ListCollaboratorsTable.role,
      })
      .from(ListsTable)
      .leftJoin(
        ListCollaboratorsTable,
        and(
          eq(ListCollaboratorsTable.listId, ListsTable.id),
          eq(ListCollaboratorsTable.userId, ListsTable.creatorId),
        ),
      );

    const missingOwners = ownershipRows.filter(
      (row) => row.collaboratorId === null,
    );
    const wrongRoleRows = ownershipRows.filter(
      (row) => row.collaboratorId !== null && row.role !== "owner",
    );

    if (missingOwners.length > 0) {
      await tx.insert(ListCollaboratorsTable).values(
        missingOwners.map((row) => ({
          listId: row.listId,
          userId: row.ownerId,
          role: "owner" as const,
        })),
      );
    }

    if (wrongRoleRows.length > 0) {
      await tx
        .update(ListCollaboratorsTable)
        .set({
          role: "owner",
          updatedAt: new Date(),
        })
        .where(
          inArray(
            ListCollaboratorsTable.id,
            wrongRoleRows.map((row) => row.collaboratorId!),
          ),
        );
    }

    return {
      scanned: ownershipRows.length,
      inserted: missingOwners.length,
      repaired: wrongRoleRows.length,
      unchanged:
        ownershipRows.length - missingOwners.length - wrongRoleRows.length,
    };
  });
}

// Run the backfill if this script is executed directly
if (require.main === module) {
  backfillOwnerCollaborators()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Backfill script failed:", error);
      process.exit(1);
    });
}

export { backfillOwnerCollaborators };
