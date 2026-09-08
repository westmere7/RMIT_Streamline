import type { Board, BoardColumn, ColorToken, ColumnValue, DashboardSnapshot, ISODate, ItemAsset, StatusLabelRole, Team, TShirtSize, User } from "@/domain";
import { assetCount, BOOKING_ASSET_TYPES, statusLabelRole, T_SHIRT_SIZES } from "@/domain";
import { colorClasses, tagColorFor } from "@/lib/colors";

/**
 * The sums behind the dashboard, kept free of React so they are cheap to test.
 *
 * Two passes. `buildFacts` walks the snapshot once and turns every item into a
 * TaskFact and every asset line into an AssetFact, resolving the things that
 * take a lookup (team, status role, due date, owners, who asked). Everything
 * else is a plain filter and count over those facts, so a span or team change
 * is a re-render, not a re-read.
 *
 * What counts as what:
 *  - A task is a top-level, unarchived item on a board that is not the Task
 *    Allocation board. A task mirrored on several boards by a link counts once.
 *  - A request is an item on the Task Allocation board, or any task whose board
 *    records who asked for it (a "Requester" or "Department" column).
 *  - Assets are the asset lines of tasks, measured in units (quantity, or one
 *    when a line has none) — the same figure the Assets recap cell shows.
 */

// ---------------------------------------------------------------------------
// Scope

export const SPAN_MODES = ["total", "year", "half", "quarter"] as const;
export type SpanMode = (typeof SPAN_MODES)[number];

/** Which date places a task on the calendar. */
export const DATE_BASES = ["due", "created", "completed"] as const;
export type DateBasis = (typeof DATE_BASES)[number];

export const DATE_BASIS_LABELS: Record<DateBasis, string> = { due: "Due date", created: "Created", completed: "Completed" };
export const DATE_BASIS_HINTS: Record<DateBasis, string> = {
  due: "Work is counted in the period it is due (undated work by when it was created).",
  created: "Work is counted in the period it was created or booked.",
  completed: "Only finished work counts, in the period it was completed.",
};

export type Unit = "tasks" | "assets";

export interface DashboardScope {
  span: SpanMode;
  year: number;
  half: 1 | 2;
  quarter: 1 | 2 | 3 | 4;
  /** Team ids to keep, or null for every team. NO_TEAM stands for boards without a team. */
  teamIds: string[] | null;
  basis: DateBasis;
}

export const NO_TEAM = "__no_team__";

export function scopeLabel(scope: DashboardScope): string {
  switch (scope.span) {
    case "total":
      return "All time";
    case "year":
      return String(scope.year);
    case "half":
      return `${scope.year} · H${scope.half}`;
    case "quarter":
      return `${scope.year} · Q${scope.quarter}`;
  }
}

/** The same span one year earlier, for the "vs last period" deltas; null for all time. */
export function previousScope(scope: DashboardScope): DashboardScope | null {
  if (scope.span === "total") return null;
  return { ...scope, year: scope.year - 1 };
}

function inSpan(date: ISODate | null, scope: DashboardScope): boolean {
  if (scope.span === "total") return true;
  if (!date) return false;
  const year = Number(date.slice(0, 4));
  if (year !== scope.year) return false;
  const month = Number(date.slice(5, 7));
  if (scope.span === "half") return scope.half === 1 ? month <= 6 : month >= 7;
  if (scope.span === "quarter") return Math.ceil(month / 3) === scope.quarter;
  return true;
}

// ---------------------------------------------------------------------------
// Facts

export type StatusBucket = StatusLabelRole | "other" | "none";

export interface TeamRef {
  id: string;
  name: string;
  color: ColorToken;
}

export type RequestStage = "incoming" | "allocated" | "closed";

export interface RequestFacts {
  requesterName: string | null;
  department: string | null;
  /** The team the requester asked for, or the team whose board took the booking directly. */
  teamName: string | null;
  urgency: string | null;
  assetTypes: string[];
  stage: RequestStage;
}

export interface TaskFact {
  id: string;
  name: string;
  reference: string | null;
  boardId: string;
  boardName: string;
  team: TeamRef;
  createdAt: ISODate;
  dueDate: ISODate | null;
  startDate: ISODate | null;
  /** The day the work was finished, for done tasks: the last asset ticked off, else the item's last change. */
  completedAt: ISODate | null;
  status: StatusBucket;
  statusLabel: string | null;
  isDone: boolean;
  priority: string | null;
  size: TShirtSize | null;
  owners: string[];
  tags: string[];
  /** Units on this task's asset lines. */
  assetUnits: number;
  assetLines: number;
  doneAssetUnits: number;
  /** Set when the item is a stakeholder request rather than (or as well as) a piece of work. */
  request: RequestFacts | null;
  /** True for items on the Task Allocation board: requests waiting to be placed, not delivery. */
  isIntake: boolean;
}

