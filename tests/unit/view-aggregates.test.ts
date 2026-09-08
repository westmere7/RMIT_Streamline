import { describe, expect, it } from "vitest";
import type { BoardColumn, BoardGroup, ColumnValue } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import {
  availableDimensions,
  availableMeasures,
  groupItems,
  loadLevel,
  measureItems,
  NONE_KEY,
  periods,
  statusRoleCounts,
  workloadMatrix,
  type AggregateContext,
  type AggregateItem,
} from "@/features/boards/components/views/view-aggregates";
import { avatarColorFor, tagColorFor } from "@/lib/colors";

// Friday 4 Sep 2026; the week runs Mon 31 Aug – Sun 6 Sep.
const now = new Date("2026-09-04T09:00:00");

function column(id: string, name: string, type: BoardColumn["type"], position: number): BoardColumn {
  return { id, boardId: "b", name, type, settings: defaultSettingsFor(type), position, width: 100, hidden: false, createdAt: "" };
}

const columns: BoardColumn[] = [
  column("owner", "Owner", "PERSON", 0),
  column("status", "Status", "STATUS", 1),
  column("priority", "Priority", "PRIORITY", 2),
  column("due", "Due", "DATE", 3),
  column("timeline", "Timeline", "TIMELINE", 4),
  column("channel", "Channel", "TAGS", 5),
  column("size", "Size", "SIZE", 6),
  column("hours", "Hours", "NUMBER", 7),
];

const groups: BoardGroup[] = [
  { id: "g2", boardId: "b", name: "Later", color: "purple", position: 1, collapsed: false, createdAt: "" },
  { id: "g1", boardId: "b", name: "Now", color: "teal", position: 0, collapsed: false, createdAt: "" },
];

const values: Record<string, Record<string, ColumnValue>> = {
  a: { owner: { type: "PERSON", userIds: ["danh"] }, status: { type: "STATUS", labelId: "done" }, priority: { type: "PRIORITY", labelId: "low" }, due: { type: "DATE", date: "2026-09-10" }, channel: { type: "TAGS", tags: ["Instagram"] }, size: { type: "SIZE", size: "M" }, hours: { type: "NUMBER", number: 4 } },
  b: { owner: { type: "PERSON", userIds: ["emily", "danh"] }, status: { type: "STATUS", labelId: "working" }, priority: { type: "PRIORITY", labelId: "critical" }, due: { type: "DATE", date: "2026-09-01" }, hours: { type: "NUMBER", number: null } },
  c: { status: { type: "STATUS", labelId: "stuck" }, priority: { type: "PRIORITY", labelId: "high" }, timeline: { type: "TIMELINE", start: "2026-09-02", end: "2026-09-16" }, size: { type: "SIZE", size: "XS" }, hours: { type: "NUMBER", number: 2.5 } },
  d: { owner: { type: "PERSON", userIds: ["jun"] }, channel: { type: "TAGS", tags: ["tiktok", "instagram"] }, due: { type: "DATE", date: "2026-09-30" }, hours: { type: "NUMBER", number: 10 } },
  e: { owner: { type: "PERSON", userIds: ["jun"] }, due: { type: "DATE", date: "2026-10-02" } },
  // Two more for Emily in the current week, to push a cell past two items.
  f: { owner: { type: "PERSON", userIds: ["emily"] }, due: { type: "DATE", date: "2026-09-02" } },
  g: { owner: { type: "PERSON", userIds: ["emily"] }, due: { type: "DATE", date: "2026-09-03" } },
};

const names: Record<string, string> = { danh: "Danh", emily: "Emily", jun: "Jun" };

const ctx: AggregateContext = {
  columns,
  groups,
  getValue: (itemId, columnId) => values[itemId]?.[columnId],
  now,
  userName: (id) => names[id],
  tagOptions: () => [{ name: "tiktok", color: "pink" }],
  assetsByItem: new Map([
    ["a", [{ quantity: 3 }, { quantity: null }]],
    ["c", [{ quantity: 2 }]],
  ]),
};

const item = (id: string, groupId = "g1"): AggregateItem => ({ id, groupId });
const items = [item("a"), item("b"), item("c", "g2"), item("d", "g2"), item("e", "g2")];

const ids = (buckets: ReturnType<typeof groupItems>) => buckets.map((b) => [b.key, b.itemIds] as const);

