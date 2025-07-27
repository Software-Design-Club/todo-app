import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListsTable, ListCollaboratorsTable } from "./schema";

async function backfillListCollaborators() {
  console.log("Starting backfill of ListCollaborators table...");

  const db = drizzle(sql);

  try {
    // Get all lists with their creator information
    const lists = await db
      .select({
        id: ListsTable.id,
        creatorId: ListsTable.creatorId,
      })
      .from(ListsTable);

    console.log(`Found ${lists.length} lists to backfill`);

    let upsertedCount = 0;

    for (const list of lists) {
      try {
        // Upsert the creator as an owner
        await db
          .insert(ListCollaboratorsTable)
          .values({
            listId: list.id,
            userId: list.creatorId,
            role: "owner",
          })
          .onConflictDoUpdate({
            target: [
              ListCollaboratorsTable.listId,
              ListCollaboratorsTable.userId,
            ],
            set: {
              role: "owner",
              updatedAt: new Date(),
            },
          });

        console.log(`Upserted owner record for list ${list.id}`);
        upsertedCount++;
      } catch (error) {
        console.error(`Error processing list ${list.id}:`, error);
      }
    }

    console.log(`Backfill completed!`);
    console.log(`- Upserted: ${upsertedCount} records`);
  } catch (error) {
    console.error("Error during backfill:", error);
    throw error;
  }
}

// Run the backfill if this script is executed directly
if (require.main === module) {
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
