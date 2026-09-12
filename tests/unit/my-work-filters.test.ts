import { describe, expect, it } from "vitest";
import type { Board, Item } from "@/domain";
import { EMPTY_MY_WORK_FILTERS, activeMyWorkFilterCount, filterMyWork, myWorkLabelNames, type MyWorkFilters } from "@/features/my-work/filters";
import type { MyWorkItem } from "@/services/my-work-service";

const NOW = new Date("2026-09-12T09:00:00.000Z");

const board = (id: string, name: string): Board => ({ id, name } as unknown as Board);

function entry(overrides: Partial<MyWorkItem> & { id: string; name: string; parent?: string | null }): MyWorkItem {
  const { id, name, parent = null, ...rest } = overrides;
  return {
    item: { id, name, parentItemId: parent } as unknown as Item,
    board: board("b1", "Campaigns"),
    group: null,
    status: null,
    isDone: false,
    priority: null,
    dueDate: null,
    dueColumn: null,
    statusColumn: null,
    linkedBoards: [],
    people: ["me"],
    ...rest,
  };
}

const NAMES: Record<string, string> = { me: "Me Myself", linh: "Linh Tran", tuyet: "Tuyet Le" };
const ctx = { now: NOW, personName: (id: string) => NAMES[id] };
const f = (patch: Partial<MyWorkFilters>): MyWorkFilters => ({ ...EMPTY_MY_WORK_FILTERS, ...patch });

const ROWS: MyWorkItem[] = [
  entry({ id: "a", name: "Open Day posters", status: { id: "s1", name: "In Progress", color: "orange" }, priority: { id: "p1", name: "High", color: "red" }, dueDate: "2026-09-12", people: ["me", "linh"] }),
  entry({ id: "b", name: "Alumni cover", board: board("b2", "Publication"), group: { id: "g", name: "Spring issue" } as never, status: { id: "s9", name: "in progress", color: "blue" }, dueDate: "2026-09-01" }),
  entry({ id: "c", name: "Reel edit", parent: "a", priority: { id: "p2", name: "Low", color: "gray" }, people: ["me", "tuyet"] }),
];

describe("filtering My Work", () => {
  it("passes everything through when nothing is set", () => {
    expect(filterMyWork(ROWS, EMPTY_MY_WORK_FILTERS, ctx)).toHaveLength(3);
    expect(activeMyWorkFilterCount(EMPTY_MY_WORK_FILTERS)).toBe(0);
  });

  it("matches statuses and priorities by name across boards, whatever their case", () => {
    expect(filterMyWork(ROWS, f({ statuses: ["IN PROGRESS"] }), ctx).map((e) => e.item.id)).toEqual(["a", "b"]);
    expect(filterMyWork(ROWS, f({ priorities: ["Low"] }), ctx).map((e) => e.item.id)).toEqual(["c"]);
    expect(myWorkLabelNames(ROWS, "status")).toEqual(["In Progress"]);
    expect(myWorkLabelNames(ROWS, "priority")).toEqual(["High", "Low"]);
  });

  it("narrows by board, by who else is on it, by due bucket and by kind", () => {
    expect(filterMyWork(ROWS, f({ boardIds: ["b2"] }), ctx).map((e) => e.item.id)).toEqual(["b"]);
    expect(filterMyWork(ROWS, f({ personIds: ["tuyet"] }), ctx).map((e) => e.item.id)).toEqual(["c"]);
    expect(filterMyWork(ROWS, f({ due: "overdue" }), ctx).map((e) => e.item.id)).toEqual(["b"]);
    expect(filterMyWork(ROWS, f({ due: "today" }), ctx).map((e) => e.item.id)).toEqual(["a"]);
    expect(filterMyWork(ROWS, f({ kind: "subitems" }), ctx).map((e) => e.item.id)).toEqual(["c"]);
    expect(filterMyWork(ROWS, f({ kind: "items" }), ctx)).toHaveLength(2);
  });

  it("searches only once told what for, and people by their names", () => {
    // Words with no kind picked are held, not applied.
    expect(filterMyWork(ROWS, f({ search: "linh" }), ctx)).toHaveLength(3);
    expect(activeMyWorkFilterCount(f({ search: "linh" }))).toBe(0);
    expect(filterMyWork(ROWS, f({ searchKind: "person", search: "linh" }), ctx).map((e) => e.item.id)).toEqual(["a"]);
    expect(filterMyWork(ROWS, f({ searchKind: "item", search: "linh" }), ctx)).toEqual([]);
    expect(filterMyWork(ROWS, f({ searchKind: "item", search: "cover" }), ctx).map((e) => e.item.id)).toEqual(["b"]);
    expect(filterMyWork(ROWS, f({ searchKind: "board", search: "spring" }), ctx).map((e) => e.item.id)).toEqual(["b"]);
    expect(activeMyWorkFilterCount(f({ searchKind: "board", search: "spring", boardIds: ["b2"] }))).toBe(2);
  });
});
