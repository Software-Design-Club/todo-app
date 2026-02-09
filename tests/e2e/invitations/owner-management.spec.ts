import { expect, test } from "@playwright/test";

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
    await page.goto("/invite?token=test-token-123");

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
});
