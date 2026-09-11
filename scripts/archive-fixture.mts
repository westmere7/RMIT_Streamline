#!/usr/bin/env tsx
/**
 * A board with a big archive on it, for trying the archive screen out.
 *
 *   npx tsx scripts/archive-fixture.mts            # create it
 *   npx tsx scripts/archive-fixture.mts --remove   # take it away again
 *
 * Three hundred archived items and a handful of live ones, spread over four
 * groups, every owner, status, priority and tag the board has, and archived
 * over the last year rather than all in the same second — which is what makes
 * the pager, the filters and the ordering worth looking at.
 *
 * Everything it writes hangs off one board, and `--remove` deletes that board,
 * so nothing else in the workspace is touched either way. It is a fixture, not
 * a seed: delete this file once the archive has been signed off.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { DEFAULT_COLUMN_WIDTHS, defaultSettingsFor } from "../src/domain/board/column";
import { SEED_WORKSPACE_ID } from "../src/data/seed/seed-data";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BOARD_SLUG = "archive-load-test";
const ARCHIVED = 300;
const LIVE = 12;

function loadEnv(): void {
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
}

/** Deterministic, so two runs of the script produce the same board. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const GROUPS = [
  { name: "Semester 1", color: "blue" },
  { name: "Semester 2", color: "purple" },
  { name: "Open days", color: "green" },
  { name: "Always on", color: "orange" },
];

const STATUS_LABELS = [
  { id: "done", name: "Done", color: "green" },
  { id: "cancelled", name: "Cancelled", color: "red" },
  { id: "delivered", name: "Delivered", color: "teal" },
  { id: "on-hold", name: "On hold", color: "yellow" },
];

const PRIORITY_LABELS = ["urgent", "high", "medium", "low"];
const TAGS = ["Video", "Social", "Print", "DOOH", "Photography", "Copy", "Web", "Radio"];
const SUBJECTS = ["Open Day", "Semester intake", "Scholarship", "Alumni", "Research week", "Careers fair", "Graduation", "Orientation", "Masterclass", "Industry night", "Campus tour", "Info session"];
const ARTEFACTS = ["hero banner", "social cutdowns", "email header", "printed flyer", "digital screens", "landing page", "photo shoot", "radio spot", "lecture capture", "poster series", "brochure", "signage"];
const CAMPUSES = ["City", "Bundoora", "Brunswick", "Point Cook", "Vietnam"];

async function main(): Promise<void> {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL in .env.local");
    process.exit(1);
  }
  const remove = process.argv.includes("--remove");
  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });

  try {
    const existing = await sql<Array<{ id: string }>>`select id from public.boards where workspace_id = ${SEED_WORKSPACE_ID} and slug = ${BOARD_SLUG}`;

    if (remove) {
      if (existing.length === 0) {
        console.log("Nothing to remove: no board with that slug.");
        return;
      }
      // Items, values, groups and columns all cascade from the board row.
      await sql`delete from public.boards where id = ${existing[0]!.id}`;
      console.log(`Removed the fixture board (${existing[0]!.id}).`);
      return;
    }

    if (existing.length > 0) {
      console.error(`A board with slug "${BOARD_SLUG}" is already there (${existing[0]!.id}).\nRun with --remove first if you want a fresh one.`);
      process.exit(1);
    }

    const owners = await sql<Array<{ id: string }>>`
      select p.id from public.profiles p
      join public.workspace_members m on m.user_id = p.id
      where m.workspace_id = ${SEED_WORKSPACE_ID} and m.status = 'ACTIVE' and p.deactivated_at is null
      order by p.id limit 8`;
    if (owners.length === 0) {
      console.error("No active members in the workspace to own the items.");
      process.exit(1);
    }
    const ownerIds = owners.map((o) => o.id);

    const boardId = randomUUID();
    const random = makeRandom(20260911);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const json = (value: unknown) => sql.json(value as never);

    await sql.begin(async (tx) => {
      await tx`insert into public.boards ${tx({
        id: boardId,
        workspace_id: SEED_WORKSPACE_ID,
        team_id: null,
        name: "Archive load test",
        slug: BOARD_SLUG,
        description: "A fixture board: 300 archived items for trying the archive screen.",
        type: "MAIN",
        visibility: "WORKSPACE",
        owner_id: ownerIds[0]!,
        color: "gray",
        icon: "Archive",
        archived_at: null,
        system: null,
      })}`;

      const groupIds = GROUPS.map(() => randomUUID());
      await tx`insert into public.board_groups ${tx(
        GROUPS.map((group, index) => ({ id: groupIds[index]!, board_id: boardId, name: group.name, color: group.color, position: index, collapsed: false })),
      )}`;

      // The columns the archive's filters read: a status, a priority, an owner
      // and a tag column, plus a date so the cells have something to show.
      const columnSpecs = [
        { key: "status", name: "Status", type: "STATUS" as const, settings: { kind: "status" as const, labels: STATUS_LABELS, defaultLabelId: "done", doneLabelIds: ["done", "delivered"], stuckLabelIds: ["on-hold"] } },
        { key: "owner", name: "Owner", type: "PERSON" as const, settings: defaultSettingsFor("PERSON") },
        { key: "priority", name: "Priority", type: "PRIORITY" as const, settings: defaultSettingsFor("PRIORITY") },
        { key: "due", name: "Due date", type: "DATE" as const, settings: defaultSettingsFor("DATE") },
        { key: "channel", name: "Channel", type: "TAGS" as const, settings: { kind: "tags" as const, options: TAGS.map((name) => ({ name, color: "blue" })) } },
      ];
      const columnIds = new Map(columnSpecs.map((spec) => [spec.key, randomUUID()]));
      await tx`insert into public.board_columns ${tx(
        columnSpecs.map((spec, index) => ({
          id: columnIds.get(spec.key)!,
          board_id: boardId,
          name: spec.name,
          type: spec.type,
          settings: json(spec.settings),
          width: DEFAULT_COLUMN_WIDTHS[spec.type],
          hidden: false,
          position: index,
        })),
      )}`;

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const items: Array<Record<string, unknown>> = [];
      const values: Array<Record<string, unknown>> = [];

      for (let i = 0; i < ARCHIVED + LIVE; i += 1) {
        const archived = i < ARCHIVED;
        const id = randomUUID();
        const groupId = pick(groupIds);
        // Spread over the last year, and not evenly: a real archive is lumpy,
        // and the pager is more interesting when the dates are not a ladder.
        const archivedAt = archived ? new Date(now - Math.floor(random() ** 2 * 365) * day - Math.floor(random() * day)) : null;
        const createdAt = new Date((archivedAt?.getTime() ?? now) - Math.floor(random() * 90 + 7) * day);
        items.push({
          id,
          board_id: boardId,
          group_id: groupId,
          parent_item_id: null,
          name: `${pick(SUBJECTS)} ${pick(CAMPUSES)} — ${pick(ARTEFACTS)}`,
          description: null,
          position: i,
          created_by: pick(ownerIds),
          archived_at: archivedAt?.toISOString() ?? null,
          created_at: createdAt.toISOString(),
          updated_at: (archivedAt ?? new Date(now)).toISOString(),
        });

        const owners = random() < 0.15 ? [] : [pick(ownerIds), ...(random() < 0.25 ? [pick(ownerIds)] : [])];
        const tags = random() < 0.1 ? [] : [pick(TAGS), ...(random() < 0.3 ? [pick(TAGS)] : [])];
        const due = new Date((archivedAt?.getTime() ?? now) - Math.floor(random() * 30) * day);
        values.push(
          { id: randomUUID(), item_id: id, column_id: columnIds.get("status")!, value_json: json({ type: "STATUS", labelId: archived ? pick(STATUS_LABELS).id : "on-hold" }) },
          { id: randomUUID(), item_id: id, column_id: columnIds.get("owner")!, value_json: json({ type: "PERSON", userIds: [...new Set(owners)] }) },
          { id: randomUUID(), item_id: id, column_id: columnIds.get("priority")!, value_json: json({ type: "PRIORITY", labelId: pick(PRIORITY_LABELS) }) },
          { id: randomUUID(), item_id: id, column_id: columnIds.get("due")!, value_json: json({ type: "DATE", date: due.toISOString().slice(0, 10) }) },
          { id: randomUUID(), item_id: id, column_id: columnIds.get("channel")!, value_json: json({ type: "TAGS", tags: [...new Set(tags)] }) },
        );
      }

      for (let i = 0; i < items.length; i += 200) await tx`insert into public.items ${tx(items.slice(i, i + 200))}`;
      for (let i = 0; i < values.length; i += 500) await tx`insert into public.item_column_values ${tx(values.slice(i, i + 500))}`;
    });

    console.log(`Created "Archive load test" (${boardId}) with ${ARCHIVED} archived and ${LIVE} live items.`);
    console.log(`Open it at /workspace/<slug>/boards/${BOARD_SLUG}, then Archived items in its menu.`);
    console.log("Remove it with: npx tsx scripts/archive-fixture.mts --remove");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
