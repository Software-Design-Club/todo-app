import { expect, test } from "@playwright/test";

test("sign-in page renders the smoke path @smoke", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with GitHub" }),
  ).toBeVisible();
});
