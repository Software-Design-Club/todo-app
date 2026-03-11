import type { BrowserContext } from "@playwright/test";

const E2E_AUTH_COOKIE_NAME = "todo-e2e-auth-email";

export async function authenticateAs(context: BrowserContext, email: string) {
  await context.addCookies([
    {
      name: E2E_AUTH_COOKIE_NAME,
      value: email,
      url: "http://localhost:3001",
    },
  ]);
}
