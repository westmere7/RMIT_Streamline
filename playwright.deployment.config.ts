import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test for a deployed build. No dev server: it drives whatever is at
 * E2E_BASE_URL (the Vercel app by default), signed in with a seeded account.
 *
 *   npm run test:e2e:deployment
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /deployment-smoke\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://rmit-streamline.vercel.app",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
