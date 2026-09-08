#!/usr/bin/env tsx
/**
 * Adds the seed extras (src/data/seed/seed-extras.ts) to a Supabase project
 * that already holds the base seed, without touching anything that is there.
 *
 *   npm run db:seed:topup
 *
 * Unlike `npm run db:seed`, nothing is deleted or updated: every row goes in
 * with `on conflict do nothing`, so a workspace whose teams and boards were
 * renamed or extended by hand keeps all of it. Before anything is written:
 *   - if the workspace already has its Admin team / Task Allocation board (the
 *     app creates them when an admin first opens the workspace), the extras are
 *     pointed at those rows instead of inserting the seed's copies — groups by
 *     name, columns by name and type;
 *   - TASK_BOOKED notifications go to whoever is an OWNER or ADMIN of the
 *     workspace right now, so admins added by hand see them too;
 *   - every row's foreign keys are checked against the database (and the rows
 *     accepted earlier in the run); rows that would fail are skipped and counted;
 *   - workspaces.booking_key is set only when it is still null.
 *
 * Running it twice inserts nothing the second time. Needs SUPABASE_DB_URL in
 * .env.local; the seed's profiles must already exist (run db:seed once first).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { buildSeedParts, SEED_BOOKING_KEY, SEED_WORKSPACE_ID } from "../src/data/seed/seed-data";
import { emptyKnownIds, emptyShape, fanOutTaskBooked, planTopup, remapBoardLayouts, remapSystemEntities, renameTeamsInExtras, TOPUP_TABLES, uniqueBoardSlugs, type ExistingSystemEntities, type LiveBoardLayout, type TopupTable } from "../src/data/seed/seed-topup";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

async function main(): Promise<void> {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Missing in .env.local:\n  SUPABASE_DB_URL");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 30, onnotice: () => {} });
  const json = (value: unknown) => sql.json(value as never);
  const ids = async (table: string): Promise<Set<string>> => new Set((await sql<Array<{ id: string }>>`select id from public.${sql(table)}`).map((r) => r.id));

  try {
    const ledger = await sql`select 1 from public.schema_migrations limit 1`.catch(() => null);
    if (!ledger) {
      console.error("\nNo schema_migrations table — run `npm run db:migrate` first.");
      process.exit(1);
    }
    const [workspace] = await sql<Array<{ id: string; name: string; booking_key: string | null }>>`select id, name, booking_key from public.workspaces where id = ${SEED_WORKSPACE_ID}`;
    if (!workspace) {
      console.error("\nThe seed workspace is not in this database — run `npm run db:seed` once first; the top-up only adds to it.");
      process.exit(1);
    }
    console.log(`Topping up "${workspace.name}" (${workspace.id}) …`);

    // ---- 1. Fit the extras to what is already there --------------------------
    const { base, extras } = buildSeedParts(new Date());
    const [adminTeam] = await sql<Array<{ id: string; name: string }>>`select id, name from public.teams where workspace_id = ${SEED_WORKSPACE_ID} and system = 'ADMIN'`;
    const [allocation] = await sql<Array<{ id: string; name: string }>>`select id, name from public.boards where workspace_id = ${SEED_WORKSPACE_ID} and system = 'TASK_ALLOCATION'`;
    const existing: ExistingSystemEntities = {
      teamId: adminTeam?.id ?? null,
      board: allocation
        ? {
            id: allocation.id,
            groups: await sql<Array<{ id: string; name: string; position: number }>>`select id, name, position from public.board_groups where board_id = ${allocation.id}`,
            columns: await sql<Array<{ id: string; name: string; type: string }>>`select id, name, type::text as type from public.board_columns where board_id = ${allocation.id}`.then((rows) => rows.map((r) => ({ ...r, type: r.type as never }))),
          }
        : null,
    };
    const remapped = remapSystemEntities(extras, existing);
    if (remapped.report.teamRemapped) console.log(`  Admin team already exists as "${adminTeam!.name}" — reusing it`);
    if (remapped.report.boardRemapped) {
      console.log(`  Task Allocation board already exists as "${allocation!.name}" — reusing its groups and columns`);
      if (remapped.report.groupFallbacks.length) console.log(`    groups not found by name (items placed in the first group): ${remapped.report.groupFallbacks.join(", ")}`);
      if (remapped.report.droppedColumns.length) console.log(`    columns not found by name and type (${remapped.report.droppedValues} values dropped): ${remapped.report.droppedColumns.join(", ")}`);
    }

    // The base boards' groups and columns may carry other ids here than in the
    // seed (an earlier seed layout, or columns added since), so the extras are
    // translated onto them by name before anything is written.
    const liveGroups = await sql<Array<{ id: string; board_id: string; name: string; position: number }>>`select id, board_id, name, position from public.board_groups`;
    const liveColumns = await sql<Array<{ id: string; board_id: string; name: string; type: string }>>`select id, board_id, name, type::text as type from public.board_columns`;
    const liveItems = await sql<Array<{ id: string; board_id: string }>>`select id, board_id from public.items`;
    const layouts = new Map<string, LiveBoardLayout>();
    for (const board of base.boards) {
      const groups = liveGroups.filter((g) => g.board_id === board.id);
      if (!groups.length) continue;
      layouts.set(board.id, {
        groups: groups.map((g) => ({ id: g.id, name: g.name, position: g.position })),
        columns: liveColumns.filter((c) => c.board_id === board.id).map((c) => ({ id: c.id, name: c.name, type: c.type as never })),
      });
    }
    const fitted = remapBoardLayouts(remapped.bundle, { groups: base.boardGroups, columns: base.boardColumns }, layouts);
    for (const report of fitted.reports) {
      if (!report.groupFallbacks.length && !report.droppedColumns.length) continue;
      const name = base.boards.find((b) => b.id === report.boardId)?.name ?? report.boardId;
      if (report.groupFallbacks.length) console.log(`  ${name}: groups not found by name (items placed in the first group): ${report.groupFallbacks.join(", ")}`);
      if (report.droppedColumns.length) console.log(`  ${name}: columns not found by name and type (${report.droppedValues} values dropped): ${report.droppedColumns.join(", ")}`);
    }
    // Teams renamed since the seed: the extras name them in tags, notifications
    // and descriptions, and should use the names the workspace uses now.
    const liveTeams = await sql<Array<{ id: string; name: string }>>`select id, name from public.teams where workspace_id = ${SEED_WORKSPACE_ID}`;
    const renames = new Map<string, string>();
    for (const team of base.teams) {
      const live = liveTeams.find((t) => t.id === team.id);
      if (live && live.name !== team.name) renames.set(team.name, live.name);
    }
    if (renames.size) console.log(`  teams renamed since the seed: ${[...renames].map(([from, to]) => `${from} → ${to}`).join(", ")}`);
    const renamed = renameTeamsInExtras(fitted.bundle, renames);

    const shape = emptyShape();
    for (const g of liveGroups) shape.boardOfGroup.set(g.id, g.board_id);
    for (const c of liveColumns) shape.boardOfColumn.set(c.id, c.board_id);
    for (const i of liveItems) shape.boardOfItem.set(i.id, i.board_id);

    const slugs = (await sql<Array<{ slug: string }>>`select slug from public.boards where workspace_id = ${SEED_WORKSPACE_ID}`).map((r) => r.slug);
    let bundle = uniqueBoardSlugs(renamed, slugs);

    const admins = (
      await sql<Array<{ user_id: string }>>`select user_id from public.workspace_members where workspace_id = ${SEED_WORKSPACE_ID} and status = 'ACTIVE' and role in ('OWNER', 'ADMIN')`
    ).map((r) => r.user_id);
    bundle = { ...bundle, notifications: fanOutTaskBooked(bundle.notifications, admins) };
    console.log(`  TASK_BOOKED notifications go to ${admins.length} current admin(s)`);

    // ---- 2. Check every foreign key up front ----------------------------------
    const known = emptyKnownIds();
    known.profiles = await ids("profiles");
    known.workspaces = await ids("workspaces");
    for (const table of TOPUP_TABLES) known[table] = await ids(table);
    const plan = planTopup(bundle, known, shape);
    const planned = plan.bundle;

    // ---- 3. Insert, in foreign-key order, never touching existing rows --------
    const inserted: Record<TopupTable, number> = Object.fromEntries(TOPUP_TABLES.map((t) => [t, 0])) as Record<TopupTable, number>;
    const insert = async (tx: postgres.TransactionSql, table: TopupTable, rows: Array<Record<string, unknown>>) => {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const result = await tx<Array<{ id: string }>>`insert into public.${tx(table)} ${tx(batch)} on conflict do nothing returning id`;
        inserted[table] += result.length;
      }
    };

    await sql.begin(async (tx) => {
      await insert(tx, "teams", planned.teams.map((t) => ({ id: t.id, workspace_id: t.workspaceId, name: t.name, description: t.description, color: t.color, icon: t.icon, archived_at: t.archivedAt, system: t.system ?? null, created_at: t.createdAt, updated_at: t.updatedAt })));
      await insert(tx, "team_members", planned.teamMembers.map((m) => ({ id: m.id, team_id: m.teamId, user_id: m.userId, role: m.role })));
      await insert(tx, "boards", planned.boards.map((b) => ({ id: b.id, workspace_id: b.workspaceId, team_id: b.teamId, name: b.name, slug: b.slug, description: b.description, type: b.type, visibility: b.visibility, owner_id: b.ownerId, color: b.color, icon: b.icon, archived_at: b.archivedAt, system: b.system ?? null, created_at: b.createdAt, updated_at: b.updatedAt })));
      await insert(tx, "board_members", planned.boardMembers.map((m) => ({ id: m.id, board_id: m.boardId, user_id: m.userId, role: m.role })));
      await insert(tx, "board_groups", planned.boardGroups.map((g) => ({ id: g.id, board_id: g.boardId, name: g.name, color: g.color, position: g.position, collapsed: g.collapsed, created_at: g.createdAt })));
      await insert(tx, "board_columns", planned.boardColumns.map((c) => ({ id: c.id, board_id: c.boardId, name: c.name, type: c.type, settings: json(c.settings), position: c.position, width: c.width, hidden: c.hidden, created_at: c.createdAt })));
      // Subitems reference their parent, so top-level rows go in first.
      for (const batch of [planned.items.filter((i) => i.parentItemId === null), planned.items.filter((i) => i.parentItemId !== null)]) {
        await insert(tx, "items", batch.map((i) => ({ id: i.id, board_id: i.boardId, group_id: i.groupId, parent_item_id: i.parentItemId, name: i.name, description: i.description, position: i.position, created_by: i.createdBy, archived_at: i.archivedAt, created_at: i.createdAt, updated_at: i.updatedAt })));
      }
      await insert(tx, "item_column_values", planned.itemColumnValues.map((v) => ({ id: v.id, item_id: v.itemId, column_id: v.columnId, value_json: json(v.value), updated_at: v.updatedAt })));
      await insert(tx, "item_assets", planned.itemAssets.map((a) => ({ id: a.id, item_id: a.itemId, board_id: a.boardId, name: a.name, asset_type: a.assetType, quantity: a.quantity, assignee_ids: a.assigneeIds, due_date: a.dueDate, completed_at: a.completedAt, notes: a.notes, position: a.position, created_by: a.createdBy, created_at: a.createdAt, updated_at: a.updatedAt })));
      await insert(tx, "item_links", planned.itemLinks.map((l) => {
        // item_links_ordered_pair requires the smaller uuid first.
        const [a, b] = l.itemAId < l.itemBId ? [l.itemAId, l.itemBId] : [l.itemBId, l.itemAId];
        return { id: l.id, workspace_id: l.workspaceId, item_a_id: a, item_b_id: b, excluded: l.excluded, created_by: l.createdBy, created_at: l.createdAt };
      }));
      await insert(tx, "trackers", planned.trackers.map((t) => ({ id: t.id, workspace_id: t.workspaceId, team_id: t.teamId, name: t.name, description: t.description, created_by: t.createdBy, created_at: t.createdAt, updated_at: t.updatedAt })));
      await insert(tx, "tracker_sheets", planned.trackerSheets.map((s) => ({ id: s.id, tracker_id: s.trackerId, name: s.name, position: s.position, columns: json(s.columns), rows: json(s.rows), frozen_columns: s.frozenColumns, created_at: s.createdAt, updated_at: s.updatedAt })));
      await insert(tx, "comments", planned.comments.map((c) => ({ id: c.id, item_id: c.itemId, author_id: c.authorId, body: c.body, mention_user_ids: c.mentionUserIds, shared_id: c.sharedId, created_at: c.createdAt, updated_at: c.updatedAt })));
      await insert(tx, "activities", planned.activities.map((a) => ({ id: a.id, workspace_id: a.workspaceId, board_id: a.boardId, item_id: a.itemId, actor_id: a.actorId, event_type: a.eventType, metadata: json(a.metadata), created_at: a.createdAt })));
      await insert(tx, "notifications", planned.notifications.map((n) => ({ id: n.id, user_id: n.userId, type: n.type, delivery: n.delivery, title: n.title, body: n.body, entity_type: n.entityType, entity_id: n.entityId, board_id: n.boardId, actor_id: n.actorId, read_at: n.readAt, created_at: n.createdAt })));
      await insert(tx, "direct_messages", planned.directMessages.map((m) => ({ id: m.id, workspace_id: m.workspaceId, sender_id: m.senderId, recipient_id: m.recipientId, body: m.body, read_at: m.readAt, created_at: m.createdAt })));

      // The public booking link, only where nobody has set one yet.
      const keyed = await tx`update public.workspaces set booking_key = ${SEED_BOOKING_KEY} where id = ${SEED_WORKSPACE_ID} and booking_key is null returning id`;
      console.log(keyed.length ? `  booking_key set to the demo key (/book/rmit/${SEED_BOOKING_KEY})` : `  booking_key already set — left as is`);
    });

    console.log("\nPer table (inserted / skipped-existing / skipped-missing-parent / skipped-conflict):");
    for (const report of plan.reports) {
      const conflicts = report.planned - inserted[report.table];
      console.log(`  ${report.table.padEnd(20)} ${String(inserted[report.table]).padStart(4)} / ${String(report.skippedExisting).padStart(4)} / ${String(report.skippedMissingParent).padStart(4)} / ${String(conflicts).padStart(4)}`);
    }

    const counts = await sql`
      select
        (select count(*) from public.profiles)           as profiles,
        (select count(*) from public.teams)              as teams,
        (select count(*) from public.boards)             as boards,
        (select count(*) from public.items)              as items,
        (select count(*) from public.item_column_values) as values,
        (select count(*) from public.comments)           as comments,
        (select count(*) from public.trackers)           as trackers,
        (select count(*) from public.notifications)      as notifications,
        (select count(*) from public.direct_messages)    as direct_messages
    `;
    console.log("\nNow in the database:", Object.entries(counts[0]!).map(([k, v]) => `${v} ${k}`).join(", "));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