export interface AssetFact {
  id: string;
  taskId: string;
  team: TeamRef;
  boardId: string;
  type: string;
  units: number;
  done: boolean;
  completedAt: ISODate | null;
  dueDate: ISODate | null;
  createdAt: ISODate;
  /** The parent task's due date, for lines without one. */
  taskDueDate: ISODate | null;
  assignees: string[];
}

export interface DashboardFacts {
  /** Delivery work: top-level tasks off the intake board, linked copies collapsed. */
  tasks: TaskFact[];
  /** Everything that records who asked: intake items plus tasks with requester details. */
  requests: TaskFact[];
  /** Asset lines of delivery tasks. */
  assets: AssetFact[];
  teams: TeamRef[];
  users: Map<string, User>;
  boards: Map<string, Board>;
  /** Every year that has a task placed in it, newest first. */
  years: number[];
  earliest: ISODate | null;
}

export const UNTYPED = "Untyped";

const REQUESTER_HINTS = ["requester", "requested by", "stakeholder", "client", "booked by"];
const DEPARTMENT_HINTS = ["department", "school", "faculty", "portfolio", "unit", "college"];
const TEAM_HINTS = ["requested team", "team"];
const ASSET_TYPE_HINTS = ["asset type", "asset types", "deliverable type"];

const hasHint = (name: string, hints: string[]) => hints.some((h) => name.toLowerCase().includes(h));

function dateOf(iso: string): ISODate {
  return iso.slice(0, 10);
}

