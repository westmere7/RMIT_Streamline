#!/usr/bin/env node
/**
 * Puts a "Stakeholder" column on every live board and fills it in, so the new
 * column type can be seen against real work.
 *
 *   node scripts/add-stakeholder-column.mjs           add and populate
 *   node scripts/add-stakeholder-column.mjs --dry     say what it would do
 *   node scripts/add-stakeholder-column.mjs --undo    take the columns away again
 *
 * Additive by design (see the top-up seed): it never touches a board that
 * already has the column, and it only writes cells that are empty. Which group
 * an item lands in is decided from its board and its own name, so the result
 * reads like someone filled it in rather than a shuffle.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
for (const file of [".env.local", ".env"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const dry = process.argv.includes("--dry");
const undo = process.argv.includes("--undo");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Words in a task's name that say who it is for, strongest match first. */
const HINTS = [
  [/\b(web|site|page|navigation|seo|url|browser|accessib|wcag|breadcrumb|footer|header|search)\b/i, "Web"],
  [/\b(social|instagram|tiktok|facebook|linkedin|reel|story|post)\b/i, "Digital"],
  [/\b(event|open day|expo|ceremony|orientation|festival|booth|signage|wayfinding)\b/i, "Event"],
  [/\b(newsletter|edm|email|announcement|press|media|comms?|statement)\b/i, "Comm."],
  [/\b(content|copy|article|story|blog|guide|editorial|script|caption)\b/i, "Contents"],
];

/** When the name says nothing, the board it lives on does. */
const BY_BOARD = {
  "website-redesign": "Web",
  "always-on-content": "Contents",
  "semester-1-campaign": "Comm.",
  "open-day-2026": "Event",
  "dooh-production": "Event",
  "brand-guidelines-refresh": "Contents",
  "masterclass-assets": "Event",
  "rmitinerary-2026": "Contents",
  "creative-request-vn": "Comm.",
  "task-allocation": "Comm.",
};

/** "Event" and "Events", "Comm." and "Comms" are the same group to a person. */
const loose = (name) => name.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "");

function groupFor(itemName, boardSlug, known, fallback) {
  const wanted = HINTS.find(([pattern]) => pattern.test(itemName))?.[1] ?? BY_BOARD[boardSlug] ?? fallback;
  return known.find((group) => loose(group) === loose(wanted)) ?? fallback;
}

async function main() {
  const { data: workspaces } = await db.from("workspaces").select("id, slug").limit(1);
  const workspace = workspaces?.[0];
  if (!workspace) throw new Error("No workspace found.");

  const { data: listRows } = await db.from("workspace_lists").select("name, position").eq("workspace_id", workspace.id).eq("list_key", "STAKEHOLDER_GROUPS").order("position");
  const groups = (listRows ?? []).map((r) => r.name);
  const known = groups.length ? groups : ["Comm.", "Event", "Contents", "Digital", "Web"];
  console.log(`Stakeholder groups: ${known.join(", ")}`);

  const { data: boards, error: boardsError } = await db.from("boards").select("id, name, slug, system").eq("workspace_id", workspace.id).is("archived_at", null);
  if (boardsError) throw new Error(boardsError.message);
  const live = (boards ?? []).filter((b) => !b.system);
  console.log(`${live.length} live board(s).`);

  if (undo) {
    const { data: columns } = await db.from("board_columns").select("id, board_id").eq("type", "STAKEHOLDER");
    const ids = (columns ?? []).map((c) => c.id);
    console.log(`${dry ? "Would remove" : "Removing"} ${ids.length} Stakeholder column(s).`);
    if (!dry && ids.length) await db.from("board_columns").delete().in("id", ids);
    return;
  }

  for (const board of live) {
    const { data: columns } = await db.from("board_columns").select("id, type, position").eq("board_id", board.id);
    const existing = (columns ?? []).find((c) => c.type === "STAKEHOLDER");
    let columnId = existing?.id ?? null;

    if (!columnId) {
      const position = Math.max(0, ...(columns ?? []).map((c) => c.position)) + 1;
      if (dry) {
        console.log(`+ ${board.name}: would add a Stakeholder column at ${position}`);
      } else {
        const { data: created, error } = await db
          .from("board_columns")
          .insert({ board_id: board.id, name: "Stakeholder", type: "STAKEHOLDER", settings: { kind: "none" }, position, width: 160, hidden: false })
          .select("id")
          .single();
        if (error) throw new Error(`${board.name}: ${error.message}`);
        columnId = created.id;
        console.log(`+ ${board.name}: Stakeholder column added`);
      }
    } else {
      console.log(`= ${board.name}: already has one`);
    }
    if (!columnId) continue;

    const { data: items } = await db.from("items").select("id, name").eq("board_id", board.id).is("archived_at", null);
    const { data: filled } = await db.from("item_column_values").select("item_id").eq("column_id", columnId);
    const already = new Set((filled ?? []).map((v) => v.item_id));
    const rows = [];
    for (const [index, item] of (items ?? []).entries()) {
      if (already.has(item.id)) continue;
      const group = groupFor(item.name, board.slug, known, known[index % known.length]);
      rows.push({ item_id: item.id, column_id: columnId, value_json: { type: "STAKEHOLDER", group } });
    }
    if (rows.length === 0) {
      console.log(`  ${board.name}: nothing to fill in`);
      continue;
    }
    if (dry) {
      console.log(`  ${board.name}: would fill ${rows.length} cell(s)`);
      continue;
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("item_column_values").upsert(rows.slice(i, i + 200), { onConflict: "item_id,column_id" });
      if (error) throw new Error(`${board.name}: ${error.message}`);
    }
    console.log(`  ${board.name}: ${rows.length} cell(s) filled`);
  }
}

await main();
