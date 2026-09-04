#!/usr/bin/env node
/**
 * Applies every SQL file under supabase/ to the database in SUPABASE_DB_URL,
 * once, in order, and records what it did in public.schema_migrations.
 *
 *   npm run db:migrate          apply anything pending
 *   npm run db:migrate -- --dry list what would be applied, change nothing
 *   npm run db:migrate -- --baseline
 *                               record every file as applied without running it
 *                               (for a database that already has the schema)
 *
 * Order is migrations/ then policies/, lexicographic within each — so new files
 * only need a higher numeric prefix. Adding one and running the script (or
 * `npm run dev`, which calls it) is the whole workflow; nothing here needs a
 * dashboard visit.
 *
 * Each file runs inside a transaction, so a failure leaves nothing half-applied.
 * Applied files are fingerprinted: editing one after the fact is reported rather
 * than silently ignored, because the database no longer matches the repo.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORIES = ["supabase/migrations", "supabase/policies"];

function loadEnv() {
  // Next.js loads .env.local for the app; a plain node script has to do it itself.
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
}

function collectFiles() {
  const files = [];
  for (const dir of DIRECTORIES) {
    const absolute = join(ROOT, dir);
    if (!existsSync(absolute)) continue;
    const names = readdirSync(absolute)
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "en"));
    for (const name of names) {
      const path = join(absolute, name);
      const sql = readFileSync(path, "utf8");
      files.push({
        name: `${dir.replace("supabase/", "")}/${name}`,
        path,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
      });
    }
  }
  return files;
}

/** One migrating process at a time; a second build waits instead of racing. */
async function withLock(sql, work) {
  // 8163 is an arbitrary constant shared by every runner against this database.
  await sql`select pg_advisory_lock(8163)`;
  try {
    return await work();
  } finally {
    await sql`select pg_advisory_unlock(8163)`;
  }
}

async function ensureLedger(sql) {
  await sql`
    create table if not exists public.schema_migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `;
  // The ledger is infrastructure: no client should ever read it.
  await sql`alter table public.schema_migrations enable row level security`;
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry") || argv.includes("--dry-run");
  const baseline = argv.includes("--baseline");

  if (process.env.SKIP_DB_MIGRATE === "1") {
    console.log("SKIP_DB_MIGRATE=1 — skipping migrations.");
    return;
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url && argv.includes("--if-configured")) {
    // Called from predev/prebuild: local-provider development has no database.
    return;
  }
  if (!url) {
    console.error(
      [
        "SUPABASE_DB_URL is not set.",
        "",
        "Supabase dashboard → Project Settings → Database → Connection string → URI,",
        "then put it in .env.local (the password is in that page's field):",
        "",
        "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
        "",
        "It is server-side only and .env.local is gitignored.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const files = collectFiles();
  if (files.length === 0) {
    console.log("No .sql files found under supabase/.");
    return;
  }

  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });
  try {
    try {
      await sql`select 1`;
    } catch (error) {
      const code = error?.code ?? "";
      console.error(
        [
          `Could not connect to the database: ${error?.message ?? error}`,
          "",
          "Common causes in CI:",
          "  · the direct connection string (db.<ref>.supabase.co) is IPv6-only —",
          "    use Connect → Session pooler instead (port 5432, user postgres.<ref>)",
          "  · the password in the URI is not percent-encoded (@ : / ? # → %40 %3A %2F %3F %23)",
          "  · the URI is missing sslmode=require",
          "",
          "Set SKIP_DB_MIGRATE=1 to deploy without applying migrations.",
          code ? `(driver code: ${code})` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      process.exitCode = 1;
      return;
    }

    await withLock(sql, async () => {
    await ensureLedger(sql);
    const applied = new Map((await sql`select name, checksum from public.schema_migrations`).map((r) => [r.name, r.checksum]));

    const drifted = files.filter((f) => applied.has(f.name) && applied.get(f.name) !== f.checksum);
    for (const file of drifted) {
      console.warn(`! ${file.name} changed since it was applied (database still has the old version).`);
    }

    const pending = files.filter((f) => !applied.has(f.name));
    if (pending.length === 0) {
      console.log(`Up to date — ${files.length} file(s) already applied.`);
      return;
    }

    if (dry) {
      console.log("Pending:");
      for (const file of pending) console.log(`  ${file.name}`);
      return;
    }

    for (const file of pending) {
      if (baseline) {
        await sql`insert into public.schema_migrations ${sql({ name: file.name, checksum: file.checksum })}`;
        console.log(`= ${file.name} (marked applied, not run)`);
        continue;
      }
      const started = Date.now();
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(file.sql);
          await tx`insert into public.schema_migrations ${tx({ name: file.name, checksum: file.checksum })}`;
        });
        console.log(`+ ${file.name} (${Date.now() - started}ms)`);
      } catch (error) {
        console.error(`\nFailed on ${relative(ROOT, file.path)}:\n${error?.message ?? error}\n`);
        console.error("Nothing from that file was applied. Fix it and run the command again.");
        process.exitCode = 1;
        return;
      }
    }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
