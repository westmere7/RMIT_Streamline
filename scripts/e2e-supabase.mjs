#!/usr/bin/env node
/**
 * Runs the Supabase audit suite (tests/e2e/supabase-smoke.spec.ts) against a
 * dev server in supabase mode. The regular `npm run test:e2e` pins the local
 * provider, so this is a separate entry point.
 *
 *   npm run test:e2e:supabase
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The suite talks to PostgREST directly for the row-level-security check, so the
// project URL and anon key have to reach the test process too, not just Next.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
for (const file of [".env.local", ".env"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

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