export function buildFacts(snapshot: DashboardSnapshot): DashboardFacts {
  const boards = new Map(snapshot.boards.map((b) => [b.id, b]));
  const users = new Map(snapshot.users.map((u) => [u.id, u]));
  const teamsById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const noTeam: TeamRef = { id: NO_TEAM, name: "No team", color: "gray" };
  const teamRef = (team: Team | undefined): TeamRef => (team ? { id: team.id, name: team.name, color: team.color } : noTeam);
  const teamOfBoard = (board: Board): TeamRef => teamRef(board.teamId ? teamsById.get(board.teamId) : undefined);

  const columnsByBoard = new Map<string, BoardColumn[]>();
  for (const column of snapshot.columns) {
    const list = columnsByBoard.get(column.boardId) ?? [];
    list.push(column);
    columnsByBoard.set(column.boardId, list);
  }
  for (const list of columnsByBoard.values()) list.sort((a, b) => a.position - b.position);
  const groupsById = new Map(snapshot.groups.map((g) => [g.id, g]));

  const values = new Map<string, ColumnValue>();
  for (const v of snapshot.values) values.set(`${v.itemId}:${v.columnId}`, v.value);
  const getValue = (itemId: string, columnId: string) => values.get(`${itemId}:${columnId}`);

  const assetsByItem = new Map<string, ItemAsset[]>();
  for (const asset of snapshot.assets) {
    const list = assetsByItem.get(asset.itemId) ?? [];
    list.push(asset);
    assetsByItem.set(asset.itemId, list);
  }

  const tasks: TaskFact[] = [];
  const requests: TaskFact[] = [];
  const assets: AssetFact[] = [];
  const years = new Set<number>();
  let earliest: ISODate | null = null;

  const items = snapshot.items.filter((i) => i.parentItemId === null && i.archivedAt === null && boards.has(i.boardId));
  const kept = collapseLinked(items.map((i) => i.id), snapshot.links, new Map(items.map((i) => [i.id, i.createdAt])));

  for (const item of items) {
    const board = boards.get(item.boardId)!;
    const columns = columnsByBoard.get(board.id) ?? [];
    const team = teamOfBoard(board);
    const lines = assetsByItem.get(item.id) ?? [];

    // Status: the first STATUS column with a value (or its default label).
    let status: StatusBucket = "none";
    let statusLabel: string | null = null;
    for (const column of columns) {
      if (column.type !== "STATUS" || column.settings.kind !== "status") continue;
      const v = getValue(item.id, column.id);
      const labelId = v?.type === "STATUS" && v.labelId ? v.labelId : column.settings.defaultLabelId;
      if (!labelId) continue;
      const role = statusLabelRole(column.settings, labelId);
      status = role ?? "other";
      statusLabel = column.settings.labels.find((l) => l.id === labelId)?.name ?? null;
      break;
    }
    const isDone = status === "done";

    let dueDate: ISODate | null = null;
    let startDate: ISODate | null = null;
    for (const column of columns) {
      if (column.type === "DATE" && dueDate === null) {
        const v = getValue(item.id, column.id);
        if (v?.type === "DATE" && v.date) dueDate = v.date;
      }
      if (column.type === "TIMELINE") {
        const v = getValue(item.id, column.id);
        if (v?.type === "TIMELINE") {
          if (v.start && startDate === null) startDate = v.start;
          if (v.end && dueDate === null) dueDate = v.end;
        }
      }
    }

    let priority: string | null = null;
    let size: TShirtSize | null = null;
    const owners = new Set<string>();
    const tags = new Set<string>();
    let requesterName: string | null = null;
    let department: string | null = null;
    let requestedTeam: string | null = null;
    let requestAssetTypes: string[] = [];
    for (const column of columns) {
      const v = getValue(item.id, column.id);
      if (!v) continue;
      switch (v.type) {
        case "PRIORITY":
          if (priority === null && v.labelId && column.settings.kind === "priority") priority = column.settings.labels.find((l) => l.id === v.labelId)?.name ?? null;
          break;
        case "SIZE":
          if (size === null && v.size) size = v.size;
          break;
        case "PERSON":
          if (hasHint(column.name, REQUESTER_HINTS)) {
            const requester = v.userIds.map((id) => users.get(id)).find(Boolean);
            if (requester) {
              requesterName = requester.displayName;
              department = department ?? requester.department ?? null;
            }
          } else {
            for (const id of v.userIds) owners.add(id);
          }
          break;
        case "TAGS":
          if (hasHint(column.name, ASSET_TYPE_HINTS)) requestAssetTypes = v.tags;
          else if (hasHint(column.name, TEAM_HINTS)) requestedTeam = v.tags[0] ?? null;
          else for (const tag of v.tags) tags.add(tag);
          break;
        case "TEXT":
          if (v.text.trim() && hasHint(column.name, REQUESTER_HINTS) && !hasHint(column.name, ["email"])) requesterName = requesterName ?? v.text.trim();
          else if (v.text.trim() && hasHint(column.name, DEPARTMENT_HINTS)) department = department ?? v.text.trim();
          break;
        default:
          break;
      }
    }

    const isIntake = board.system === "TASK_ALLOCATION";
    const lineUnits = lines.reduce((sum, l) => sum + assetCount(l), 0);
    const doneLineUnits = lines.reduce((sum, l) => sum + (l.completedAt ? assetCount(l) : 0), 0);
    const completedAt = isDone ? dateOf(lines.reduce<string | null>((latest, l) => (l.completedAt && (!latest || l.completedAt > latest) ? l.completedAt : latest), null) ?? item.updatedAt) : null;

    let request: RequestFacts | null = null;
    if (isIntake || requesterName || department) {
      const groupName = groupsById.get(item.groupId)?.name.toLowerCase() ?? "";
      const stage: RequestStage = /closed|done|deliver|complete/.test(groupName)
        ? "closed"
        : /allocat|progress|triaged|assigned/.test(groupName)
          ? "allocated"
          : /incoming|new|inbox/.test(groupName)
            ? "incoming"
            : isDone
              ? "closed"
              : status === "progress" || owners.size > 0
                ? "allocated"
                : "incoming";
      const lineTypes = [...new Set(lines.map((l) => l.assetType?.trim()).filter((t): t is string => !!t))];
      request = {
        requesterName,
        department,
        teamName: requestedTeam ?? (isIntake ? null : team.id === NO_TEAM ? null : team.name),
        urgency: priority,
        assetTypes: requestAssetTypes.length ? requestAssetTypes : lineTypes,
        stage,
      };
    }

    const fact: TaskFact = {
      id: item.id,
      name: item.name,
      reference: item.reference ?? null,
      boardId: board.id,
      boardName: board.name,
      team,
      createdAt: dateOf(item.createdAt),
      dueDate,
      startDate,
      completedAt,
      status,
      statusLabel,
      isDone,
      priority,
      size,
      owners: [...owners],
      tags: [...tags],
      assetUnits: lineUnits,
      assetLines: lines.length,
      doneAssetUnits: doneLineUnits,
      request,
      isIntake,
    };

    if (request) requests.push(fact);
    if (isIntake || !kept.has(item.id)) continue;

    tasks.push(fact);
    years.add(Number(fact.createdAt.slice(0, 4)));
    if (fact.dueDate) years.add(Number(fact.dueDate.slice(0, 4)));
    if (fact.completedAt) years.add(Number(fact.completedAt.slice(0, 4)));
    if (earliest === null || fact.createdAt < earliest) earliest = fact.createdAt;
    for (const line of lines) {
      assets.push({
        id: line.id,
        taskId: item.id,
        team,
        boardId: board.id,
        type: line.assetType?.trim() || UNTYPED,
        units: assetCount(line),
        done: !!line.completedAt,
        completedAt: line.completedAt ? dateOf(line.completedAt) : null,
        dueDate: line.dueDate,
        createdAt: dateOf(line.createdAt),
        taskDueDate: dueDate,
        assignees: line.assigneeIds,
      });
    }
  }

  const teamRefs: TeamRef[] = snapshot.teams.filter((t) => !t.system).map((t) => teamRef(t));
  if (snapshot.boards.some((b) => b.teamId === null && b.system !== "TASK_ALLOCATION")) teamRefs.push(noTeam);

  return {
    tasks,
    requests,
    assets,
    teams: teamRefs,
    users,
    boards,
    years: [...years].sort((a, b) => b - a),
    earliest,
  };
}

