import { addDays, addWeeks, endOfWeek, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import type { BoardColumn, BoardGroup, ColorToken, ItemAsset, TagOption, User } from "@/domain";
import { assetCount, columnLabels, statusLabelRole, T_SHIRT_SIZE_COLORS, T_SHIRT_SIZES, type StatusLabelRole } from "@/domain";
import type { BoardModel } from "@/features/boards/board-model";
import { primaryDueDate, type ValueLookup } from "@/features/boards/board-filtering";
import { tagColor, tagOptionsFor } from "@/features/boards/tag-palette";
import { avatarColorFor, tagColorFor } from "@/lib/colors";
import { parseISODate, toISODate } from "@/lib/dates/dates";

/**
 * The sums behind the Workload and Chart views, kept free of React so they are
 * cheap to test. Everything works on item ids and a value lookup, so the views
 * hand in whatever the board model already filtered and sorted.
 */

/** The bare minimum an item needs to be counted: an id and the group it sits in. */
export type AggregateItem = { id: string; groupId: string };

export interface AggregateContext {
  columns: BoardColumn[];
  groups: BoardGroup[];
  getValue: ValueLookup;
  now: Date;
  /** Display name for a user id; people buckets are labelled and ordered by it. */
  userName?: (userId: string) => string | undefined;
  /** The palette of a TAGS column (plus tags in use), for tag colours. */
  tagOptions?: (column: BoardColumn) => TagOption[];
  /** Asset lines per item, for the "assetUnits" measure. */
  assetsByItem?: Map<string, ReadonlyArray<Pick<ItemAsset, "quantity">>>;
}

/** The context a view builds from its board model. */
export function contextFromModel(model: Pick<BoardModel, "columns" | "groups" | "getValue" | "snapshot">, now: Date, users: ReadonlyArray<Pick<User, "id" | "displayName">>, assets?: ReadonlyArray<Pick<ItemAsset, "itemId" | "quantity">>): AggregateContext {
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const assetsByItem = new Map<string, Array<Pick<ItemAsset, "quantity">>>();
  for (const line of assets ?? []) {
    const list = assetsByItem.get(line.itemId) ?? [];
    list.push(line);
    assetsByItem.set(line.itemId, list);
  }
  return {
    columns: model.columns,
    groups: model.groups,
    getValue: model.getValue,
    now,
    userName: (id) => names.get(id),
    tagOptions: (column) => tagOptionsFor(column, model.snapshot.values),
    assetsByItem,
  };
}

// ---------------------------------------------------------------------------
// Item facts shared by every aggregate

/** Every person assigned to the item across all PERSON columns, each once. */
export function itemOwners(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): string[] {
  const owners = new Set<string>();
  for (const column of ctx.columns) {
    if (column.type !== "PERSON") continue;
    const v = ctx.getValue(itemId, column.id);
    if (v?.type === "PERSON") for (const id of v.userIds) owners.add(id);
  }
  return [...owners];
}

/** Every tag on the item across all TAGS columns, each once, with the column it came from (for its colour). */
function itemTags(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): Array<{ tag: string; column: BoardColumn }> {
  const seen = new Set<string>();
  const result: Array<{ tag: string; column: BoardColumn }> = [];
  for (const column of ctx.columns) {
    if (column.type !== "TAGS") continue;
    const v = ctx.getValue(itemId, column.id);
    if (v?.type !== "TAGS") continue;
    for (const tag of v.tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ tag, column });
    }
  }
  return result;
}

/** The item's status label id, or null. */
function statusLabelId(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): string | null {
  const column = ctx.columns.find((c) => c.type === "STATUS");
  if (!column) return null;
  const v = ctx.getValue(itemId, column.id);
  return v?.type === "STATUS" ? v.labelId : null;
}

/** The role of the item's status label: done, stuck, progress, or null for anything else. */
export function itemStatusRole(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): StatusLabelRole | null {
  const column = ctx.columns.find((c) => c.type === "STATUS");
  if (!column || column.settings.kind !== "status") return null;
  return statusLabelRole(column.settings, statusLabelId(itemId, ctx));
}

export function isItemDone(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): boolean {
  return itemStatusRole(itemId, ctx) === "done";
}

/** The item's due date: the DATE column, else the end of its timeline. */
export function itemDueDate(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue">): string | null {
  return primaryDueDate(itemId, ctx.columns, ctx.getValue);
}

/** Not done and due before today. */
export function isItemOverdue(itemId: string, ctx: Pick<AggregateContext, "columns" | "getValue" | "now">): boolean {
  const due = itemDueDate(itemId, ctx);
  return due !== null && due < toISODate(ctx.now) && !isItemDone(itemId, ctx);
}

// ---------------------------------------------------------------------------
// Grouping

