import { describe, expect, it } from "vitest";
import { getIntegrationSqlClient } from "../setup/integration";

describe("integration harness smoke", () => {
  it("runs the integration test harness with a transaction-scoped database client", async () => {
    const client = getIntegrationSqlClient();
    const result = await client.sql<{ value: number }>`select 1 as value`;

    expect(result.rows[0]?.value).toBe(1);
  });
});
