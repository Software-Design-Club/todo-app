import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListsTable } from "./schema";
import { upsertOwnerCollaborator } from "@/lib/lists/owner-collaborators";
import type { List, User } from "@/lib/types";

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
  const lists = await db
    .select({
      id: ListsTable.id,
      creatorId: ListsTable.creatorId,
    })
    .from(ListsTable);

  const report = {
    scanned: lists.length,
    inserted: 0,
    repaired: 0,
    unchanged: 0,
  };

  for (const list of lists) {
    const result = await upsertOwnerCollaborator({
      listId: list.id as List["id"],
      ownerId: list.creatorId as User["id"],
    });
    report[result] += 1;
  }

  return report;
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
