import "./envConfig";
import { sql } from "@vercel/postgres";
import { isNull, ne, or, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { pathToFileURL } from "node:url";
import { ListsTable, ListCollaboratorsTable } from "./schema";

async function backfillListCollaborators() {
  console.log("Starting backfill of ListCollaborators table...");

  const db = drizzle(sql);

  try {
    const lists = await db
      .select({
        id: ListsTable.id,
        creatorId: ListsTable.creatorId,
      })
      .from(ListsTable);

    console.log(`Found ${lists.length} lists to backfill`);

    let normalizedCount = 0;

    for (const list of lists) {
      try {
        // Upsert the creator as an owner
        const normalizedRows = await db
          .insert(ListCollaboratorsTable)
          .values({
            listId: list.id,
            userId: list.creatorId,
            role: "owner",
            inviteStatus: "accepted",
            inviteAcceptedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              ListCollaboratorsTable.listId,
              ListCollaboratorsTable.userId,
            ],
            set: {
              role: "owner",
              inviteStatus: "accepted",
              inviteAcceptedAt: drizzleSql`COALESCE(${ListCollaboratorsTable.inviteAcceptedAt}, NOW())`,
              updatedAt: new Date(),
            },
            // Idempotence: skip update when row is already in the desired owner+accepted state.
            where: or(
              ne(ListCollaboratorsTable.role, "owner"),
              ne(ListCollaboratorsTable.inviteStatus, "accepted"),
              isNull(ListCollaboratorsTable.inviteAcceptedAt)
            ),
          });

        const rowCount = normalizedRows.rowCount ?? 0;

        if (rowCount > 0) {
          console.log(`Normalized owner record for list ${list.id}`);
          normalizedCount += rowCount;
        }
      } catch (error) {
        console.error(`Error processing list ${list.id}:`, error);
      }
    }

    console.log(`Backfill completed!`);
    console.log(`- Normalized: ${normalizedCount} records`);
  } catch (error) {
    console.error("Error during backfill:", error);
    throw error;
  }
}

function isExecutedDirectly() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}

// Run the backfill if this script is executed directly
if (isExecutedDirectly()) {
  backfillListCollaborators()
    .then(() => {
      console.log("Backfill script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Backfill script failed:", error);
      process.exit(1);
    });
}

export { backfillListCollaborators };