/**
 * Linked items are one task mirrored on several boards. The earliest copy stands
 * for the set; the others are dropped so the totals do not double up.
 */
function collapseLinked(ids: string[], links: DashboardSnapshot["links"], createdAt: Map<string, string>): Set<string> {
  const present = new Set(ids);
  const leader = new Map<string, string>();
  const find = (id: string): string => {
    const parent = leader.get(id);
    if (!parent || parent === id) return id;
    const root = find(parent);
    leader.set(id, root);
    return root;
  };
  for (const link of links) {
    if (!present.has(link.itemAId) || !present.has(link.itemBId)) continue;
    const a = find(link.itemAId);
    const b = find(link.itemBId);
    if (a !== b) leader.set(b, a);
  }
  const representative = new Map<string, string>();
  for (const id of ids) {
    const root = find(id);
    const current = representative.get(root);
    if (!current || (createdAt.get(id) ?? "") < (createdAt.get(current) ?? "")) representative.set(root, id);
  }
  return new Set(representative.values());
}

// ---------------------------------------------------------------------------
// Placing facts on the calendar and in scope

/** The day a task is counted on, under the chosen basis; null when it falls outside it (e.g. unfinished work under "completed"). */
export function taskDate(task: TaskFact, basis: DateBasis): ISODate | null {
  switch (basis) {
    case "created":
      return task.createdAt;
    case "due":
      return task.dueDate ?? task.createdAt;
    case "completed":
      return task.completedAt;
  }
}

export function assetDate(asset: AssetFact, basis: DateBasis): ISODate | null {
  switch (basis) {
    case "created":
      return asset.createdAt;
    case "due":
      return asset.dueDate ?? asset.taskDueDate ?? asset.createdAt;
    case "completed":
      return asset.completedAt;
  }
}

function inTeams(team: TeamRef, scope: DashboardScope): boolean {
  return scope.teamIds === null || scope.teamIds.includes(team.id);
}

export function tasksInScope(tasks: TaskFact[], scope: DashboardScope): TaskFact[] {
  return tasks.filter((t) => inTeams(t.team, scope) && inSpan(taskDate(t, scope.basis), scope) && (scope.basis !== "completed" || t.isDone));
}

export function assetsInScope(assets: AssetFact[], scope: DashboardScope): AssetFact[] {
  return assets.filter((a) => inTeams(a.team, scope) && inSpan(assetDate(a, scope.basis), scope) && (scope.basis !== "completed" || a.done));
}

/** Requests are counted by when they arrived, whatever the basis: a booking is dated by its booking. */
export function requestsInScope(requests: TaskFact[], scope: DashboardScope): TaskFact[] {
  return requests.filter((r) => inSpan(r.createdAt, scope) && (scope.teamIds === null || r.isIntake || scope.teamIds.includes(r.team.id)));
}

// ---------------------------------------------------------------------------
// Aggregates

export interface NamedCount {
  name: string;
  value: number;
  color: string;
  /** A second figure for the row, when the panel shows two (e.g. tasks beside assets). */
  secondary?: number;
  /** Extra detail for tooltips. */
  detail?: string;
  id?: string;
}

const byValueDesc = (a: NamedCount, b: NamedCount) => b.value - a.value || a.name.localeCompare(b.name);

