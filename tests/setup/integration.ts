import "../../drizzle/envConfig";

import { sql, type VercelPoolClient } from "@vercel/postgres";
import { afterEach, beforeEach } from "vitest";

let activeClient: VercelPoolClient | null = null;

beforeEach(async () => {
  const client = await sql.connect();
  await client.sql`BEGIN`;
  activeClient = client;
});

afterEach(async () => {
  const client = activeClient;
  activeClient = null;

  if (!client) {
    return;
  }

  try {
    await client.sql`ROLLBACK`;
  } finally {
    client.release();
  }
});

export function getIntegrationSqlClient() {
  if (!activeClient) {
    throw new Error(
      "Integration database client is unavailable outside the active test transaction.",
    );
  }

  return activeClient;
}
