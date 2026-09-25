#!/usr/bin/env tsx
/**
 * Gives every board the special columns it is missing (see
 * BoardService.ensureSpecialColumns): Status, PIC, Due date, Timeline,
 * Priority, Department, Size, Assets recap and Brief, one of each, showing.
 *
 * New boards get them when they are made. This is for boards made before every
 * board held them. It goes through the board service rather than SQL, so a
 * Brief arrives filled from the board's bookings and an Assets recap from its
 * deliverables. Safe to run again: a board that has them all is left alone,
 * and one it took off stays off.
 *
 *   npm run db:special-columns -- --dry   list what would be added, change nothing
 *   npm run db:special-columns            add it
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local),
 * and migration 0075 applied.
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
    const key = match?.[1];
    if (!key || process.env[key]) continue;
    process.env[key] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
}

const dry = process.argv.includes("--dry");
const { SPECIAL_BOARD_COLUMN_TYPES, COLUMN_TYPE_LABELS } = await import("../src/domain/board/column");
const { routeRepositoriesThrough } = await import("../src/data/supabase/client");
const { createSupabaseRepositories } = await import("../src/data/supabase");
const { getSupabaseAdminClient } = await import("../src/lib/supabase/admin");
const { createServices } = await import("../src/services");

routeRepositoriesThrough(getSupabaseAdminClient());
const services = createServices(createSupabaseRepositories());

const { data: workspaces, error } = await getSupabaseAdminClient().from("workspaces").select("id, name");
if (error) throw new Error(error.message);

let total = 0;
for (const workspace of workspaces ?? []) {
  for (const board of await services.repos.boards.listByWorkspace(workspace.id)) {
    const columns = await services.repos.boards.listColumns(board.id);
    const missing = SPECIAL_BOARD_COLUMN_TYPES.filter((type) => !columns.some((c) => c.type === type));
    if (missing.length === 0) continue;
    total += missing.length;
    if (dry) {
      console.log(`${workspace.name} / ${board.name}: would add ${missing.map((t) => COLUMN_TYPE_LABELS[t]).join(", ")}`);
      continue;
    }
    const added = await services.boards.ensureSpecialColumns(board.id);
    console.log(`${workspace.name} / ${board.name}: added ${added.map((c) => c.name).join(", ")}`);
  }
}
console.log(total === 0 ? "Every board already has every special column." : dry ? `${total} to add.` : `Added ${total}.`);
