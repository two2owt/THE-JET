import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for JET auth e2e tests.
 * Runs against the running Vite dev server (localhost:8080).
 * Start the dev server separately with `bun run dev` before invoking
 * `bunx playwright test`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});