#!/usr/bin/env node
/**
 * One command to point the app at Supabase:
 *
 *   npm run db:setup
 *
 *   1. apply every pending SQL file      (scripts/db-migrate.mjs)
 *   2. create the demo accounts + seed   (scripts/db-seed.mjs, skipped with --no-seed)
 *   3. flip NEXT_PUBLIC_DATA_PROVIDER to "supabase" in .env.local
 *
 * Needs SUPABASE_DB_URL (and SUPABASE_SERVICE_ROLE_KEY for the seed) in .env.local.
 * Re-runnable: migrations already applied are skipped and the flip is idempotent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const skipSeed = process.argv.includes("--no-seed");

function run(script) {
  console.log(`\n── ${script}`);
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.error(`\n${script} failed — stopping before the provider is switched.`);
    process.exit(result.status ?? 1);
  }
}

/** The seed imports the TypeScript seed module, so it runs through tsx. */
function runSeed() {
  console.log(`\n── db-seed.mts`);
  const result = spawnSync("npx", ["tsx", join(ROOT, "scripts", "db-seed.mts")], {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\ndb-seed.mts failed — stopping before the provider is switched.`);
    process.exit(result.status ?? 1);
  }
}

function switchProviderToSupabase() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) {
    console.log("\n.env.local not found — set NEXT_PUBLIC_DATA_PROVIDER=supabase yourself.");
    return;
  }
  const before = readFileSync(path, "utf8");
  if (/^\s*NEXT_PUBLIC_DATA_PROVIDER\s*=\s*supabase\s*$/m.test(before)) {
    console.log("\nProvider already set to supabase.");
    return;
  }
  const after = /^\s*NEXT_PUBLIC_DATA_PROVIDER\s*=.*$/m.test(before)
    ? before.replace(/^\s*NEXT_PUBLIC_DATA_PROVIDER\s*=.*$/m, "NEXT_PUBLIC_DATA_PROVIDER=supabase")
    : `${before.trimEnd()}\nNEXT_PUBLIC_DATA_PROVIDER=supabase\n`;
  writeFileSync(path, after);
  console.log("\nSwitched .env.local to NEXT_PUBLIC_DATA_PROVIDER=supabase. Restart `npm run dev`.");
}

run("db-migrate.mjs");
if (!skipSeed) runSeed();
switchProviderToSupabase();
