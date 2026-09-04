import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    // The IndexedDB suite always runs on the local provider, even when
    // .env.local points the app at Supabase. The Supabase audit suite sets
    // PW_PROVIDER=supabase (npm run test:e2e:supabase) to override that.
    env: { NEXT_PUBLIC_DATA_PROVIDER: process.env.PW_PROVIDER ?? "local" },
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
