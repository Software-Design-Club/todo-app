import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importFindOrCreateAccount() {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>(
        "@vercel/postgres",
      );

    return {
      ...actual,
      sql: client,
    };
  });

  return import(
    "../../../app/sign-in/_components/_actions/find-or-create-account"
  );
}

afterEach(() => {
  vi.doUnmock("next/cache");
  vi.doUnmock("@vercel/postgres");
  vi.resetModules();
});

describe("Phase 1a: findOrCreateAccount email normalization (Contract 1a.1)", () => {
  it("T1: stores a mixed-case email as lowercase (Alice@Example.com → alice@example.com)", async () => {
    const suffix = Date.now();
    const inputEmail = `Alice-${suffix}@Example.com`;
    const expectedEmail = `alice-${suffix}@example.com`;

    const { findOrCreateAccount } = await importFindOrCreateAccount();
    await findOrCreateAccount({ email: inputEmail });

    const client = getIntegrationSqlClient();
    const result = await client.sql<{ email: string }>`
      select email from todo_users where email = ${expectedEmail}
    `;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.email).toBe(expectedEmail);
  });

  it("T2: stores a padded email trimmed (\" bob@example.com \" → \"bob@example.com\")", async () => {
    const suffix = Date.now();
    const inputEmail = `  bob-${suffix}@example.com  `;
    const expectedEmail = `bob-${suffix}@example.com`;

    const { findOrCreateAccount } = await importFindOrCreateAccount();
    await findOrCreateAccount({ email: inputEmail });

    const client = getIntegrationSqlClient();
    const result = await client.sql<{ email: string }>`
      select email from todo_users where email = ${expectedEmail}
    `;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.email).toBe(expectedEmail);
  });

  it("T3: calling findOrCreateAccount twice with the same email inserts exactly one row (idempotent)", async () => {
    const suffix = Date.now();
    const inputEmail = `carol-${suffix}@example.com`;

    const { findOrCreateAccount } = await importFindOrCreateAccount();
    await findOrCreateAccount({ email: inputEmail });
    await findOrCreateAccount({ email: inputEmail });

    const client = getIntegrationSqlClient();
    const result = await client.sql<{ email: string }>`
      select email from todo_users where email = ${inputEmail}
    `;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.email).toBe(inputEmail);
  });
});
