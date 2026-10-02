import { describe, expect, it } from "vitest";
import type { Board, BoardColumn, DashboardSnapshot, Item, ItemColumnValue, StatusChange, Team } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { buildFacts } from "@/features/dashboard/analytics";
import { resolvePeriod } from "@/features/dashboard/metrics";
import { aging, daysInStatus, departmentService } from "@/features/dashboard/service-levels";

const WS = "ws-1";
const now = "2026-03-20T09:00:00.000Z";
const NOW = Date.parse(now);

const team: Team = { id: "t-a", workspaceId: WS, name: "Alpha", description: null, color: "red", icon: "users", archivedAt: null, createdAt: now, updatedAt: now };
const board = (id: string, system: Board["system"] = null): Board => ({ id, workspaceId: WS, teamId: "t-a", name: id, slug: id, description: null, type: "MAIN", visibility: "WORKSPACE", ownerId: "u", color: "blue", icon: "layout-grid", archivedAt: null, system, createdAt: now, updatedAt: now });
const column = (id: string, boardId: string, name: string, type: BoardColumn["type"], position: number): BoardColumn => ({ id, boardId, name, type, settings: defaultSettingsFor(type), position, width: 150, hidden: false, createdAt: now });
const item = (id: string, createdAt: string, boardId = "b-a"): Item => ({ id, boardId, groupId: boardId === "b-a" ? "g" : "g-in", parentItemId: null, name: id, description: null, position: 0, createdBy: "u", archivedAt: null, createdAt, updatedAt: createdAt });
const status = (itemId: string, labelId: string, columnId = "c-status"): ItemColumnValue => ({ id: `${itemId}:s`, itemId, columnId, value: { type: "STATUS", labelId }, updatedAt: now });
const dept = (itemId: string, group: string, columnId = "c-dept"): ItemColumnValue => ({ id: `${itemId}:p`, itemId, columnId, value: { type: "STAKEHOLDER", group }, updatedAt: now });
const due = (itemId: string, date: string): ItemColumnValue => ({ id: `${itemId}:d`, itemId, columnId: "c-due", value: { type: "DATE", date }, updatedAt: now });
const change = (itemId: string, at: string, from: string | null, to: string): StatusChange => ({ itemId, at, column: "Status", from, to });
const department = (id: string, name: string) => ({ id, workspaceId: WS, name, color: "blue" as const, position: 0, status: "ACTIVE" as const, createdAt: now, updatedAt: now });

/**
 * In March 2026, for two departments:
 *  a — Events, made 1 Mar, started 3 Mar, in progress since: 17 days in status;
 *  b — Events, made 18 Mar, never moved: 2 days in status;
 *  c — Events, made 2 Mar, picked up 4 Mar, done 10 Mar by its due date;
 *  d — Comms, made 5 Mar, in review since 15 Mar: 5 days;
 *  e — Events, a request on the intake board, not placed yet.
 */
function snapshot(): DashboardSnapshot {
  return {
    workspace: { id: WS, name: "Test", slug: "test" },
    teams: [team],
    boards: [board("b-a"), board("b-in", "TASK_ALLOCATION")],
    groups: [
      { id: "g", boardId: "b-a", name: "Work", color: "gray", position: 0, collapsed: false, createdAt: now },
      { id: "g-in", boardId: "b-in", name: "New requests", color: "gray", position: 0, collapsed: false, createdAt: now },
    ],
    columns: [column("c-status", "b-a", "Status", "STATUS", 0), column("c-dept", "b-a", "Department", "STAKEHOLDER", 1), column("c-due", "b-a", "Due Date", "DATE", 2), column("c-in-dept", "b-in", "Department", "STAKEHOLDER", 0)],
    items: [item("a", "2026-03-01T09:00:00.000Z"), item("b", "2026-03-18T09:00:00.000Z"), item("c", "2026-03-02T09:00:00.000Z"), item("d", "2026-03-05T09:00:00.000Z"), item("e", "2026-03-19T09:00:00.000Z", "b-in")],
    values: [status("a", "working"), dept("a", "Events"), dept("b", "Events"), status("c", "done"), dept("c", "Events"), due("c", "2026-03-12"), status("d", "working"), dept("d", "Comms"), dept("e", "Events", "c-in-dept")],
    assets: [],
    links: [],
    users: [],
    departments: [department("d-ev", "Events"), department("d-co", "Comms")],
    statusChanges: [
      change("a", "2026-03-03T09:00:00.000Z", "Not Started", "Working on it"),
      change("c", "2026-03-04T09:00:00.000Z", "Not Started", "Working on it"),
      change("c", "2026-03-10T09:00:00.000Z", "Working on it", "Done"),
      change("d", "2026-03-15T09:00:00.000Z", "Not Started", "Working on it"),
    ],
    generatedAt: now,
  };
}

const march = resolvePeriod({ mode: "month", year: 2026, quarter: 1, month: 3, from: null, to: null, comparisonYear: 2025 }, "2026-03-20");

describe("aging work", () => {
  const facts = buildFacts(snapshot());
  const task = (id: string) => facts.tasks.find((t) => t.id === id)!;

  it("counts from the last change of status, or from when the task was made", () => {
    expect(daysInStatus(task("a"), NOW)).toBe(17);
    expect(daysInStatus(task("b"), NOW)).toBe(2);
  });

  it("sorts open work by status into age bands, leaving finished work out", () => {
    const rows = aging(facts, null, NOW);
    const all = rows.flatMap((r) => r.bands.flat().map((t) => t.id)).sort();
    expect(all).toEqual(["a", "b", "d"]);
    const working = rows.find((r) => r.bands[3]!.some((t) => t.id === "a"))!;
    expect(working.bands[1]!.map((t) => t.id)).toEqual(["d"]);
    expect(working.oldest).toBe(17);
    // The status with work two weeks old comes first.
    expect(rows[0]).toBe(working);
  });
});

describe("department service levels", () => {
  const facts = buildFacts(snapshot());
  const rows = departmentService(facts, march, null, NOW);
  const row = (name: string) => rows.find((r) => r.name === name)!;

  it("counts open work, requests still waiting, and work finished in the period", () => {
    expect(row("Events").open.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(row("Events").waiting.map((t) => t.id)).toEqual(["e"]);
    expect(row("Events").finished.map((t) => t.id)).toEqual(["c"]);
    expect(row("Comms").open.map((t) => t.id)).toEqual(["d"]);
  });

  it("reads how fast and how reliably the work came back", () => {
    expect(row("Events").turnaround).toBe(8);
    expect(row("Events").onTime).toBe(100);
    expect(row("Events").sentBack).toBe(0);
    expect(row("Comms").turnaround).toBeNull();
  });

  it("measures pick-up from a task being made to its first change of status", () => {
    // a waited 2 days, c waited 2 days; b has not moved yet and is not counted.
    expect(row("Events").firstMove).toBe(2);
    expect(row("Comms").firstMove).toBe(10);
    expect(row("Events").oldestOpen).toBe(19);
  });

  it("puts the departments with most in hand first", () => {
    expect(rows.map((r) => r.name)).toEqual(["Events", "Comms"]);
  });
});
