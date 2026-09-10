import type {
  Board,
  BoardColumn,
  ColumnValue,
  Item,
  ItemAsset,
  PortalDeliverable,
  PortalPerson,
  PortalPriority,
  PortalStatus,
  PortalSubitem,
  PortalTask,
  PortalTotals,
  StatusColumnSettings,
  User,
} from "@/domain";
import { columnLabels, priorityStrength, statusLabelRole, userInitials } from "@/domain";
import { avatarColorFor } from "@/lib/colors";
import { isOverdue } from "@/lib/dates/dates";

/**
 * Turning a board row into something a stakeholder may read.
 *
 * Every board in the workspace describes itself differently: one calls its
 * status column "Status" and another "Stage", one tracks dates in a DATE column
 * and another in a TIMELINE, one has three people columns and another none. The
 * portal shows all of them in one list, so each row has to be read through its
 * own board's columns and emitted as one typed shape.
 *
 * The rules are deterministic and written down, because "whatever the first
 * matching column says" is how two boards end up silently disagreeing:
 *
 *  · Status comes from the board's STATUS column — the first one, by position.
 *    Its meaning travels as a role (done / stuck / working / pending) taken from
 *    the board's own role assignments, never from the label's wording and never
 *    from its id, which means nothing outside that board.
 *  · Priority likewise, with a 0–3 strength so unlike boards can be sorted and
 *    charted together.
 *  · A due date is the DATE column if there is one, else the end of a TIMELINE.
 *    That is the same precedence the internal board model uses.
 *  · People are every PERSON column pooled, deduplicated, in column order.
 *  · A board with none of these emits nulls. It does not fall back to guessing
 *    from another board's labels or from a column that merely looks similar.
 */

/** Everything one board contributes, gathered once so a page is not N+1 reads. */
export interface BoardContext {
  board: Board;
  columns: BoardColumn[];
  /** Values for the items being projected, keyed itemId → columnId → value. */
  values: Map<string, Map<string, ColumnValue>>;
}

export interface ProjectionContext {
  boards: Map<string, BoardContext>;
  usersById: Map<string, User>;
  assetsByItem: Map<string, ItemAsset[]>;
  subitemsByParent: Map<string, Item[]>;
  linkCountByItem: Map<string, number>;
  /** Provenance: when the request arrived, which is not when the item was made. */
  bookedAtByItem: Map<string, string>;
  /** Whether a board's name may be shown as the request's source. */
  publishSourceName: boolean;
  today: string;
}

function firstOfType(columns: readonly BoardColumn[], type: BoardColumn["type"]): BoardColumn | null {
  return columns.filter((column) => column.type === type).sort((a, b) => a.position - b.position)[0] ?? null;
}

export function toPortalPerson(user: User): PortalPerson {
  return { id: user.id, displayName: user.displayName, initials: userInitials(user), color: avatarColorFor(user.id) };
}

/** The status a row is in, as a name, a colour and a meaning. */
export function projectStatus(columns: readonly BoardColumn[], values: Map<string, ColumnValue> | undefined): PortalStatus | null {
  const column = firstOfType(columns, "STATUS");
  if (!column || column.settings.kind !== "status") return null;
  const value = values?.get(column.id);
  const settings = column.settings as StatusColumnSettings;
  const labelId = value?.type === "STATUS" ? value.labelId : settings.defaultLabelId;
  const label = columnLabels(column).find((l) => l.id === labelId);
  if (!label) return null;
  const role = statusLabelRole(settings, label.id);
  return { name: label.name, color: label.color, role: role === "progress" ? "working" : (role ?? "pending") };
}

export function projectPriority(columns: readonly BoardColumn[], values: Map<string, ColumnValue> | undefined): PortalPriority | null {
  const column = firstOfType(columns, "PRIORITY");
  if (!column || column.settings.kind !== "priority") return null;
  const value = values?.get(column.id);
  // Priority has no default label; an unset cell simply has no priority.
  const labelId = value?.type === "PRIORITY" ? value.labelId : null;
  const label = columnLabels(column).find((l) => l.id === labelId);
  if (!label) return null;
  return { name: label.name, color: label.color, strength: priorityStrength(label.id) };
}

/** The DATE column, or the end of a TIMELINE — the board model's own precedence. */
export function projectDates(
  columns: readonly BoardColumn[],
  values: Map<string, ColumnValue> | undefined,
): { dueDate: string | null; timeline: { start: string | null; end: string | null } | null } {
  const dateColumn = firstOfType(columns, "DATE");
  const timelineColumn = firstOfType(columns, "TIMELINE");
  const dateValue = dateColumn ? values?.get(dateColumn.id) : undefined;
  const timelineValue = timelineColumn ? values?.get(timelineColumn.id) : undefined;
  const timeline = timelineValue?.type === "TIMELINE" ? { start: timelineValue.start, end: timelineValue.end } : null;
  const dueDate = dateValue?.type === "DATE" && dateValue.date ? dateValue.date : (timeline?.end ?? null);
  return { dueDate, timeline };
}

/** Every PERSON column pooled, in column order, each person once. */
export function projectPeople(columns: readonly BoardColumn[], values: Map<string, ColumnValue> | undefined, usersById: Map<string, User>): PortalPerson[] {
  const seen = new Set<string>();
  const people: PortalPerson[] = [];
  for (const column of columns.filter((c) => c.type === "PERSON").sort((a, b) => a.position - b.position)) {
    const value = values?.get(column.id);
    if (value?.type !== "PERSON") continue;
    for (const id of value.userIds) {
      const user = usersById.get(id);
      if (!user || seen.has(id)) continue;
      seen.add(id);
      people.push(toPortalPerson(user));
    }
  }
  return people;
}