describe("groupItems", () => {
  it("follows label order for status and priority, with a trailing none bucket", () => {
    const status = groupItems(items, "status", ctx);
    expect(ids(status)).toEqual([
      ["working", ["b"]],
      ["stuck", ["c"]],
      ["done", ["a"]],
      [NONE_KEY, ["d", "e"]],
    ]);
    expect(status.map((b) => b.label)).toEqual(["In Progress", "Stuck", "Done", "No status"]);
    expect(status[0]!.color).toBe("orange");
    expect(status[3]!.color).toBeNull();

    expect(ids(groupItems(items, "priority", ctx))).toEqual([
      ["critical", ["b"]],
      ["high", ["c"]],
      ["low", ["a"]],
      [NONE_KEY, ["d", "e"]],
    ]);
  });

  it("orders groups by position and colours them like the board", () => {
    const buckets = groupItems(items, "group", ctx);
    expect(buckets.map((b) => [b.label, b.color, b.itemIds])).toEqual([
      ["Now", "teal", ["a", "b"]],
      ["Later", "purple", ["c", "d", "e"]],
    ]);
  });

  it("gives every owner a bucket, counts shared items in each and sorts people by name", () => {
    const buckets = groupItems(items, "person", ctx);
    expect(buckets.map((b) => [b.label, b.itemIds])).toEqual([
      ["Danh", ["a", "b"]],
      ["Emily", ["b"]],
      ["Jun", ["d", "e"]],
      ["Unassigned", ["c"]],
    ]);
    expect(buckets[0]!.color).toBe(avatarColorFor("danh"));
  });

  it("fans items out to every tag, ignoring case, most used first", () => {
    const buckets = groupItems(items, "tags", ctx);
    expect(buckets.map((b) => [b.label, b.itemIds])).toEqual([
      ["Instagram", ["a", "d"]],
      ["tiktok", ["d"]],
      ["No tags", ["b", "c", "e"]],
    ]);
    // Palette colour when the column defines the tag, the deterministic fallback otherwise.
    expect(buckets[1]!.color).toBe("pink");
    expect(buckets[0]!.color).toBe(tagColorFor("Instagram"));
  });

  it("runs sizes from XS to XL", () => {
    expect(groupItems(items, "size", ctx).map((b) => [b.key, b.color, b.itemIds])).toEqual([
      ["XS", "sky", ["c"]],
      ["M", "blue", ["a"]],
      [NONE_KEY, null, ["b", "d", "e"]],
    ]);
  });

  it("buckets due dates by Monday-start week, chronologically, across a month boundary", () => {
    const buckets = groupItems([...items, item("f"), item("g")], "dueWeek", ctx);
    expect(buckets.map((b) => [b.key, b.label, b.itemIds])).toEqual([
      ["2026-08-31", "Week of 31 Aug", ["b", "f", "g"]],
      ["2026-09-07", "Week of 7 Sep", ["a"]],
      ["2026-09-14", "Week of 14 Sep", ["c"]],
      ["2026-09-28", "Week of 28 Sep", ["d", "e"]],
    ]);
    // The timeline end stands in for a missing date; an item with neither lands in "No date".
    const noDate = groupItems([item("z")], "dueWeek", ctx);
    expect(noDate).toEqual([{ key: NONE_KEY, label: "No date", color: null, itemIds: ["z"] }]);
  });

  it("drops empty buckets", () => {
    expect(groupItems([], "status", ctx)).toEqual([]);
    expect(groupItems([item("a")], "status", ctx)).toHaveLength(1);
  });
});

describe("measureItems", () => {
  const all = items.map((i) => i.id);

  it("counts items", () => {
    expect(measureItems(all, "count", ctx)).toBe(5);
  });

  it("sums a Number column, skipping empty cells", () => {
    expect(measureItems(all, "sum:hours", ctx)).toBe(16.5);
    expect(measureItems(["b"], "sum:hours", ctx)).toBe(0);
    expect(measureItems(all, "sum:missing", ctx)).toBe(0);
  });

  it("adds up asset units, a line without a quantity counting as one", () => {
    expect(measureItems(all, "assetUnits", ctx)).toBe(6);
    expect(measureItems(["a"], "assetUnits", ctx)).toBe(4);
    expect(measureItems(["b"], "assetUnits", { ...ctx, assetsByItem: undefined })).toBe(0);
  });
});

describe("availability", () => {
  it("offers only the dimensions the board has columns for", () => {
    expect(availableDimensions(columns)).toEqual(["status", "priority", "group", "person", "tags", "size", "dueWeek"]);
    expect(availableDimensions([column("owner", "Owner", "PERSON", 0)])).toEqual(["group", "person"]);
    expect(availableDimensions([column("timeline", "Timeline", "TIMELINE", 0)])).toEqual(["group", "dueWeek"]);
  });

  it("offers items, one sum per Number column and asset units when there are lines", () => {
    expect(availableMeasures(columns, true)).toEqual([
      { value: "count", label: "Items" },
      { value: "sum:hours", label: "Sum of Hours" },
      { value: "assetUnits", label: "Asset units" },
    ]);
    expect(availableMeasures(columns, false).map((m) => m.value)).toEqual(["count", "sum:hours"]);
  });
});

