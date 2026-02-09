import { loadEnvConfig } from "@next/env";
import { sql } from "@vercel/postgres";
import { expect, test } from "@playwright/test";

loadEnvConfig(process.cwd());

test("public list is viewable without authentication", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const ownerEmail = `public-list-owner-${suffix}@example.com`;
  const ownerName = `Public List Owner ${suffix}`;
  const listTitle = `Public List ${suffix}`;
  const todoTitle = `Public Todo ${suffix}`;

  const ownerResult = await sql<{ id: number }>`
    INSERT INTO "todo_users" ("name", "email")
    VALUES (${ownerName}, ${ownerEmail})
    RETURNING "id"
  `;
  const ownerId = ownerResult.rows[0]?.id;
  if (!ownerId) {
    throw new Error("Failed to create e2e owner user.");
  }

  const listResult = await sql<{ id: number }>`
    INSERT INTO "lists" ("title", "creatorId", "visibility", "state")
    VALUES (${listTitle}, ${ownerId}, 'public', 'active')
    RETURNING "id"
  `;
  const listId = listResult.rows[0]?.id;
  if (!listId) {
    throw new Error("Failed to create e2e public list.");
  }

  await sql`
    INSERT INTO "list_collaborators" (
      "listId",
      "userId",
      "role",
      "inviteStatus",
      "inviteAcceptedAt"
    )
    VALUES (${listId}, ${ownerId}, 'owner', 'accepted', NOW())
    ON CONFLICT ("listId", "userId") DO NOTHING
  `;

  await sql`
    INSERT INTO "todos" ("title", "listId", "status")
    VALUES (${todoTitle}, ${listId}, 'not started')
  `;

  try {
    const response = await page.goto(`/lists/${listId}`);

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
    await expect(page.getByRole("heading", { name: listTitle })).toBeVisible();
    await expect(page.getByText(todoTitle)).toBeVisible();
    await expect(page).not.toHaveURL(/\/sign-in/);
  } finally {
    await sql`DELETE FROM "lists" WHERE "id" = ${listId}`;
    await sql`DELETE FROM "todo_users" WHERE "id" = ${ownerId}`;
  }
});