/**
 * The asset types the request itself named, from the board's own tag column.
 *
 * These are the requester's answer to "what kind of thing is this?" and belong
 * to the task, not to any one deliverable. A deliverable only carries a type
 * when the request named exactly one — with two there is no way to know which
 * line is which — so reading kinds off the deliverables alone reported nothing
 * for every request that picked more than one.
 */
export function projectAssetTypes(columns: readonly BoardColumn[], values: Map<string, ColumnValue> | undefined): string[] {
  const column = columns.filter((c) => c.type === "TAGS").sort((a, b) => a.position - b.position).find((c) => c.name.toLowerCase().includes("asset"));
  const value = column ? values?.get(column.id) : undefined;
  if (value?.type !== "TAGS") return [];
  return [...new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function projectDeliverable(asset: ItemAsset, usersById: Map<string, User>): PortalDeliverable {
  return {
    id: asset.id,
    name: asset.name,
    assetType: asset.assetType,
    quantity: asset.quantity ?? 1,
    dueDate: asset.dueDate,
    done: asset.completedAt !== null,
    // Notes and any URL stay internal: they carry working chatter and are not
    // part of what a request agreed to publish.
    assignees: asset.assigneeIds.map((id) => usersById.get(id)).filter((u): u is User => !!u).map(toPortalPerson),
  };
}

export function projectSubitem(item: Item, ctx: ProjectionContext): PortalSubitem {
  const board = ctx.boards.get(item.boardId);
  const status = board ? projectStatus(board.columns, board.values.get(item.id)) : null;
  return { id: item.id, name: item.name, done: status?.role === "done" };
}

/** One request, as its list row. */
export function projectTask(item: Item, ctx: ProjectionContext): PortalTask {
  const board = ctx.boards.get(item.boardId);
  const columns = board?.columns ?? [];
  const values = board?.values.get(item.id);
  const assets = ctx.assetsByItem.get(item.id) ?? [];
  const subitems = ctx.subitemsByParent.get(item.id) ?? [];
  const { dueDate, timeline } = projectDates(columns, values);

  return {
    id: item.id,
    reference: item.reference ?? null,
    name: item.name,
    status: projectStatus(columns, values),
    priority: projectPriority(columns, values),
    dueDate,
    timeline,
    people: projectPeople(columns, values, ctx.usersById),
    sourceName: ctx.publishSourceName ? (board?.board.name ?? null) : null,
    assetTypes: projectAssetTypes(columns, values),
    deliverables: { total: assets.length, done: assets.filter((a) => a.completedAt !== null).length },
    subitems: { total: subitems.length, done: subitems.filter((s) => projectSubitem(s, ctx).done).length },
    linkedCount: ctx.linkCountByItem.get(item.id) ?? 0,
    bookedAt: ctx.bookedAtByItem.get(item.id) ?? item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Figures over the whole authorised set, never over one page.
 *
 * A request with two people in charge is counted under each of them in
 * `byPerson` — that is what "who is carrying this" means — while `requests`
 * counts each request once. Labelling a page's numbers as a department's totals
 * would be a lie, so this is always given every task, not the page.
 */
/**
 * The figures over the whole authorised set.
 *
 * `deliverableTypes` is passed in rather than derived: a `PortalTask` carries
 * how many deliverables it has, not what kinds they are, and counting kinds
 * across the department needs the deliverables themselves.
 */
export function summarise(tasks: readonly PortalTask[], today: string, deliverableTypes = 0): PortalTotals {
  const byStatus = new Map<string, { name: string; color: PortalStatus["color"]; count: number }>();
  const byPerson = new Map<string, { person: PortalPerson; count: number }>();
  const bySource = new Map<string, number>();
  let done = 0;
  let overdue = 0;
  let deliverables = 0;
  let deliverablesDone = 0;

  for (const task of tasks) {
    const complete = task.status?.role === "done";
    if (complete) done += 1;
    if (!complete && isOverdue(task.dueDate, new Date(today))) overdue += 1;

    if (task.status) {
      const entry = byStatus.get(task.status.name) ?? { name: task.status.name, color: task.status.color, count: 0 };
      entry.count += 1;
      byStatus.set(task.status.name, entry);
    }
    for (const person of task.people) {
      const entry = byPerson.get(person.id) ?? { person, count: 0 };
      entry.count += 1;
      byPerson.set(person.id, entry);
    }
    if (task.sourceName) bySource.set(task.sourceName, (bySource.get(task.sourceName) ?? 0) + 1);
    deliverables += task.deliverables.total;
    deliverablesDone += task.deliverables.done;
  }

  return {
    requests: tasks.length,
    done,
    overdue,
    deliverables: { total: deliverables, done: deliverablesDone, types: deliverableTypes },
    byStatus: [...byStatus.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    byPerson: [...byPerson.values()].sort((a, b) => b.count - a.count || a.person.displayName.localeCompare(b.person.displayName)),
    bySource: [...bySource.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/**
 * What the portal's search matches.
 *
 * The title, the booking code and the published brief — the three things a
 * stakeholder has to hand. Not the internal description, not a person's name,
 * not anything the projection has already refused to publish.
 */
export function matchesPortalSearch(task: PortalTask, brief: string | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (task.name.toLowerCase().includes(q)) return true;
  if (brief && brief.toLowerCase().includes(q)) return true;
  const reference = task.reference?.toLowerCase();
  if (!reference) return false;
  const loose = (value: string) => value.replace(/[\s-]/g, "");
  return reference.includes(q) || loose(reference).includes(loose(q));
}