export const GROUP_DIMENSIONS = ["status", "priority", "group", "person", "tags", "size", "dueWeek"] as const;
export type GroupDimension = (typeof GROUP_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<GroupDimension, string> = {
  status: "Status",
  priority: "Priority",
  group: "Group",
  person: "Person",
  tags: "Tags",
  size: "T-shirt size",
  dueWeek: "Due week",
};

/** The dimensions a board can be split by: only those it has a column for. Groups are always there. */
export function availableDimensions(columns: ReadonlyArray<Pick<BoardColumn, "type">>): GroupDimension[] {
  const types = new Set(columns.map((c) => c.type));
  return GROUP_DIMENSIONS.filter((d) => {
    switch (d) {
      case "status":
        return types.has("STATUS");
      case "priority":
        return types.has("PRIORITY");
      case "group":
        return true;
      case "person":
        return types.has("PERSON");
      case "tags":
        return types.has("TAGS");
      case "size":
        return types.has("SIZE");
      case "dueWeek":
        return types.has("DATE") || types.has("TIMELINE");
    }
  });
}

export interface Bucket {
  key: string;
  label: string;
  /** Null for the "none" bucket and for dimensions without a colour of their own (due weeks). */
  color: ColorToken | null;
  itemIds: string[];
}

/** Key of the bucket that collects items without a value in the chosen dimension. */
export const NONE_KEY = "__none__";

const NONE_LABELS: Record<GroupDimension, string> = {
  status: "No status",
  priority: "No priority",
  group: "No group",
  person: "Unassigned",
  tags: "No tags",
  size: "No size",
  dueWeek: "No date",
};

/** The Monday of the week holding the date, as an ISO date. */
export function weekKeyOf(iso: string): string | null {
  const date = parseISODate(iso);
  return date ? toISODate(startOfWeek(date, { weekStartsOn: 1 })) : null;
}

/** "Week of 7 Sep". */
export function weekLabel(mondayIso: string): string {
  const date = parseISODate(mondayIso);
  return date ? format(date, "'Week of' d MMM") : mondayIso;
}

/**
 * Splits items into buckets along one dimension. An item with two owners or
 * two tags counts in both buckets; an item without a value lands in a trailing
 * "none" bucket. Empty buckets are dropped, so a chart never shows a zero bar
 * for a label nobody uses.
 *
 * Order: status and priority follow their label order, groups their position,
 * sizes run XS to XL, weeks are chronological, people are alphabetical and tags
 * go from most to least used.
 */
export function groupItems(items: ReadonlyArray<AggregateItem>, dimension: GroupDimension, ctx: AggregateContext): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const put = (key: string, label: string, color: ColorToken | null, itemId: string) => {
    const bucket = buckets.get(key) ?? { key, label, color, itemIds: [] };
    bucket.itemIds.push(itemId);
    buckets.set(key, bucket);
  };
  const none = (itemId: string) => put(NONE_KEY, NONE_LABELS[dimension], null, itemId);

  switch (dimension) {
    case "status":
    case "priority": {
      const column = ctx.columns.find((c) => c.type === (dimension === "status" ? "STATUS" : "PRIORITY"));
      const labels = column ? columnLabels(column) : [];
      for (const item of items) {
        const v = column ? ctx.getValue(item.id, column.id) : undefined;
        const label = v && (v.type === "STATUS" || v.type === "PRIORITY") ? labels.find((l) => l.id === v.labelId) : undefined;
        if (label) put(label.id, label.name, label.color, item.id);
        else none(item.id);
      }
      const order = new Map(labels.map((l, i) => [l.id, i]));
      return sortBuckets(buckets, (b) => order.get(b.key) ?? Number.MAX_SAFE_INTEGER);
    }
    case "group": {
      for (const item of items) {
        const group = ctx.groups.find((g) => g.id === item.groupId);
        if (group) put(group.id, group.name, group.color, item.id);
        else none(item.id);
      }
      const order = new Map(ctx.groups.map((g) => [g.id, g.position]));
      return sortBuckets(buckets, (b) => order.get(b.key) ?? Number.MAX_SAFE_INTEGER);
    }
    case "person": {
      for (const item of items) {
        const owners = itemOwners(item.id, ctx);
        if (owners.length === 0) none(item.id);
        for (const id of owners) put(id, ctx.userName?.(id) ?? "Unknown user", avatarColorFor(id), item.id);
      }
      return sortBuckets(buckets, null, (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    case "tags": {
      for (const item of items) {
        const tags = itemTags(item.id, ctx);
        if (tags.length === 0) none(item.id);
        for (const { tag, column } of tags) {
          const options = ctx.tagOptions?.(column);
          put(tag.toLowerCase(), tag, options ? tagColor(options, tag) : tagColorFor(tag), item.id);
        }
      }
      return sortBuckets(buckets, null, (a, b) => b.itemIds.length - a.itemIds.length || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    case "size": {
      const column = ctx.columns.find((c) => c.type === "SIZE");
      for (const item of items) {
        const v = column ? ctx.getValue(item.id, column.id) : undefined;
        if (v?.type === "SIZE" && v.size) put(v.size, v.size, T_SHIRT_SIZE_COLORS[v.size], item.id);
        else none(item.id);
      }
      return sortBuckets(buckets, (b) => {
        const index = (T_SHIRT_SIZES as readonly string[]).indexOf(b.key);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      });
    }
    case "dueWeek": {
      for (const item of items) {
        const due = itemDueDate(item.id, ctx);
        const week = due ? weekKeyOf(due) : null;
        if (week) put(week, weekLabel(week), null, item.id);
        else none(item.id);
      }
      return sortBuckets(buckets, null, (a, b) => a.key.localeCompare(b.key));
    }
  }
}

/** Orders buckets by rank or comparator; the "none" bucket always comes last. */
function sortBuckets(buckets: Map<string, Bucket>, rank: ((b: Bucket) => number) | null, compare?: (a: Bucket, b: Bucket) => number): Bucket[] {
  const list = [...buckets.values()];
  list.sort((a, b) => {
    if (a.key === NONE_KEY) return b.key === NONE_KEY ? 0 : 1;
    if (b.key === NONE_KEY) return -1;
    if (rank) return rank(a) - rank(b);
    return compare ? compare(a, b) : 0;
  });
  return list;
}

// ---------------------------------------------------------------------------
// Measures

/** What a bucket adds up to: how many items, the sum of one Number column, or the units on the items' asset lists. */
export type Measure = "count" | "assetUnits" | `sum:${string}`;

export function sumColumnId(measure: Measure): string | null {
  return measure.startsWith("sum:") ? measure.slice("sum:".length) : null;
}

export function measureItems(itemIds: ReadonlyArray<string>, measure: Measure, ctx: Pick<AggregateContext, "getValue" | "assetsByItem">): number {
  if (measure === "count") return itemIds.length;
  if (measure === "assetUnits") {
    let units = 0;
    for (const id of itemIds) for (const line of ctx.assetsByItem?.get(id) ?? []) units += assetCount(line);
    return units;
  }
  const columnId = sumColumnId(measure);
  if (!columnId) return 0;
  let sum = 0;
  for (const id of itemIds) {
    const v = ctx.getValue(id, columnId);
    if (v?.type === "NUMBER" && v.number !== null) sum += v.number;
  }
  return sum;
}

/** The measures a board offers: items always, one sum per Number column, asset units when it has any lines. */
export function availableMeasures(columns: ReadonlyArray<Pick<BoardColumn, "id" | "name" | "type">>, hasAssets: boolean): Array<{ value: Measure; label: string }> {
  const measures: Array<{ value: Measure; label: string }> = [{ value: "count", label: "Items" }];
  for (const column of columns) if (column.type === "NUMBER") measures.push({ value: `sum:${column.id}`, label: `Sum of ${column.name}` });
  if (hasAssets) measures.push({ value: "assetUnits", label: "Asset units" });
  return measures;
}

// ---------------------------------------------------------------------------
// Periods and the workload matrix

export type PeriodKind = "weeks" | "days";

export interface Period {
  /** First day of the period. */
  start: Date;
  /** Last day of the period (a whole day; compare by ISO date). */
  end: Date;
  startIso: string;
  endIso: string;
  /** "Mon 7 Sep" for a day, "Week of 7 Sep" for a week. */
  label: string;
  /** True when today falls inside the period. */
  today: boolean;
}

/**
 * `count` consecutive periods starting `offset` periods from the one holding
 * `now`. Weeks start on Monday, as everywhere else in the app.
 */
export function periods(now: Date, kind: PeriodKind, count: number, offset = 0): Period[] {
  const today = startOfDay(now);
  const result: Period[] = [];
  for (let i = 0; i < count; i++) {
    const step = offset + i;
    const start = kind === "weeks" ? addWeeks(startOfWeek(today, { weekStartsOn: 1 }), step) : addDays(today, step);
    const end = kind === "weeks" ? startOfDay(endOfWeek(start, { weekStartsOn: 1 })) : start;
    const startIso = toISODate(start);
    const endIso = toISODate(end);
    const todayIso = toISODate(today);
    result.push({
      start,
      end,
      startIso,
      endIso,
      label: kind === "weeks" ? format(start, "'Week of' d MMM") : format(start, "EEE d MMM"),
      today: kind === "weeks" ? startIso <= todayIso && todayIso <= endIso : isSameDay(start, today),
    });
  }
  return result;
}

/** How a workload cell decides which items belong to its period. */
export type WorkloadMode = "due" | "active";

/** How busy a cell is: 0 for nothing, 1 for 1–2 items, 2 for 3–4, 3 for 5 or more. */
export type LoadLevel = 0 | 1 | 2 | 3;

export function loadLevel(count: number): LoadLevel {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

export interface WorkloadCell {
  itemIds: string[];
  level: LoadLevel;
}

export interface WorkloadRow {
  /** The user id, or null for the Unassigned row. */
  personId: string | null;
  /** Everything assigned to the person, in or out of the window. */
  itemIds: string[];
  cells: WorkloadCell[];
  open: number;
  overdue: number;
  done: number;
}

export interface WorkloadMatrix {
  rows: WorkloadRow[];
  /** Null when every item has an owner. */
  unassigned: WorkloadRow | null;
  /** Distinct items per period, whoever they belong to. */
  totals: number[];
  /** Distinct items that land in at least one period of the window. */
  scheduled: number;
}

/**
 * Which periods an item occupies. In "due" mode it is the one holding the due
 * date (DATE column, else timeline end). In "active" mode an item with a
 * timeline occupies every period the timeline overlaps; anything else falls
 * back to its due date.
 */
export function itemPeriodIndexes(itemId: string, periodList: ReadonlyArray<Period>, ctx: Pick<AggregateContext, "columns" | "getValue">, mode: WorkloadMode): number[] {
  if (mode === "active") {
    const timeline = ctx.columns.find((c) => c.type === "TIMELINE");
    const v = timeline ? ctx.getValue(itemId, timeline.id) : undefined;
    if (v?.type === "TIMELINE" && (v.start || v.end)) {
      const start = v.start ?? v.end!;
      const end = v.end ?? v.start!;
      const indexes: number[] = [];
      periodList.forEach((p, i) => {
        if (start <= p.endIso && end >= p.startIso) indexes.push(i);
      });
      return indexes;
    }
  }
  const due = itemDueDate(itemId, ctx);
  if (!due) return [];
  const index = periodList.findIndex((p) => p.startIso <= due && due <= p.endIso);
  return index === -1 ? [] : [index];
}

/**
 * One row per person (in the order given) plus one for items nobody owns,
 * each with the items landing in every period and the totals the row header
 * shows. Multi-owner items count for each owner; the footer counts them once.
 */
export function workloadMatrix(items: ReadonlyArray<AggregateItem>, people: ReadonlyArray<string>, periodList: ReadonlyArray<Period>, ctx: AggregateContext, mode: WorkloadMode = "due"): WorkloadMatrix {
  const emptyRow = (personId: string | null): WorkloadRow => ({ personId, itemIds: [], cells: periodList.map(() => ({ itemIds: [], level: 0 })), open: 0, overdue: 0, done: 0 });
  const rows = new Map<string, WorkloadRow>(people.map((id) => [id, emptyRow(id)]));
  const unassigned = emptyRow(null);
  const perPeriod = periodList.map(() => new Set<string>());
  const scheduled = new Set<string>();

  for (const item of items) {
    const owners = itemOwners(item.id, ctx);
    const targets = owners.length === 0 ? [unassigned] : owners.map((id) => rows.get(id)).filter((r): r is WorkloadRow => !!r);
    const indexes = itemPeriodIndexes(item.id, periodList, ctx, mode);
    const done = isItemDone(item.id, ctx);
    const overdue = isItemOverdue(item.id, ctx);
    for (const row of targets) {
      row.itemIds.push(item.id);
      if (done) row.done += 1;
      else row.open += 1;
      if (overdue) row.overdue += 1;
      for (const i of indexes) row.cells[i]?.itemIds.push(item.id);
    }
    for (const i of indexes) {
      perPeriod[i]?.add(item.id);
      scheduled.add(item.id);
    }
  }

  const finish = (row: WorkloadRow): WorkloadRow => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, level: loadLevel(cell.itemIds.length) })) });
  return {
    rows: [...rows.values()].map(finish),
    unassigned: unassigned.itemIds.length > 0 ? finish(unassigned) : null,
    totals: perPeriod.map((set) => set.size),
    scheduled: scheduled.size,
  };
}

/** How many of the items carry each status role — the little stacked bar next to a person. */
export function statusRoleCounts(itemIds: ReadonlyArray<string>, ctx: Pick<AggregateContext, "columns" | "getValue">): Record<StatusLabelRole | "other", number> {
  const counts: Record<StatusLabelRole | "other", number> = { done: 0, progress: 0, stuck: 0, other: 0 };
  for (const id of itemIds) counts[itemStatusRole(id, ctx) ?? "other"] += 1;
  return counts;
}
