import type { BoardColumn, BoardGroup, Item, Notification } from "@/domain";
import { uniqueSlug } from "@/lib/slug";
import type { SeedBundle } from "./seed-data";

/**
 * The pure half of `npm run db:seed:topup` (scripts/db-seed-topup.mts): how the
 * extras bundle is bent to fit a database that already has data in it, with no
 * database in sight so it can be tested flat.
 *
 * Three adjustments, in this order:
 *   1. `remapSystemEntities` — when the workspace already has its Admin team or
 *      Task Allocation board (the app creates them the first time an admin opens
 *      the workspace), the seed's copies are dropped and everything that pointed
 *      at them is pointed at the existing rows instead;
 *   2. `fanOutTaskBooked` — TASK_BOOKED notifications go to whoever is an admin
 *      in the database now, not to the seed's list;
 *   3. `planTopup` — rows that already exist, or whose parent exists neither in
 *      the database nor earlier in the bundle, are left out, table by table in
 *      foreign-key order.
 */

export interface ExistingSystemBoard {
  id: string;
  groups: Array<Pick<BoardGroup, "id" | "name" | "position">>;
  columns: Array<Pick<BoardColumn, "id" | "name" | "type">>;
}

export interface ExistingSystemEntities {
  /** The workspace's team with system = 'ADMIN', if any. */
  teamId: string | null;
  /** The workspace's board with system = 'TASK_ALLOCATION', if any, with its groups and columns. */
  board: ExistingSystemBoard | null;
}

