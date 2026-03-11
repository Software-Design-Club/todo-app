import { defineConfig } from "@playwright/test";

const port = 3001;
const baseURL = `http://localhost:${port}`;
const webServerCommand =
  `E2E_AUTH_ENABLED=1 INVITATION_EMAIL_SERVICE=test-stub ` +
  `RESEND_API_KEY=test-resend-key EMAIL_FROM=e2e@example.com ` +
  `APP_BASE_URL=${baseURL} npm run dev -- --port ${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: webServerCommand,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
