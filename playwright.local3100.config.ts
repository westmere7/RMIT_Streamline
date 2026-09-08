import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

/**
 * The same suite against a production build already running on 3100 (started by
 * hand with `next start`). Next refuses a second `next dev` in this directory,
 * so this is how the suite runs while someone else's dev server holds 3000.
 */
export default defineConfig({
  ...base,
  webServer: undefined,
  use: { ...base.use, baseURL: "http://localhost:3100" },
});