export interface RemapReport {
  teamRemapped: boolean;
  boardRemapped: boolean;
  /** Seed groups with no same-named group on the existing board; their items went to the first group. */
  groupFallbacks: string[];
  /** Seed columns with no same-named, same-typed column on the existing board; their values were dropped. */
  droppedColumns: string[];
  droppedValues: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Points the extras at the database's own Admin team and Task Allocation board
 * when it has them. Groups match by name, columns by name and type; an item
 * whose group has no match lands in the board's first group, a value whose
 * column has no match is dropped.
 */
export function remapSystemEntities(extras: SeedBundle, existing: ExistingSystemEntities): { bundle: SeedBundle; report: RemapReport } {
  const report: RemapReport = { teamRemapped: false, boardRemapped: false, groupFallbacks: [], droppedColumns: [], droppedValues: 0 };
  const bundle: SeedBundle = { ...extras };
  const seedTeam = extras.teams.find((t) => t.system === "ADMIN");
  const seedBoard = extras.boards.find((b) => b.system === "TASK_ALLOCATION");

  if (seedTeam && existing.teamId) {
    const from = seedTeam.id;
    const to = existing.teamId;
    report.teamRemapped = true;
    bundle.teams = extras.teams.filter((t) => t.id !== from);
    bundle.teamMembers = extras.teamMembers.map((m) => (m.teamId === from ? { ...m, teamId: to } : m));
    bundle.boards = extras.boards.map((b) => (b.teamId === from ? { ...b, teamId: to } : b));
    bundle.trackers = extras.trackers.map((t) => (t.teamId === from ? { ...t, teamId: to } : t));
  }

  if (seedBoard && existing.board) {
    const from = seedBoard.id;
    const target = existing.board;
    report.boardRemapped = true;
    const firstGroup = target.groups.slice().sort((a, b) => a.position - b.position)[0];
    const groupMap = new Map<string, string>();
    for (const group of extras.boardGroups.filter((g) => g.boardId === from)) {
      const match = target.groups.find((g) => norm(g.name) === norm(group.name)) ?? firstGroup;
      if (!match) continue;
      if (norm(match.name) !== norm(group.name)) report.groupFallbacks.push(group.name);
      groupMap.set(group.id, match.id);
    }
    const columnMap = new Map<string, string>();
    for (const column of extras.boardColumns.filter((c) => c.boardId === from)) {
      const match = target.columns.find((c) => c.type === column.type && norm(c.name) === norm(column.name));
      if (match) columnMap.set(column.id, match.id);
      else report.droppedColumns.push(column.name);
    }
    const seedColumnIds = new Set(extras.boardColumns.filter((c) => c.boardId === from).map((c) => c.id));

    bundle.boards = bundle.boards.filter((b) => b.id !== from);
    bundle.boardGroups = extras.boardGroups.filter((g) => g.boardId !== from);
    bundle.boardColumns = extras.boardColumns.filter((c) => c.boardId !== from);
    bundle.boardMembers = extras.boardMembers.map((m) => (m.boardId === from ? { ...m, boardId: target.id } : m));
    const remapItem = (item: Item): Item | null => {
      if (item.boardId !== from) return item;
      const groupId = groupMap.get(item.groupId);
      return groupId ? { ...item, boardId: target.id, groupId } : null;
    };
    bundle.items = extras.items.map(remapItem).filter((i): i is Item => i !== null);
    const keptItems = new Set(bundle.items.map((i) => i.id));
    bundle.itemColumnValues = extras.itemColumnValues.flatMap((v) => {
      if (!keptItems.has(v.itemId)) return [];
      if (!seedColumnIds.has(v.columnId)) return [v];
      const columnId = columnMap.get(v.columnId);
      if (!columnId) {
        report.droppedValues += 1;
        return [];
      }
      return [{ ...v, columnId }];
    });
    bundle.activities = extras.activities.map((a) => (a.boardId === from ? { ...a, boardId: target.id } : a));
    bundle.notifications = extras.notifications.map((n) => (n.boardId === from ? { ...n, boardId: target.id } : n));
    bundle.boardVisits = extras.boardVisits.map((v) => (v.boardId === from ? { ...v, boardId: target.id, id: `${v.userId}:${target.id}` } : v));
  }

  return { bundle, report };
}

/** Boards keep (workspace_id, slug) unique: a slug already taken in the workspace gets a numeric suffix, as the app would give it. */
export function uniqueBoardSlugs(bundle: SeedBundle, takenSlugs: Iterable<string>): SeedBundle {
  const taken = new Set(takenSlugs);
  const boards = bundle.boards.map((board) => {
    const slug = uniqueSlug(board.slug, taken);
    taken.add(slug);
    return slug === board.slug ? board : { ...board, slug };
  });
  return { ...bundle, boards };
}

/**
 * A deterministic pseudo-UUID for rows the top-up has to invent for people who
 * are not in the seed (an admin added by hand). The same inputs always give the
 * same id, which is what makes a second run insert nothing.
 */
export function stableTopupId(...parts: string[]): string {
  const text = parts.join("|");
  const hex = [0x811c9dc5, 0x2545f491, 0x9e3779b9, 0x7f4a7c15].map((seed) => fnv1a(text, seed).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * TASK_BOOKED notifications are for the workspace's admins as they are now.
 * Each booking keeps one notification per current admin: the seed's own row
 * where the admin is a seed admin, otherwise a copy with a stable id. Seed
 * admins who are no longer admins get nothing. Every other notification passes
 * through untouched.
 */
export function fanOutTaskBooked(notifications: readonly Notification[], adminUserIds: readonly string[]): Notification[] {
  const admins = Array.from(new Set(adminUserIds));
  const result: Notification[] = [];
  const seen = new Set<string>();
  for (const notification of notifications) {
    if (notification.type !== "TASK_BOOKED") {
      result.push(notification);
      continue;
    }
    if (seen.has(notification.entityId)) continue;
    seen.add(notification.entityId);
    const group = notifications.filter((n) => n.type === "TASK_BOOKED" && n.entityId === notification.entityId);
    for (const userId of admins) {
      const own = group.find((n) => n.userId === userId);
      result.push(own ?? { ...notification, id: stableTopupId("task-booked", notification.entityId, userId), userId, readAt: null });
    }
  }
  return result;
}

// ---- Base boards whose groups and columns carry other ids in the database -------

/** A board as the database holds it: the groups and columns the seed's are matched to by name. */
export interface LiveBoardLayout {
  groups: Array<Pick<BoardGroup, "id" | "name" | "position">>;
  columns: Array<Pick<BoardColumn, "id" | "name" | "type">>;
}

export interface LayoutReport {
  boardId: string;
  /** Seed groups with no same-named group on the live board; their items went to the first group. */
  groupFallbacks: string[];
  /** Seed columns with no same-named, same-typed column on the live board; their values were dropped. */
  droppedColumns: string[];
  droppedValues: number;
}

/**
 * The extras address the base boards' groups and columns by the seed's ids, but
 * a database seeded from an earlier seed, or edited since, holds the same boards
 * with other group and column ids (the ids are counters, so adding one column to
 * one board shifts every board after it). Each seed id is therefore translated by
 * name on its own board — columns by name and type — before anything is inserted.
 * An item whose group has no namesake lands in the board's first group; a value
 * whose column has none is dropped rather than written against a stranger's column.
 */
export function remapBoardLayouts(
  bundle: SeedBundle,
  seed: { groups: readonly BoardGroup[]; columns: readonly BoardColumn[] },
  live: ReadonlyMap<string, LiveBoardLayout>,
): { bundle: SeedBundle; reports: LayoutReport[] } {
  const reports = new Map<string, LayoutReport>();
  const groupMap = new Map<string, string>();
  /** Seed column id → live column id, or null when the live board has no such column. */
  const columnMap = new Map<string, string | null>();
  const boardOfColumn = new Map<string, string>();
  for (const [boardId, layout] of live) {
    const report: LayoutReport = { boardId, groupFallbacks: [], droppedColumns: [], droppedValues: 0 };
    const firstGroup = layout.groups.slice().sort((a, b) => a.position - b.position)[0];
    for (const group of seed.groups.filter((g) => g.boardId === boardId)) {
      const match = layout.groups.find((g) => norm(g.name) === norm(group.name)) ?? firstGroup;
      if (!match) continue;
      if (norm(match.name) !== norm(group.name)) report.groupFallbacks.push(group.name);
      if (match.id !== group.id) groupMap.set(group.id, match.id);
    }
    for (const column of seed.columns.filter((c) => c.boardId === boardId)) {
      boardOfColumn.set(column.id, boardId);
      const match = layout.columns.find((c) => c.type === column.type && norm(c.name) === norm(column.name));
      if (!match) {
        report.droppedColumns.push(column.name);
        columnMap.set(column.id, null);
      } else if (match.id !== column.id) {
        columnMap.set(column.id, match.id);
      }
    }
    reports.set(boardId, report);
  }

  const items = bundle.items.map((item) => {
    const to = groupMap.get(item.groupId);
    return to ? { ...item, groupId: to } : item;
  });
  const itemColumnValues = bundle.itemColumnValues.flatMap((value) => {
    if (!columnMap.has(value.columnId)) return [value];
    const to = columnMap.get(value.columnId);
    if (to === null || to === undefined) {
      const report = reports.get(boardOfColumn.get(value.columnId) ?? "");
      if (report) report.droppedValues += 1;
      return [];
    }
    return [{ ...value, columnId: to }];
  });
  return { bundle: { ...bundle, items, itemColumnValues }, reports: [...reports.values()] };
}

// ---- Teams renamed since the seed ------------------------------------------------

/**
 * Bookings name the team they were requested for — as a "Requested team" tag, in
 * the notification that announces them and in the request's description. Those
 * texts come from the seed's team names, so when a team has since been renamed
 * in the database the extras would show the old name next to the new one. Every
 * exact occurrence of a renamed team's seed name is swapped for its current name.
 */
export function renameTeamsInExtras(bundle: SeedBundle, renames: ReadonlyMap<string, string>): SeedBundle {
  const pairs = [...renames].filter(([from, to]) => from !== to && from.trim().length > 0);
  if (!pairs.length) return bundle;
  const swap = (text: string): string => pairs.reduce((acc, [from, to]) => acc.split(from).join(to), text);
  const swapNullable = (text: string | null): string | null => (text === null ? null : swap(text));
  return {
    ...bundle,
    items: bundle.items.map((i) => (i.description ? { ...i, description: swap(i.description) } : i)),
    itemColumnValues: bundle.itemColumnValues.map((v) => {
      if (v.value.type === "TAGS") return { ...v, value: { ...v.value, tags: v.value.tags.map(swap) } };
      if (v.value.type === "TEXT" || v.value.type === "LONG_TEXT") return { ...v, value: { ...v.value, text: swap(v.value.text) } };
      return v;
    }),
    notifications: bundle.notifications.map((n) => ({ ...n, title: swap(n.title), body: swapNullable(n.body) })),
    comments: bundle.comments.map((c) => ({ ...c, body: swap(c.body) })),
    directMessages: bundle.directMessages.map((m) => ({ ...m, body: swap(m.body) })),
  };
}

// ---- Foreign-key planning -------------------------------------------------------

export const TOPUP_TABLES = [
  "teams",
  "team_members",
  "boards",
  "board_members",
  "board_groups",
  "board_columns",
  "items",
  "item_column_values",
  "item_links",
  "trackers",
  "tracker_sheets",
  "comments",
  "activities",
  "notifications",
  "direct_messages",
] as const;
export type TopupTable = (typeof TOPUP_TABLES)[number];

/** Ids already in the database, per table the top-up writes to, plus the two it only reads. */
export type KnownIds = Record<TopupTable | "profiles" | "workspaces", Set<string>>;

export function emptyKnownIds(): KnownIds {
  const known = {} as KnownIds;
  for (const table of [...TOPUP_TABLES, "profiles", "workspaces"] as const) known[table] = new Set();
  return known;
}

export interface TableReport {
  table: TopupTable;
  /** Rows the plan will try to insert. */
  planned: number;
  /** Rows whose id is already in the database. */
  skippedExisting: number;
  /** Rows referencing a parent that exists neither in the database nor earlier in the plan. */
  skippedMissingParent: number;
}

export interface TopupPlan {
  bundle: SeedBundle;
  reports: TableReport[];
}

const BUNDLE_KEY = {
  teams: "teams",
  team_members: "teamMembers",
  boards: "boards",
  board_members: "boardMembers",
  board_groups: "boardGroups",
  board_columns: "boardColumns",
  items: "items",
  item_column_values: "itemColumnValues",
  item_links: "itemLinks",
  trackers: "trackers",
  tracker_sheets: "trackerSheets",
  comments: "comments",
  activities: "activities",
  notifications: "notifications",
  direct_messages: "directMessages",
} as const satisfies Record<TopupTable, keyof SeedBundle>;

type RowOf<T extends TopupTable> = SeedBundle[(typeof BUNDLE_KEY)[T]][number];

/**
 * Decides, table by table in foreign-key order, which rows of the bundle can go
 * in: not the ones already there, and not the ones whose parents are missing.
 * A row accepted for one table counts as a parent for the tables after it, so a
 * whole new board with its groups, columns and items goes in together.
 */
/**
 * Which board each group, column and item belongs to, so a row is never written
 * against a group or column of another board (the database refuses values like
 * that with an error that would abort the whole run). Rows accepted during the
 * run are added as they go.
 */
export interface TopupShape {
  boardOfGroup: Map<string, string>;
  boardOfColumn: Map<string, string>;
  boardOfItem: Map<string, string>;
}

export function emptyShape(): TopupShape {
  return { boardOfGroup: new Map(), boardOfColumn: new Map(), boardOfItem: new Map() };
}

export function planTopup(extras: SeedBundle, existing: KnownIds, existingShape: TopupShape = emptyShape()): TopupPlan {
  const shape: TopupShape = { boardOfGroup: new Map(existingShape.boardOfGroup), boardOfColumn: new Map(existingShape.boardOfColumn), boardOfItem: new Map(existingShape.boardOfItem) };
  const sameBoard = (map: Map<string, string>, id: string, boardId: string) => !map.has(id) || map.get(id) === boardId;
  const known = emptyKnownIds();
  for (const table of Object.keys(known) as Array<keyof KnownIds>) known[table] = new Set(existing[table]);
  const has = (table: keyof KnownIds, id: string | null | undefined) => id === null || id === undefined || known[table].has(id);
  const must = (table: keyof KnownIds, id: string) => known[table].has(id);

  const rules: { [T in TopupTable]: (row: RowOf<T>) => boolean } = {
    teams: (t) => must("workspaces", t.workspaceId),
    team_members: (m) => must("teams", m.teamId) && must("profiles", m.userId),
    boards: (b) => must("workspaces", b.workspaceId) && has("teams", b.teamId) && must("profiles", b.ownerId),
    board_members: (m) => must("boards", m.boardId) && must("profiles", m.userId),
    board_groups: (g) => must("boards", g.boardId),
    board_columns: (c) => must("boards", c.boardId),
    items: (i) => must("boards", i.boardId) && must("board_groups", i.groupId) && sameBoard(shape.boardOfGroup, i.groupId, i.boardId) && must("profiles", i.createdBy) && has("items", i.parentItemId),
    item_column_values: (v) => {
      if (!must("items", v.itemId) || !must("board_columns", v.columnId)) return false;
      const itemBoard = shape.boardOfItem.get(v.itemId);
      const columnBoard = shape.boardOfColumn.get(v.columnId);
      return itemBoard === undefined || columnBoard === undefined || itemBoard === columnBoard;
    },
    item_links: (l) => must("workspaces", l.workspaceId) && must("items", l.itemAId) && must("items", l.itemBId) && must("profiles", l.createdBy),
    trackers: (t) => must("workspaces", t.workspaceId) && must("profiles", t.createdBy) && has("teams", t.teamId),
    tracker_sheets: (s) => must("trackers", s.trackerId),
    comments: (c) => must("items", c.itemId) && must("profiles", c.authorId),
    activities: (a) => must("workspaces", a.workspaceId) && must("profiles", a.actorId) && has("boards", a.boardId) && has("items", a.itemId),
    notifications: (n) => must("profiles", n.userId) && has("boards", n.boardId) && has("profiles", n.actorId),
    direct_messages: (m) => must("workspaces", m.workspaceId) && must("profiles", m.senderId) && must("profiles", m.recipientId),
  };

  const bundle: SeedBundle = { ...extras };
  const reports: TableReport[] = [];
  for (const table of TOPUP_TABLES) {
    const key = BUNDLE_KEY[table];
    // Subitems reference their parent, so top-level items are judged first.
    const rows = table === "items" ? [...extras.items.filter((i) => i.parentItemId === null), ...extras.items.filter((i) => i.parentItemId !== null)] : (extras[key] as Array<{ id: string }>);
    const rule = rules[table] as (row: unknown) => boolean;
    const report: TableReport = { table, planned: 0, skippedExisting: 0, skippedMissingParent: 0 };
    const accepted: unknown[] = [];
    for (const row of rows) {
      if (known[table].has(row.id)) {
        report.skippedExisting += 1;
        // Still a valid parent for whatever comes next.
        continue;
      }
      if (!rule(row)) {
        report.skippedMissingParent += 1;
        continue;
      }
      known[table].add(row.id);
      if (table === "board_groups") shape.boardOfGroup.set(row.id, (row as BoardGroup).boardId);
      if (table === "board_columns") shape.boardOfColumn.set(row.id, (row as BoardColumn).boardId);
      if (table === "items") shape.boardOfItem.set(row.id, (row as Item).boardId);
      accepted.push(row);
      report.planned += 1;
    }
    (bundle as unknown as Record<string, unknown[]>)[key] = accepted;
    reports.push(report);
  }
  return { bundle, reports };
}
