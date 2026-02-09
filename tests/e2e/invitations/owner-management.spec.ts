import { loadEnvConfig } from "@next/env";
import { sql } from "@vercel/postgres";
import { expect, test } from "@playwright/test";

loadEnvConfig(process.cwd());

const AUTH_SESSION_COOKIE = "authjs.session-token";

async function createAuthSessionToken(params: {
  userId: number;
  email: string;
  name: string;
}) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET is required for authenticated e2e tests.");
  }

  const { encode } = await import("next-auth/jwt");

  return encode({
    secret: authSecret,
    salt: AUTH_SESSION_COOKIE,
    token: {
      sub: String(params.userId),
      email: params.email,
      name: params.name,
    },
  });
}

test.describe("invitation flows", () => {
  test("invite page without token shows invalid invitation message", async ({ page }) => {
    await page.goto("/invite");

    await expect(
      page.getByRole("heading", { name: "Invalid invitation" })
    ).toBeVisible();
    await expect(
      page.getByText("The invitation token is missing.")
    ).toBeVisible();
  });

  test("invite page with token redirects unauthenticated user to sign-in", async ({ page }) => {
    await page.goto("/invite?token=test-token-1234567890");

    await page.waitForURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { name: "Sign In" })
    ).toBeVisible();
  });

  test("collaborators page requires authentication", async ({ page }) => {
    await page.goto("/lists/collaborators");

    await page.waitForURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { name: "Sign In" })
    ).toBeVisible();
  });

  test("owner can create a list and access collaborators management", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
    const ownerEmail = `owner-collab-${suffix}@example.com`;
    const ownerName = `Owner Collaborator ${suffix}`;
    const listTitle = `Owner List ${suffix}`;

    const ownerResult = await sql<{ id: number }>`
      INSERT INTO "todo_users" ("name", "email")
      VALUES (${ownerName}, ${ownerEmail})
      RETURNING "id"
    `;
    const ownerId = ownerResult.rows[0]?.id;
    if (!ownerId) {
      throw new Error("Failed to create e2e owner user.");
    }

    try {
      const sessionToken = await createAuthSessionToken({
        userId: ownerId,
        email: ownerEmail,
        name: ownerName,
      });

      await page.context().addCookies([
        {
          name: AUTH_SESSION_COOKIE,
          value: sessionToken,
          url: "http://localhost:3000",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      await page.goto("/lists");
      await expect(
        page.getByRole("heading", { name: "My Todo Lists" })
      ).toBeVisible();

      await page.getByRole("button", { name: "+ New List" }).click();
      await page.getByPlaceholder("List name").fill(listTitle);
      await page.getByRole("button", { name: "Create" }).click();

      await expect(page.getByRole("link", { name: listTitle })).toBeVisible();

      const response = await page.goto("/lists/collaborators");
      const permissionErrors = page.getByText(
        "You do not have permission to view collaborators."
      );
      const permissionErrorCount = await permissionErrors.count();

      if (!response?.ok() || permissionErrorCount > 0) {
        await expect(permissionErrors.first()).toBeVisible();
        throw new Error(
          "Regression reproduced: owner hit collaborator permission denial."
        );
      }

      await expect(
        page.getByRole("heading", { name: "Collaborator Management" })
      ).toBeVisible();
    } finally {
      await sql`
        DELETE FROM "lists"
        WHERE "title" = ${listTitle}
          AND "creatorId" = ${ownerId}
      `;
      await sql`DELETE FROM "todo_users" WHERE "id" = ${ownerId}`;
    }
  });
});
