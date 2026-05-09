import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against local Next dev or preview URL.
 *
 * Typical local run (two terminals):
 *   1) npm run dev
 *   2) PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e
 *
 * First time: npm run test:e2e:install
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL   default http://127.0.0.1:3000
 *   PLAYWRIGHT_SKIP_WEBSERVER  set to "1" if dev server already running
 *   E2E_USER / E2E_PASSWORD   seeded onboarded user (default lin / Password123)
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "en-US",
    ...devices["Pixel 5"],
  },
  projects: [{ name: "chromium", use: {} }],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        },
});
