#!/usr/bin/env tsx
/**
 * Rehearses a restore against the database in SUPABASE_DB_URL without changing it.
 *
 * Takes a snapshot the way the Settings page does (src/server/snapshots.ts),
 * then, inside one transaction, empties every table and refills it from that
 * snapshot, compares each table with what it held before, and rolls the whole
 * thing back. A clean run proves every table's rows survive the trip through
 * the file: types, arrays, enums, generated columns and all.
 *
 * Every table is locked for the few seconds it takes, so run it when nobody is
 * mid-edit. Nothing is written: not the tables, not a snapshot row.
 *
 *   npm run db:snapshot:rehearse
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
for (const file of [".env.local", ".env"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
}

const { default: postgres } = await import("postgres");
const { capture, readSnapshotFile, refill } = await import("../src/server/snapshots");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

/** One line per table: how many rows, and a digest of all of them in a fixed order. */
async function fingerprints(tx: postgres.Sql | postgres.TransactionSql, tables: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const table of tables) {
    const [row] = await tx.unsafe<{ n: number; digest: string }[]>(`select count(*)::int as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as digest from public."${table}" t`);
    out.set(table, `${row?.n ?? 0}:${row?.digest ?? ""}`);
  }
  return out;
}

class Rollback extends Error {}

try {
  const started = Date.now();
  const captured = await capture({ name: "Rehearsal", createdAt: new Date().toISOString(), createdByName: "snapshot-rehearsal" });
  const doc = readSnapshotFile(captured.file);
  const tables = Object.keys(doc.tables).sort();
  console.log(`Captured ${captured.rowCount.toLocaleString()} rows in ${tables.length} tables, ${(captured.file.length / 1024).toFixed(0)} KB gzipped (${Date.now() - started} ms).`);

  const before = await fingerprints(sql, tables);
  let report = "";
  try {
    await sql.begin(async (tx) => {
      const t0 = Date.now();
      const { rowCount, skippedTables } = await refill(tx, doc);
      const refillMs = Date.now() - t0;
      const after = await fingerprints(tx, tables);
      const differ = tables.filter((t) => before.get(t) !== after.get(t));
      report = [
        `Refilled ${rowCount.toLocaleString()} rows in ${refillMs} ms.`,
        skippedTables.length ? `Skipped (not in this schema): ${skippedTables.join(", ")}` : "No tables skipped.",
        differ.length ? `DIFFERENT after refill: ${differ.map((t) => `${t} (${before.get(t)} → ${after.get(t)})`).join("; ")}` : "Every table matches what it held before.",
      ].join("\n");
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  console.log(report);
  console.log("Rolled back: nothing was changed.");
  if (report.includes("DIFFERENT")) process.exitCode = 1;
} catch (error) {
  console.error("Rehearsal failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
  process.exit(process.exitCode ?? 0);
}
