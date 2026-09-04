import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnValue, Item } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { filterItems, primaryDueDate, sortItems } from "@/features/boards/board-filtering";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";

const now = new Date("2026-09-04T09:00:00");

const columns: BoardColumn[] = [
  { id: "owner", boardId: "b", name: "Owner", type: "PERSON", settings: defaultSettingsFor("PERSON"), position: 0, width: 100, hidden: false, createdAt: "" },
  { id: "status", boardId: "b", name: "Status", type: "STATUS", settings: defaultSettingsFor("STATUS"), position: 1, width: 100, hidden: false, createdAt: "" },
  { id: "priority", boardId: "b", name: "Priority", type: "PRIORITY", settings: defaultSettingsFor("PRIORITY"), position: 2, width: 100, hidden: false, createdAt: "" },
  { id: "due", boardId: "b", name: "Due", type: "DATE", settings: defaultSettingsFor("DATE"), position: 3, width: 100, hidden: false, createdAt: "" },
  { id: "timeline", boardId: "b", name: "Timeline", type: "TIMELINE", settings: defaultSettingsFor("TIMELINE"), position: 4, width: 100, hidden: false, createdAt: "" },
];

function item(id: string, name: string, groupId = "g1", position = 0, createdAt = "2026-09-01T00:00:00.000Z"): Item {
  return { id, boardId: "b", groupId, parentItemId: null, name, description: null, position, createdBy: "u", archivedAt: null, createdAt, updatedAt: createdAt };
}

const values: Record<string, Record<string, ColumnValue>> = {
  a: { owner: { type: "PERSON", userIds: ["danh"] }, status: { type: "STATUS", labelId: "done" }, priority: { type: "PRIORITY", labelId: "low" }, due: { type: "DATE", date: "2026-09-10" } },
  b: { owner: { type: "PERSON", userIds: ["emily", "danh"] }, status: { type: "STATUS", labelId: "working" }, priority: { type: "PRIORITY", labelId: "critical" }, due: { type: "DATE", date: "2026-09-01" } },
  c: { status: { type: "STATUS", labelId: "stuck" }, priority: { type: "PRIORITY", labelId: "high" }, timeline: { type: "TIMELINE", start: "2026-09-02", end: "2026-09-04" } },
  d: { owner: { type: "PERSON", userIds: ["jun"] } },
};
const getValue = (itemId: string, columnId: string) => values[itemId]?.[columnId];
const ctx = { columns, getValue, now };

const items = [item("a", "Alpha", "g1", 0, "2026-09-03T00:00:00.000Z"), item("b", "bravo", "g1", 1, "2026-09-01T00:00:00.000Z"), item("c", "Charlie", "g2", 0, "2026-09-02T00:00:00.000Z"), item("d", "delta", "g2", 1, "2026-09-04T00:00:00.000Z")];

describe("primaryDueDate", () => {
  it("prefers the DATE column and falls back to the timeline end", () => {
    expect(primaryDueDate("a", columns, getValue)).toBe("2026-09-10");
    expect(primaryDueDate("c", columns, getValue)).toBe("2026-09-04");
    expect(primaryDueDate("d", columns, getValue)).toBeNull();
  });
});

describe("filterItems", () => {
  it("matches search case-insensitively on the item name", () => {
    expect(filterItems(items, "ALPHA", EMPTY_FILTERS, ctx).map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, "", EMPTY_FILTERS, ctx)).toHaveLength(4);
  });

  it("filters by any assigned person", () => {
    expect(filterItems(items, "", { ...EMPTY_FILTERS, personIds: ["danh"] }, ctx).map((i) => i.id)).toEqual(["a", "b"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, personIds: ["jun", "emily"] }, ctx).map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("filters by status, priority and group and combines filters with AND", () => {
    expect(filterItems(items, "", { ...EMPTY_FILTERS, statusIds: ["done", "stuck"] }, ctx).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, priorityIds: ["critical"] }, ctx).map((i) => i.id)).toEqual(["b"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, groupIds: ["g2"] }, ctx).map((i) => i.id)).toEqual(["c", "d"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, groupIds: ["g1"], statusIds: ["working"] }, ctx).map((i) => i.id)).toEqual(["b"]);
  });

  it("filters by date bucket", () => {
    expect(filterItems(items, "", { ...EMPTY_FILTERS, date: "overdue" }, ctx).map((i) => i.id)).toEqual(["b"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, date: "today" }, ctx).map((i) => i.id)).toEqual(["c"]);
    expect(filterItems(items, "", { ...EMPTY_FILTERS, date: "noDate" }, ctx).map((i) => i.id)).toEqual(["d"]);
    // Sep 4 2026 is a Friday; week runs Mon–Sun so Sep 10 is next week.
    expect(filterItems(items, "", { ...EMPTY_FILTERS, date: "thisWeek" }, ctx).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("sortItems", () => {
  it("falls back to position when no sort is set", () => {
    expect(sortItems([items[1]!, items[0]!], null, ctx).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("sorts by name ignoring case", () => {
    expect(sortItems(items, { field: "name", direction: "asc" }, ctx).map((i) => i.name)).toEqual(["Alpha", "bravo", "Charlie", "delta"]);
    expect(sortItems(items, { field: "name", direction: "desc" }, ctx).map((i) => i.name)).toEqual(["delta", "Charlie", "bravo", "Alpha"]);
  });

  it("sorts by due date with empty dates last regardless of direction", () => {
    expect(sortItems(items, { field: "dueDate", direction: "asc" }, ctx).map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortItems(items, { field: "dueDate", direction: "desc" }, ctx).map((i) => i.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("sorts by priority and status using label order", () => {
    expect(sortItems(items, { field: "priority", direction: "asc" }, ctx).map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortItems(items, { field: "status", direction: "asc" }, ctx).map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("sorts by created date", () => {
    expect(sortItems(items, { field: "createdAt", direction: "asc" }, ctx).map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
  });
});
