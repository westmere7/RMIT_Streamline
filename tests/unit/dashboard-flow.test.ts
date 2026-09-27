import { describe, expect, it } from "vitest";
import type { Board, BoardColumn, DashboardSnapshot, Item, ItemColumnValue, StatusChange, Team } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { buildFacts } from "@/features/dashboard/analytics";
import { formatDays, inAndOut, onTime, sentBack, turnaround } from "@/features/dashboard/flow";
import { resolvePeriod } from "@/features/dashboard/metrics";

const WS = "ws-1";
const now = "2026-03-20T09:00:00.000Z";

const team: Team = { id: "t-a", workspaceId: WS, name: "Alpha", description: null, color: "red", icon: "users", archivedAt: null, createdAt: now, updatedAt: now };
const board: Board = { id: "b-a", workspaceId: WS, teamId: "t-a", name: "Alpha board", slug: "a", description: null, type: "MAIN", visibility: "WORKSPACE", ownerId: "u", color: "blue", icon: "layout-grid", archivedAt: null, system: null, createdAt: now, updatedAt: now };
const column = (id: string, name: string, type: BoardColumn["type"], position: number): BoardColumn => ({ id, boardId: "b-a", name, type, settings: defaultSettingsFor(type), position, width: 150, hidden: false, createdAt: now });
const item = (id: string, createdAt: string, updatedAt = createdAt): Item => ({ id, boardId: "b-a", groupId: "g", parentItemId: null, name: id, description: null, position: 0, createdBy: "u", archivedAt: null, createdAt, updatedAt });
const status = (itemId: string, labelId: string): ItemColumnValue => ({ id: `${itemId}:s`, itemId, columnId: "c-status", value: { type: "STATUS", labelId }, updatedAt: now });
const due = (itemId: string, date: string): ItemColumnValue => ({ id: `${itemId}:d`, itemId, columnId: "c-due", value: { type: "DATE", date }, updatedAt: now });
const change = (itemId: string, day: string, from: string | null, to: string, columnName = "Status"): StatusChange => ({ itemId, at: `2026-03-${day}T09:00:00.000Z`, column: columnName, from, to });

/**
 * Four tasks in March 2026:
 *  x — worked, sent back from review, done a day after its due date;
 *  y — done the day after it was made, well before it was due;
 *  z — still in progress;
 *  w — marked done, reopened, done again.
 * Plus v, done before any change was recorded, and changes on a second status
 * column that the dashboard does not read.
 */
function snapshot(): DashboardSnapshot {
  return {
    workspace: { id: WS, name: "Test", slug: "test" },
    teams: [team],
    boards: [board],
    groups: [{ id: "g", boardId: "b-a", name: "Work", color: "gray", position: 0, collapsed: false, createdAt: now }],
    columns: [column("c-status", "Status", "STATUS", 0), column("c-due", "Due Date", "DATE", 1), column("c-approval", "Approval", "STATUS", 2)],
    items: [item("x", "2026-03-01T09:00:00.000Z"), item("y", "2026-03-10T09:00:00.000Z"), item("z", "2026-03-01T09:00:00.000Z"), item("w", "2026-03-07T09:00:00.000Z"), item("v", "2026-03-02T09:00:00.000Z", "2026-03-04T15:00:00.000Z")],
    values: [status("x", "done"), due("x", "2026-03-05"), status("y", "done"), due("y", "2026-03-20"), status("z", "working"), status("w", "done"), status("v", "done")],
    assets: [],
    links: [],
    users: [],
    departments: [],
    statusChanges: [
      change("x", "02", "Not Started", "In Progress"),
      change("x", "04", "In Progress", "In Review"),
      change("x", "05", "In Review", "In Progress"),
      change("x", "05", "Not Started", "Stuck", "Approval"),
      change("x", "06", "In Progress", "Done"),
      change("y", "11", "Not Started", "Done"),
      change("z", "03", "Not Started", "In Progress"),
      change("w", "08", "In Progress", "Done"),
      change("w", "09", "Done", "In Progress"),
      change("w", "12", "In Progress", "Done"),
    ],
    generatedAt: now,
  };
}

const march = resolvePeriod({ mode: "month", year: 2026, quarter: 1, month: 3, from: null, to: null, comparisonYear: 2025 }, "2026-03-20");

describe("the status history of a task", () => {
  const facts = buildFacts(snapshot());
  const flow = (id: string) => facts.tasks.find((t) => t.id === id)!.flow;

  it("finishes when it last moved into done", () => {
    expect(flow("x").finishedAt).toBe("2026-03-06T09:00:00.000Z");
    expect(flow("w").finishedAt).toBe("2026-03-12T09:00:00.000Z");
    expect(flow("z").finishedAt).toBeNull();
  });

  it("falls back to the completion date for done work with no history", () => {
    expect(flow("v").finishedAt).toBe("2026-03-04T12:00:00.000Z");
    expect(flow("v").spans).toEqual([]);
  });

  it("is a stretch per status, the last one still open for work not done", () => {
    expect(flow("x").spans.map((s) => s.label)).toEqual(["Not Started", "In Progress", "In Review", "In Progress"]);
    expect(flow("z").spans.at(-1)).toMatchObject({ label: "In Progress", role: "progress", to: null });
  });

  it("counts going back from review, and out of done, as sent back — and ignores another status column", () => {
    expect(flow("x").sentBack).toEqual(["2026-03-05T09:00:00.000Z"]);
    expect(flow("w").sentBack).toEqual(["2026-03-09T09:00:00.000Z"]);
    expect(flow("y").sentBack).toEqual([]);
  });
});

describe("the flow figures", () => {
  const facts = buildFacts(snapshot());

  it("turnaround is the median of made-to-done, in days", () => {
    // x 5 d, y 1 d, w 5 d, v 2.125 d → median 3.5625 d.
    const figure = turnaround(facts, march, null);
    expect(figure.count).toBe(4);
    expect(figure.value).toBeCloseTo(3.5625);
    expect(figure.byTeam[0]).toMatchObject({ name: "Alpha" });
  });

  it("on time is the share of dated finished work done by its due date", () => {
    // x was due the 5th and done the 6th; y was on time. w and v have no due date.
    const figure = onTime(facts, march, null);
    expect(figure.count).toBe(2);
    expect(figure.value).toBe(50);
  });

  it("sent back is the share of finished work that went back at least once", () => {
    const figure = sentBack(facts, march, null);
    expect(figure.value).toBe(50);
    expect(figure.times).toBe(2);
  });

  it("in and out counts new and finished work by week for a month", () => {
    const flow = inAndOut(facts, march, null, "2026-03-20");
    expect(flow.weekly).toBe(true);
    expect(flow.totalIn).toBe(5);
    expect(flow.totalOut).toBe(4);
    // The week of 23 March has not happened yet.
    expect(flow.buckets.at(-1)).toMatchObject({ in: null, out: null });
  });

  it("writes days short", () => {
    expect(formatDays(0.01)).toBe("<1 h");
    expect(formatDays(0.5)).toBe("12 h");
    expect(formatDays(3)).toBe("3 d");
    expect(formatDays(3.62)).toBe("3.6 d");
    expect(formatDays(12.4)).toBe("12 d");
  });
});
