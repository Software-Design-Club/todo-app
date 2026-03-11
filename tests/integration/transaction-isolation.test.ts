import { describe, expect, it } from "vitest";
import { getIntegrationSqlClient } from "../setup/integration";

const isolatedEmail = `integration-isolation-${Date.now()}@example.com`;

describe("integration transaction isolation", () => {
  it("allows writes inside the active test transaction", async () => {
    const client = getIntegrationSqlClient();
    const result = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Isolation Test User', ${isolatedEmail}, 'active')
      returning id
    `;

    expect(result.rows[0]?.id).toBeTypeOf("number");
  });

  it("rolls back writes before the next test starts", async () => {
    const client = getIntegrationSqlClient();
    const result = await client.sql`
      select 1
      from todo_users
      where email = ${isolatedEmail}
      limit 1
    `;

    expect(result.rows).toHaveLength(0);
  });
});
