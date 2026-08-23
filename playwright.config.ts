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
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the system Chromium that ships in the sandbox; the bundled
        // browser revision Playwright expects isn't pre-installed.
        // On CI the Playwright-managed Chromium is used; locally the sandbox
        // exposes one at /bin/chromium via PLAYWRIGHT_CHROMIUM_PATH.
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
});
