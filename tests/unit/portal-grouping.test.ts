import { describe, expect, it } from "vitest";
import type { PortalStatus, PortalTask, StakeholderDepartment } from "@/domain";
import { applyPortalGrouping, groupPortalBoardByStatus } from "@/features/portal/portal-grouping";
import { buildPortalBoard, type PortalBoardTask } from "@/services/portal/portal-board";

const DEPARTMENT: StakeholderDepartment = {
  id: "dept-1",
  workspaceId: "ws-1",
  name: "Comm.",
  color: "blue",
  position: 0,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function task(overrides: Partial<PortalTask> & { id: string }): PortalTask {
  return {
    reference: null,
    name: `Task ${overrides.id}`,
    status: null,
    priority: null,
    dueDate: null,
    timeline: null,
    people: [],
    sourceName: "Creative Request VN",
    assetTypes: [],
    deliverables: { total: 0, done: 0 },
    subitems: { total: 0, done: 0 },
    linkedCount: 0,
    bookedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

const entry = (t: PortalTask, extra: Partial<PortalBoardTask> = {}): PortalBoardTask => ({ task: t, brief: null, deliverables: [], subitems: [], ...extra });

const build = (tasks: PortalBoardTask[]) =>
  buildPortalBoard({ department: DEPARTMENT, tasks, links: [], comments: [], commentAuthors: [], workspaceName: "RMIT Marketing Team", now: "2026-09-09T00:00:00.000Z" });

/**
 * Grouping a department's board by status, in the browser.
 *
 * The point of doing it here is that the payload already knows enough: the
 * statuses of every board the department's work is spread across have been
 * reconciled into one set of labels on the STATUS column. These check that the
 * arrangement is read off that column, and that nothing else about the payload
 * moves when it is.
 */
describe("grouping a portal board by status", () => {
  const inProgress: PortalStatus = { name: "In Progress", color: "orange", role: "working" };
  const shipped: PortalStatus = { name: "Shipped", color: "green", role: "done" };
  const blocked: PortalStatus = { name: "Blocked", color: "red", role: "stuck" };

  const groupNames = (payload: ReturnType<typeof build>) => payload.groups.map((g) => g.name);
  const groupOf = (payload: ReturnType<typeof build>, id: string) => {
    const item = payload.items.find((i) => i.id === id)!;
    return payload.groups.find((g) => g.id === item.groupId)!.name;
  };

  it("makes one group per status in use, merging boards that agree", () => {
    const grouped = groupPortalBoardByStatus(
      build([
        entry(task({ id: "a", status: inProgress, sourceName: "Open Day 2026" })),
        entry(task({ id: "b", status: shipped, sourceName: "Creative Request VN" })),
        entry(task({ id: "c", status: inProgress, sourceName: "Creative Request VN" })),
        entry(task({ id: "d", status: blocked, sourceName: "Open Day 2026" })),
      ]),
    );

    // The order work moves in — the order the status column already offers.
    expect(groupNames(grouped)).toEqual(["In Progress", "Blocked", "Shipped"]);
    // Two boards, one "In Progress": the labels were reconciled, so the groups are.
    expect(groupOf(grouped, "a")).toBe("In Progress");
    expect(groupOf(grouped, "c")).toBe("In Progress");
    expect(groupOf(grouped, "b")).toBe("Shipped");
    expect(groupOf(grouped, "d")).toBe("Blocked");
  });

  it("gives each group the status's own colour", () => {
    const grouped = groupPortalBoardByStatus(build([entry(task({ id: "a", status: blocked })), entry(task({ id: "b", status: shipped }))]));
    expect(grouped.groups.find((g) => g.name === "Blocked")!.color).toBe("red");
    expect(grouped.groups.find((g) => g.name === "Shipped")!.color).toBe("green");
  });

  it("gathers requests with no status rather than dropping them off the board", () => {
    const grouped = groupPortalBoardByStatus(build([entry(task({ id: "a", status: inProgress })), entry(task({ id: "b" }))]));
    expect(groupNames(grouped)).toEqual(["In Progress", "No status"]);
    expect(groupOf(grouped, "b")).toBe("No status");
    expect(grouped.items.filter((i) => i.parentItemId === null)).toHaveLength(2);
  });

  it("leaves out statuses no request of this department is in", () => {
    // "Shipped" is a label on the column because another request has it; with
    // only one request, in progress, there is nothing to head a Shipped group.
    const grouped = groupPortalBoardByStatus(build([entry(task({ id: "a", status: inProgress }))]));
    expect(groupNames(grouped)).toEqual(["In Progress"]);
  });

  it("keeps a subitem with its request", () => {
    const grouped = groupPortalBoardByStatus(
      build([
        entry(task({ id: "a", status: blocked, subitems: { total: 1, done: 0 } }), { subitems: [{ id: "s1", name: "Draft", done: false }] }),
        entry(task({ id: "b", status: shipped })),
      ]),
    );
    const parent = grouped.items.find((i) => i.id === "a")!;
    const child = grouped.items.find((i) => i.id === "s1")!;
    expect(child.groupId).toBe(parent.groupId);
    expect(groupOf(grouped, "s1")).toBe("Blocked");
  });

  it("changes the arrangement and nothing else", () => {
    const original = build([entry(task({ id: "a", status: inProgress })), entry(task({ id: "b", status: shipped }))]);
    const grouped = groupPortalBoardByStatus(original);

    // Same rows, same cells, same columns — only groupId differs.
    expect(grouped.items.map((i) => i.id)).toEqual(original.items.map((i) => i.id));
    expect(grouped.columns).toEqual(original.columns);
    expect(grouped.values).toEqual(original.values);
    expect(grouped.items.map((i) => i.name)).toEqual(original.items.map((i) => i.name));
    // Every item still sits in a group the payload declares.
    const ids = new Set(grouped.groups.map((g) => g.id));
    expect(grouped.items.every((i) => ids.has(i.groupId))).toBe(true);
  });

  it("returns the board untouched when it has no status column to group by", () => {
    // A department whose requests report no status at all gets no STATUS column
    // worth grouping on; the payload must survive the attempt unchanged.
    const original = build([entry(task({ id: "a" }))]);
    const stripped = { ...original, columns: original.columns.filter((c) => c.type !== "STATUS") };
    expect(groupPortalBoardByStatus(stripped)).toBe(stripped);
  });

  it("leaves the board as built when the visitor asked for board grouping", () => {
    const original = build([entry(task({ id: "a", status: inProgress, sourceName: "Open Day 2026" }))]);
    expect(applyPortalGrouping(original, "board")).toBe(original);
    expect(groupNames(applyPortalGrouping(original, "board"))).toEqual(["Open Day 2026"]);
    expect(groupNames(applyPortalGrouping(original, "status"))).toEqual(["In Progress"]);
  });
});
