#!/usr/bin/env node
/**
 * Runs the Supabase audit suite (tests/e2e/supabase-smoke.spec.ts) against a
 * dev server in supabase mode. The regular `npm run test:e2e` pins the local
 * provider, so this is a separate entry point.
 *
 *   npm run test:e2e:supabase
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/supabase-smoke.spec.ts", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, E2E_PROVIDER: "supabase", PW_PROVIDER: "supabase" },
  },
);
process.exit(result.status ?? 1);
