import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import type { BoardColumn, ColumnValue } from "@/domain";
import { dateTrio, planDateSync, productionStart, readDateState, resolveColumnRoles, statusRoleIds } from "@/domain";
import { productionDays, waitingDays } from "@/features/dashboard/flow";
import type { TaskFact } from "@/features/dashboard/analytics";
import { createServices } from "@/services";

const col = (id: string, type: BoardColumn["type"], position: number): BoardColumn => ({ id, boardId: "b", name: id, type, settings: { kind: "none" } as never, position, width: 120, hidden: false, role: null, createdAt: "" });
const COLUMNS = [col("due", "DATE", 1), col("start", "START_DATE", 2), col("timeline", "TIMELINE", 3)];
const trio = dateTrio(COLUMNS);
const state = (values: Record<string, ColumnValue>) => readDateState(trio, (id) => values[id]);

describe("start day, deadline and timeline", () => {
  it("finds the three columns", () => {
    expect([trio.start?.id, trio.due?.id, trio.timeline?.id]).toEqual(["start", "due", "timeline"]);
  });

  it("fills an empty timeline once both ends are set", () => {
    const plan = planDateSync(trio, state({ start: { type: "START_DATE", date: "2026-12-01" }, due: { type: "DATE", date: "2026-12-10" } }), "start");
    expect(plan.conflicts).toEqual([]);
    expect(plan.fills.map((w) => [w.column.id, w.value])).toEqual([["timeline", { type: "TIMELINE", start: "2026-12-01", end: "2026-12-10" }]]);
  });

  it("asks before replacing a timeline that says something else", () => {
    const plan = planDateSync(trio, state({ start: { type: "START_DATE", date: "2026-12-03" }, due: { type: "DATE", date: "2026-12-10" }, timeline: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-10" } }), "start");
    expect(plan.fills).toEqual([]);
    expect(plan.conflicts.map((w) => [w.column.id, w.from, w.to])).toEqual([["timeline", "2026-12-01 – 2026-12-10", "2026-12-03 – 2026-12-10"]]);
  });

  it("does nothing with only one end, or a start after the deadline", () => {
    expect(planDateSync(trio, state({ start: { type: "START_DATE", date: "2026-12-03" } }), "start")).toEqual({ fills: [], conflicts: [] });
    expect(planDateSync(trio, state({ start: { type: "START_DATE", date: "2026-12-20" }, due: { type: "DATE", date: "2026-12-10" } }), "start")).toEqual({ fills: [], conflicts: [] });
  });

  it("a timeline edit fills empty ends and offers the others", () => {
    const plan = planDateSync(trio, state({ due: { type: "DATE", date: "2026-12-09" }, timeline: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-12" } }), "timeline");
    expect(plan.fills.map((w) => [w.column.id, w.value])).toEqual([["start", { type: "START_DATE", date: "2026-12-01" }]]);
    expect(plan.conflicts.map((w) => [w.column.id, w.from, w.to])).toEqual([["due", "2026-12-09", "2026-12-12"]]);
  });

  it("counts production from the timeline, then the start day, then the team, then the booking", () => {
    expect(productionStart({ timelineStart: "2026-12-02", startDate: "2026-12-05", allocatedOn: "2026-11-30", createdOn: "2026-11-28" })).toEqual({ day: "2026-12-02", set: true });
    expect(productionStart({ timelineStart: null, startDate: "2026-12-05", allocatedOn: "2026-11-30", createdOn: "2026-11-28" })).toEqual({ day: "2026-12-05", set: true });
    expect(productionStart({ timelineStart: null, startDate: null, allocatedOn: "2026-11-30", createdOn: "2026-11-28" })).toEqual({ day: "2026-11-30", set: false });
    expect(productionStart({ timelineStart: null, startDate: null, allocatedOn: null, createdOn: "2026-11-28" })).toEqual({ day: "2026-11-28", set: false });
  });

  it("splits turnaround into waiting and production", () => {
    const task = { createdAt: "2026-11-28", productionStart: "2026-12-02", flow: { createdAt: "2026-11-28T03:00:00.000Z", finishedAt: "2026-12-09T05:00:00.000Z", spans: [], sentBack: [] } } as unknown as TaskFact;
    expect(waitingDays(task)).toBe(4);
    expect(productionDays(task)).toBe(7);
  });
});

let counter = 0;
describe("the item service keeps the dates in step", () => {
  let repos: ReturnType<typeof createLocalRepositories>;
  let services: ReturnType<typeof createServices>;
  const boardId = SEED_BOARD_IDS.rmitinerary;
  const actor = SEED_USER_IDS.danh;

  beforeEach(() => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `start-day-db-${Date.now()}-${counter}` });
    services = createServices(repos);
  });

  async function setup() {
    const board = (await repos.boards.getById(boardId))!;
    let columns = await repos.boards.listColumns(boardId);
    if (!columns.some((c) => c.type === "START_DATE")) {
      await services.boards.ensureSpecialColumns(boardId);
      columns = await repos.boards.listColumns(boardId);
    }
    const t = dateTrio(columns);
    const item = (await repos.items.listByBoard(boardId)).find((i) => i.parentItemId === null)!;
    for (const c of [t.start, t.due, t.timeline]) if (c) await repos.items.setValue(item.id, c.id, c.type === "TIMELINE" ? { type: "TIMELINE", start: null, end: null } : ({ type: c.type, date: null } as ColumnValue));
    const read = async () => {
      const values = await repos.items.listValuesByItem(item.id);
      return readDateState(t, (id) => values.find((v) => v.columnId === id)?.value);
    };
    const ctx = (column: BoardColumn) => ({ column, item, board, users: [] });
    return { t, item, columns, read, ctx };
  }

  it("fills the timeline when the deadline arrives after the start day, and never overwrites", async () => {
    const { t, item, read, ctx } = await setup();
    await services.items.setValue(item.id, t.start!.id, { type: "START_DATE", date: "2026-12-01" }, ctx(t.start!), actor);
    await services.items.setValue(item.id, t.due!.id, { type: "DATE", date: "2026-12-10" }, ctx(t.due!), actor);
    expect(await read()).toEqual({ start: "2026-12-01", due: "2026-12-10", timelineStart: "2026-12-01", timelineEnd: "2026-12-10" });
    // A later change offers rather than overwrites: the server leaves the timeline.
    await services.items.setValue(item.id, t.start!.id, { type: "START_DATE", date: "2026-12-03" }, ctx(t.start!), actor);
    expect((await read()).timelineStart).toBe("2026-12-01");
  });

  it("leaves the dates alone when the board says it is keeping them in step", async () => {
    const { t, item, read, ctx } = await setup();
    await services.items.setValue(item.id, t.timeline!.id, { type: "TIMELINE", start: "2026-12-01", end: "2026-12-05" }, { ...ctx(t.timeline!), dateSync: false }, actor);
    expect(await read()).toMatchObject({ start: null, due: null });
  });

  it("gives an empty start day today's date the first time the work is under way", async () => {
    const { t, item, columns, read, ctx } = await setup();
    const status = resolveColumnRoles(columns).status!;
    expect(status.settings.kind).toBe("status");
    const progress = status.settings.kind === "status" ? statusRoleIds(status.settings, "progress")[0] : undefined;
    expect(progress).toBeTruthy();
    await services.items.setValue(item.id, t.due!.id, { type: "DATE", date: "2099-01-10" }, { ...ctx(t.due!), dateSync: false }, actor);
    await services.items.setValue(item.id, status.id, { type: "STATUS", labelId: progress! }, ctx(status), actor);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect(await read()).toEqual({ start: today, due: "2099-01-10", timelineStart: today, timelineEnd: "2099-01-10" });
    // Set once: a second move into progress leaves it.
    await services.items.setValue(item.id, t.start!.id, { type: "START_DATE", date: "2026-01-02" }, { ...ctx(t.start!), dateSync: false }, actor);
    await services.items.setValue(item.id, status.id, { type: "STATUS", labelId: progress! }, ctx(status), actor);
    expect((await read()).start).toBe("2026-01-02");
  });
});