describe("periods", () => {
  it("builds Monday-start weeks and marks the one holding today", () => {
    const weeks = periods(now, "weeks", 2);
    expect(weeks.map((p) => [p.startIso, p.endIso, p.label, p.today])).toEqual([
      ["2026-08-31", "2026-09-06", "Week of 31 Aug", true],
      ["2026-09-07", "2026-09-13", "Week of 7 Sep", false],
    ]);
    expect(weeks[0]!.start.getDay()).toBe(1);
  });

  it("builds days around today when offset", () => {
    const days = periods(now, "days", 3, -1);
    expect(days.map((p) => [p.startIso, p.label, p.today])).toEqual([
      ["2026-09-03", "Thu 3 Sep", false],
      ["2026-09-04", "Fri 4 Sep", true],
      ["2026-09-05", "Sat 5 Sep", false],
    ]);
    expect(days[1]!.endIso).toBe("2026-09-04");
  });

  it("shifts whole windows", () => {
    expect(periods(now, "weeks", 1, 4)[0]!.startIso).toBe("2026-09-28");
    expect(periods(now, "weeks", 1, -1)[0]!.startIso).toBe("2026-08-24");
  });
});

describe("workloadMatrix", () => {
  const window = periods(now, "weeks", 3, -1); // 24 Aug, 31 Aug, 7 Sep
  const people = ["danh", "emily", "jun"];
  const cells = (row: { cells: Array<{ itemIds: string[] }> }) => row.cells.map((c) => c.itemIds);

  it("places items in the period of their due date and totals each row", () => {
    const m = workloadMatrix(items, people, window, ctx);
    const [danh, emily, jun] = m.rows;
    expect(m.rows.map((r) => r.personId)).toEqual(people);
    expect(cells(danh!)).toEqual([[], ["b"], ["a"]]);
    expect(danh).toMatchObject({ itemIds: ["a", "b"], open: 1, done: 1, overdue: 1 });
    expect(cells(emily!)).toEqual([[], ["b"], []]);
    expect(emily).toMatchObject({ open: 1, done: 0, overdue: 1 });
    // No status at all is open, and a future date is not overdue.
    expect(cells(jun!)).toEqual([[], [], []]);
    expect(jun).toMatchObject({ itemIds: ["d", "e"], open: 2, overdue: 0, done: 0 });
    // The shared item counts once in the footer.
    expect(m.totals).toEqual([0, 1, 1]);
    expect(m.scheduled).toBe(2);
  });

  it("keeps items nobody owns in an Unassigned row, only when there are any", () => {
    const m = workloadMatrix(items, people, window, ctx);
    expect(m.unassigned).toMatchObject({ personId: null, itemIds: ["c"], open: 1, overdue: 0 });
    // A timeline end in "due" mode falls outside this window.
    expect(cells(m.unassigned!)).toEqual([[], [], []]);
    expect(workloadMatrix([item("a"), item("b")], people, window, ctx).unassigned).toBeNull();
  });

  it("spreads timelines over every period they touch in active mode", () => {
    const m = workloadMatrix(items, people, window, ctx, "active");
    expect(cells(m.unassigned!)).toEqual([[], ["c"], ["c"]]);
    // Items without a timeline still go by their due date.
    expect(cells(m.rows[0]!)).toEqual([[], ["b"], ["a"]]);
    expect(m.totals).toEqual([0, 2, 2]);
    expect(m.scheduled).toBe(3);
  });

  it("grades cells by how many items they hold", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(loadLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const m = workloadMatrix([...items, item("f"), item("g")], people, window, ctx);
    const emily = m.rows[1]!;
    expect(cells(emily)).toEqual([[], ["b", "f", "g"], []]);
    expect(emily.cells.map((c) => c.level)).toEqual([0, 2, 0]);
    expect(m.rows[0]!.cells.map((c) => c.level)).toEqual([0, 1, 1]);
  });

  it("ignores owners that are not in the requested rows", () => {
    const m = workloadMatrix(items, ["jun"], window, ctx);
    expect(m.rows).toHaveLength(1);
    expect(m.unassigned?.itemIds).toEqual(["c"]);
    expect(m.totals).toEqual([0, 1, 1]);
  });
});

describe("statusRoleCounts", () => {
  it("counts done, in progress, stuck and everything else", () => {
    expect(statusRoleCounts(["a", "b", "c", "d", "e"], ctx)).toEqual({ done: 1, progress: 1, stuck: 1, other: 2 });
  });
});
