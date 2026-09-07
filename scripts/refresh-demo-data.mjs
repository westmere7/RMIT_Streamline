/**
 * One-off maintenance on the live demo data, to catch it up with two changes the
 * code has made. Safe to run twice: the second run matches nothing. From the
 * repo root:  node scripts/refresh-demo-data.mjs
 *
 *   1. The word "studio" is gone from the app, so it goes from the data too,
 *      using exactly the wording the seed files now use.
 *   2. Asset lines gained a tick. Lines on work that is already Done are ticked
 *      off, so the new progress bar tells the truth about finished jobs.
 */
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false });

// ---- 1. The wording ---------------------------------------------------------------
/** Longest match first, so "Studio Coordinator" is not eaten by a shorter rule. */
const WORDING = [
  ["Vietnam Studio Production Log", "Vietnam Production Log"],
  ["Studio safety induction video", "Workshop safety induction video"],
  ["Design and production studio", "Design and production team"],
  ["Ho Chi Minh City studio", "Ho Chi Minh City team"],
  ["open studio A-frame signs", "open workshop A-frame signs"],
  ["open-studio-a-frame-signs", "open-workshop-a-frame-signs"],
  ["studio review invitation", "design review invitation"],
  ["Film job for the studio:", "Film job for the team:"],
  ["From the studio floor", "From the workroom floor"],
  ["Studio Coordination", "Creative Coordination"],
  ["Studio Coordinator", "Production Coordinator"],
  ["jewellery studio", "jewellery workshop"],
  ["fashion studio", "fashion workroom"],
  ["Vietnam studio", "Vietnam team"],
  ["studio record", "on-camera record"],
  ["TV studio", "broadcast set"],
];

const quote = (value) => `'${value.replace(/'/g, "''")}'`;
const rewrite = (column) => WORDING.reduce((acc, [from, to]) => `replace(${acc}, ${quote(from)}, ${quote(to)})`, column);

/** Every column the word was found in; jsonb ones go through text and back. */
const TARGETS = [
  ["boards", "description", false],
  ["comments", "body", false],
  ["items", "description", false],
  ["items", "name", false],
  ["notifications", "body", false],
  ["notifications", "title", false],
  ["profiles", "job_title", false],
  ["teams", "description", false],
  ["trackers", "description", false],
  ["trackers", "name", false],
  ["item_column_values", "value_json", true],
  ["tracker_sheets", "rows", true],
  ["activities", "metadata", true],
];

console.log("wording:");
await sql.begin(async (tx) => {
  for (const [table, column, isJson] of TARGETS) {
    const source = isJson ? `"${column}"::text` : `"${column}"`;
    const value = isJson ? `(${rewrite(source)})::jsonb` : rewrite(source);
    const result = await tx.unsafe(`update public."${table}" set "${column}" = ${value} where "${column}"::text ilike '%studio%'`);
    if (result.count) console.log(`  ${table}.${column}: ${result.count}`);
  }
});

let left = 0;
for (const [table, column] of TARGETS) {
  const [row] = await sql.unsafe(`select count(*)::int as n from public."${table}" where "${column}"::text ilike '%studio%'`);
  left += row.n;
  if (row.n) console.log(`  still there: ${table}.${column} (${row.n})`);
}
console.log(left === 0 ? "  the word is gone" : "  leftovers above");

// ---- 2. Finished work is ticked off -------------------------------------------------
const ticked = await sql`
  update public.item_assets a
     set completed_at = i.updated_at
    from public.items i
    join public.item_column_values v on v.item_id = i.id
    join public.board_columns c on c.id = v.column_id and c.type = 'STATUS'
   where a.item_id = i.id
     and a.completed_at is null
     and v.value_json->>'labelId' = 'done'`;
console.log(`asset lines ticked off on delivered work: ${ticked.count}`);

await sql.end();
