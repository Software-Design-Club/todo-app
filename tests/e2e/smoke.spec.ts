import { expect, test } from "@playwright/test";

test("sign-in page renders with GitHub button", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in with github/i })
  ).toBeVisible();
});

test("unauthenticated homepage redirects to sign-in", async ({ page }) => {
  await page.goto("/");

  await page.waitForURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});
