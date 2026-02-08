import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListsTable } from "./schema";
import { upsertListOwnerCollaborator } from "./ownerCollaborator";
import type { List, User } from "../lib/types";

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
        await upsertListOwnerCollaborator(db, {
          listId: list.id as List["id"],
          ownerId: list.creatorId as User["id"],
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