export interface Summary {
  tasks: number;
  doneTasks: number;
  assetUnits: number;
  doneAssetUnits: number;
  assetLines: number;
  overdue: number;
  stuck: number;
  inProgress: number;
  /** Done tasks finished on or before their due date, over done tasks with a due date. 0–100, or null when nothing qualifies. */
  onTimeRate: number | null;
  people: number;
  teams: number;
  boards: number;
  requests: number;
  openRequests: number;
}

export function summarize(tasks: TaskFact[], assets: AssetFact[], requests: TaskFact[], today: ISODate): Summary {
  const people = new Set<string>();
  const teams = new Set<string>();
  const boards = new Set<string>();
  let doneTasks = 0;
  let overdue = 0;
  let stuck = 0;
  let inProgress = 0;
  let onTimeDone = 0;
  let datedDone = 0;
  for (const t of tasks) {
    for (const id of t.owners) people.add(id);
    teams.add(t.team.id);
    boards.add(t.boardId);
    if (t.isDone) {
      doneTasks += 1;
      if (t.dueDate && t.completedAt) {
        datedDone += 1;
        if (t.completedAt <= t.dueDate) onTimeDone += 1;
      }
    } else if (t.dueDate && t.dueDate < today) overdue += 1;
    if (t.status === "stuck") stuck += 1;
    if (t.status === "progress") inProgress += 1;
  }
  let assetUnits = 0;
  let doneAssetUnits = 0;
  for (const a of assets) {
    assetUnits += a.units;
    if (a.done) doneAssetUnits += a.units;
    for (const id of a.assignees) people.add(id);
  }
  return {
    tasks: tasks.length,
    doneTasks,
    assetUnits,
    doneAssetUnits,
    assetLines: assets.length,
    overdue,
    stuck,
    inProgress,
    onTimeRate: datedDone > 0 ? Math.round((onTimeDone / datedDone) * 100) : null,
    people: people.size,
    teams: teams.size,
    boards: boards.size,
    requests: requests.length,
    openRequests: requests.filter((r) => r.request?.stage !== "closed").length,
  };
}

export function teamHex(team: TeamRef): string {
  return colorClasses(team.color).hex;
}

export interface TeamDelivery extends TeamRef {
  tasks: number;
  doneTasks: number;
  assetUnits: number;
  doneAssetUnits: number;
  overdue: number;
}

/** What each team delivered: tasks and assets side by side, biggest first, teams with nothing at the end. */
export function deliveryByTeam(tasks: TaskFact[], assets: AssetFact[], teams: TeamRef[], today: ISODate, unit: Unit): TeamDelivery[] {
  const rows = new Map<string, TeamDelivery>(teams.map((t) => [t.id, { ...t, tasks: 0, doneTasks: 0, assetUnits: 0, doneAssetUnits: 0, overdue: 0 }]));
  const ensure = (team: TeamRef) => {
    let row = rows.get(team.id);
    if (!row) {
      row = { ...team, tasks: 0, doneTasks: 0, assetUnits: 0, doneAssetUnits: 0, overdue: 0 };
      rows.set(team.id, row);
    }
    return row;
  };
  for (const t of tasks) {
    const row = ensure(t.team);
    row.tasks += 1;
    if (t.isDone) row.doneTasks += 1;
    else if (t.dueDate && t.dueDate < today) row.overdue += 1;
  }
  for (const a of assets) {
    const row = ensure(a.team);
    row.assetUnits += a.units;
    if (a.done) row.doneAssetUnits += a.units;
  }
  return [...rows.values()].sort((a, b) => (unit === "assets" ? b.assetUnits - a.assetUnits || b.tasks - a.tasks : b.tasks - a.tasks || b.assetUnits - a.assetUnits) || a.name.localeCompare(b.name));
}

const ASSET_TYPE_COLORS = new Map(BOOKING_ASSET_TYPES.map((o) => [o.name.toLowerCase(), o.color]));

export function assetTypeHex(type: string): string {
  if (type === UNTYPED) return colorClasses("gray").hex;
  return colorClasses(ASSET_TYPE_COLORS.get(type.toLowerCase()) ?? tagColorFor(type)).hex;
}

/** Units delivered per asset type, biggest first. */
export function assetMix(assets: AssetFact[]): NamedCount[] {
  const rows = new Map<string, NamedCount & { lines: number; done: number }>();
  for (const a of assets) {
    const row = rows.get(a.type) ?? { name: a.type, value: 0, color: assetTypeHex(a.type), lines: 0, done: 0 };
    row.value += a.units;
    row.lines += 1;
    if (a.done) row.done += a.units;
    rows.set(a.type, row);
  }
  return [...rows.values()]
    .map((r) => ({ name: r.name, value: r.value, color: r.color, secondary: r.done, detail: `${r.lines} ${r.lines === 1 ? "line" : "lines"} · ${r.done} of ${r.value} done` }))
    .sort(byValueDesc);
}

export interface StackedRow {
  name: string;
  total: number;
  segments: Array<{ key: string; label: string; value: number; color: string }>;
}

/** For each asset type, how the units split across teams — the distribution chart. */
export function assetTypesByTeam(assets: AssetFact[], teams: TeamRef[]): StackedRow[] {
  const order = new Map(teams.map((t, i) => [t.id, i]));
  const rows = new Map<string, Map<string, { team: TeamRef; value: number }>>();
  for (const a of assets) {
    const row = rows.get(a.type) ?? new Map();
    const cell = row.get(a.team.id) ?? { team: a.team, value: 0 };
    cell.value += a.units;
    row.set(a.team.id, cell);
    rows.set(a.type, row);
  }
  return [...rows.entries()]
    .map(([type, cells]) => {
      const segments = [...cells.values()]
        .sort((x, y) => (order.get(x.team.id) ?? 99) - (order.get(y.team.id) ?? 99))
        .map((c) => ({ key: c.team.id, label: c.team.name, value: c.value, color: teamHex(c.team) }));
      return { name: type, total: segments.reduce((s, x) => s + x.value, 0), segments };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** For each team, how its tasks split by status role — the progress chart. */
export function statusByTeam(tasks: TaskFact[], teams: TeamRef[]): StackedRow[] {
  const rows = new Map<string, { team: TeamRef; counts: Record<StatusBucket, number> }>();
  for (const t of tasks) {
    const row = rows.get(t.team.id) ?? { team: t.team, counts: { done: 0, progress: 0, stuck: 0, other: 0, none: 0 } };
    row.counts[t.status] += 1;
    rows.set(t.team.id, row);
  }
  const order = new Map(teams.map((t, i) => [t.id, i]));
  return [...rows.values()]
    .sort((a, b) => (order.get(a.team.id) ?? 99) - (order.get(b.team.id) ?? 99))
    .map(({ team, counts }) => ({
      name: team.name,
      total: Object.values(counts).reduce((s, n) => s + n, 0),
      segments: STATUS_BUCKETS.filter((b) => counts[b.key] > 0).map((b) => ({ key: b.key, label: b.label, value: counts[b.key], color: b.color })),
    }));
}

export const STATUS_BUCKETS: Array<{ key: StatusBucket; label: string; color: string }> = [
  { key: "done", label: "Done", color: colorClasses("green").hex },
  { key: "progress", label: "In progress", color: colorClasses("orange").hex },
  { key: "stuck", label: "Stuck", color: colorClasses("red").hex },
  { key: "other", label: "Queued", color: colorClasses("sky").hex },
  { key: "none", label: "No status", color: colorClasses("gray").hex },
];

export function statusMix(tasks: TaskFact[]): NamedCount[] {
  const counts: Record<StatusBucket, number> = { done: 0, progress: 0, stuck: 0, other: 0, none: 0 };
  for (const t of tasks) counts[t.status] += 1;
  return STATUS_BUCKETS.filter((b) => counts[b.key] > 0).map((b) => ({ name: b.label, value: counts[b.key], color: b.color, id: b.key }));
}

const PRIORITY_COLORS: Record<string, ColorToken> = { critical: "rose", urgent: "rose", high: "orange", medium: "blue", low: "gray" };

export function priorityMix(tasks: TaskFact[]): NamedCount[] {
  const rows = new Map<string, NamedCount>();
  for (const t of tasks) {
    const name = t.priority ?? "No priority";
    const row = rows.get(name) ?? { name, value: 0, color: colorClasses(t.priority ? (PRIORITY_COLORS[t.priority.toLowerCase()] ?? tagColorFor(t.priority)) : "gray").hex };
    row.value += 1;
    rows.set(name, row);
  }
  const rank = ["critical", "urgent", "high", "medium", "low"];
  return [...rows.values()].sort((a, b) => {
    const ra = rank.indexOf(a.name.toLowerCase());
    const rb = rank.indexOf(b.name.toLowerCase());
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || byValueDesc(a, b);
  });
}

const SIZE_COLORS: Record<TShirtSize, ColorToken> = { XS: "sky", S: "green", M: "blue", L: "orange", XL: "rose" };

export function sizeMix(tasks: TaskFact[]): NamedCount[] {
  const counts = new Map<TShirtSize, number>();
  for (const t of tasks) if (t.size) counts.set(t.size, (counts.get(t.size) ?? 0) + 1);
  return T_SHIRT_SIZES.filter((s) => counts.has(s)).map((s) => ({ name: s, value: counts.get(s)!, color: colorClasses(SIZE_COLORS[s]).hex }));
}

/** Tasks (and asset units) per person, biggest first. Unassigned work is not a person and is left out. */
export function loadByPerson(tasks: TaskFact[], assets: AssetFact[], users: Map<string, User>, limit = 10): NamedCount[] {
  const rows = new Map<string, NamedCount>();
  const ensure = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      const user = users.get(id);
      row = { id, name: user?.displayName ?? "Former member", value: 0, secondary: 0, color: colorClasses("indigo").hex };
      rows.set(id, row);
    }
    return row;
  };
  for (const t of tasks) for (const id of t.owners) ensure(id).value += 1;
  for (const a of assets) for (const id of a.assignees) ensure(id).secondary! += a.units;
  return [...rows.values()].sort(byValueDesc).slice(0, limit);
}

export interface BoardRow {
  id: string;
  name: string;
  icon: string;
  color: ColorToken;
  team: TeamRef;
  tasks: number;
  doneTasks: number;
  assetUnits: number;
  overdue: number;
}

export function boardsLeaderboard(tasks: TaskFact[], assets: AssetFact[], boards: Map<string, Board>, today: ISODate): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  const ensure = (t: { boardId: string; team: TeamRef }) => {
    let row = rows.get(t.boardId);
    if (!row) {
      const board = boards.get(t.boardId);
      row = { id: t.boardId, name: board?.name ?? "Board", icon: board?.icon ?? "layout-grid", color: board?.color ?? "gray", team: t.team, tasks: 0, doneTasks: 0, assetUnits: 0, overdue: 0 };
      rows.set(t.boardId, row);
    }
    return row;
  };
  for (const t of tasks) {
    const row = ensure(t);
    row.tasks += 1;
    if (t.isDone) row.doneTasks += 1;
    else if (t.dueDate && t.dueDate < today) row.overdue += 1;
  }
  for (const a of assets) ensure(a).assetUnits += a.units;
  return [...rows.values()].sort((a, b) => b.tasks - a.tasks || b.assetUnits - a.assetUnits || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Across the year

export interface MonthPoint {
  /** 0–11 */
  month: number;
  value: number;
  done: number;
}

export interface YearDot {
  id: string;
  name: string;
  /** Fraction of the year, 0 (1 Jan) to 1 (31 Dec). */
  x: number;
  value: number;
  color: string;
  team: TeamRef;
  date: ISODate;
  boardId: string;
  isDone: boolean;
  /** For asset-unit dots: how many lines the task carried. */
  lines: number;
}

function yearFraction(date: ISODate): number {
  const year = Number(date.slice(0, 4));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const at = Date.UTC(year, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.min(1, Math.max(0, (at - start) / (end - start)));
}

/**
 * The twelve months of a year: how many tasks (or asset units) land in each,
 * how many of those were finished, and one dot per task placed on its exact day
 * — sized by its asset count so a big job stands out from a run of small ones.
 */
export function acrossTheYear(tasks: TaskFact[], assets: AssetFact[], year: number, basis: DateBasis, unit: Unit, teamIds: string[] | null): { months: MonthPoint[]; dots: YearDot[] } {
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, month) => ({ month, value: 0, done: 0 }));
  const dots: YearDot[] = [];
  const keepTeam = (team: TeamRef) => teamIds === null || teamIds.includes(team.id);
  if (unit === "assets") {
    // Units per month from the lines themselves (a line can be due apart from its task)…
    for (const a of assets) {
      if (!keepTeam(a.team)) continue;
      const date = assetDate(a, basis);
      if (!date || Number(date.slice(0, 4)) !== year || (basis === "completed" && !a.done)) continue;
      const point = months[Number(date.slice(5, 7)) - 1]!;
      point.value += a.units;
      if (a.done) point.done += a.units;
    }
  }
  for (const t of tasks) {
    if (!keepTeam(t.team)) continue;
    const date = taskDate(t, basis);
    if (!date || Number(date.slice(0, 4)) !== year || (basis === "completed" && !t.isDone)) continue;
    if (unit === "tasks") {
      const point = months[Number(date.slice(5, 7)) - 1]!;
      point.value += 1;
      if (t.isDone) point.done += 1;
    }
    const value = unit === "assets" ? t.assetUnits : 1;
    if (value <= 0) continue;
    dots.push({ id: t.id, name: t.name, x: yearFraction(date), value, color: teamHex(t.team), team: t.team, date, boardId: t.boardId, isDone: t.isDone, lines: t.assetLines });
  }
  dots.sort((a, b) => a.x - b.x);
  return { months, dots };
}

/** Tasks or asset units per month across a whole year, for a small sparkline. */
export function monthlyTotals(points: MonthPoint[]): number[] {
  return points.map((p) => p.value);
}

// ---------------------------------------------------------------------------
// Stakeholder requests

export interface RequestsSummary {
  total: number;
  open: number;
  byStage: NamedCount[];
  byDepartment: NamedCount[];
  byTeam: NamedCount[];
  byUrgency: NamedCount[];
  byAssetType: NamedCount[];
  /** Requests per month of the given year. */
  perMonth: number[];
  /** Median days from booking to due date, or null. */
  medianLeadDays: number | null;
}

const STAGE_META: Record<RequestStage, { label: string; color: ColorToken }> = {
  incoming: { label: "Incoming", color: "blue" },
  allocated: { label: "Allocated", color: "orange" },
  closed: { label: "Closed", color: "green" },
};

export function summarizeRequests(requests: TaskFact[], year: number, teams: TeamRef[]): RequestsSummary {
  const byStage = new Map<RequestStage, number>();
  const byDepartment = new Map<string, number>();
  const byTeam = new Map<string, number>();
  const byUrgency = new Map<string, number>();
  const byAssetType = new Map<string, number>();
  const perMonth = Array.from({ length: 12 }, () => 0);
  const leads: number[] = [];
  const teamColor = new Map(teams.map((t) => [t.name, teamHex(t)]));
  for (const r of requests) {
    const req = r.request!;
    byStage.set(req.stage, (byStage.get(req.stage) ?? 0) + 1);
    const dept = req.department ?? "Not stated";
    byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + 1);
    const team = req.teamName ?? "Unassigned";
    byTeam.set(team, (byTeam.get(team) ?? 0) + 1);
    const urgency = req.urgency ?? "Not stated";
    byUrgency.set(urgency, (byUrgency.get(urgency) ?? 0) + 1);
    for (const type of req.assetTypes.length ? req.assetTypes : [UNTYPED]) byAssetType.set(type, (byAssetType.get(type) ?? 0) + 1);
    if (Number(r.createdAt.slice(0, 4)) === year) {
      const month = Number(r.createdAt.slice(5, 7)) - 1;
      perMonth[month] = (perMonth[month] ?? 0) + 1;
    }
    if (r.dueDate) leads.push(Math.round((Date.parse(r.dueDate) - Date.parse(r.createdAt)) / 86_400_000));
  }
  leads.sort((a, b) => a - b);
  const median = leads.length ? leads[Math.floor(leads.length / 2)]! : null;
  const palette = ["indigo", "violet", "sky", "teal", "green", "amber", "orange", "rose", "pink", "cyan"] as ColorToken[];
  const ranked = (map: Map<string, number>, color: (name: string, i: number) => string) =>
    [...map.entries()]
      .map(([name, value]) => ({ name, value, color: "" }))
      .sort(byValueDesc)
      .map((row, i) => ({ ...row, color: color(row.name, i) }));
  return {
    total: requests.length,
    open: requests.filter((r) => r.request?.stage !== "closed").length,
    byStage: (["incoming", "allocated", "closed"] as RequestStage[]).filter((s) => byStage.has(s)).map((s) => ({ id: s, name: STAGE_META[s].label, value: byStage.get(s)!, color: colorClasses(STAGE_META[s].color).hex })),
    byDepartment: ranked(byDepartment, (_n, i) => colorClasses(palette[i % palette.length]!).hex),
    byTeam: ranked(byTeam, (name) => teamColor.get(name) ?? colorClasses("gray").hex),
    byUrgency: priorityMix(requests.map((r) => ({ ...r, priority: r.request?.urgency ?? null }))),
    byAssetType: ranked(byAssetType, (name) => assetTypeHex(name)),
    perMonth,
    medianLeadDays: median,
  };
}

// ---------------------------------------------------------------------------
// Recently delivered

export interface DeliveredEntry {
  task: TaskFact;
  when: ISODate;
}

/** The most recently finished tasks in scope, newest first. */
export function recentlyDelivered(tasks: TaskFact[], limit = 8): DeliveredEntry[] {
  return tasks
    .filter((t) => t.isDone && t.completedAt)
    .map((t) => ({ task: t, when: t.completedAt! }))
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, limit);
}

/** Percentage change from `previous` to `current`, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
