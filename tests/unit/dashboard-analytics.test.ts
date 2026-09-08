import { describe, expect, it } from "vitest";
import type { Board, BoardColumn, BoardGroup, DashboardSnapshot, Item, ItemAsset, ItemColumnValue, ItemLink, Team, User } from "@/domain";
import { defaultSettingsFor, publicDashboardSnapshot } from "@/domain";
import {
  acrossTheYear,
  assetMix,
  assetTypesByTeam,
  assetsInScope,
  buildFacts,
  deliveryByTeam,
  previousScope,
  requestsInScope,
  scopeLabel,
  summarize,
  summarizeRequests,
  taskDate,
  tasksInScope,
  type DashboardScope,
} from "@/features/dashboard/analytics";

const WS = "ws-1";
const now = "2026-09-08T09:00:00.000Z";

function team(id: string, name: string, color: Team["color"] = "red"): Team {
  return { id, workspaceId: WS, name, description: null, color, icon: "users", archivedAt: null, createdAt: now, updatedAt: now };
}
function board(id: string, teamId: string | null, name = id, system: Board["system"] = null): Board {
  return { id, workspaceId: WS, teamId, name, slug: id, description: null, type: "MAIN", visibility: "WORKSPACE", ownerId: "u-danh", color: "blue", icon: "layout-grid", archivedAt: null, system, createdAt: now, updatedAt: now };
}
function group(id: string, boardId: string, name: string): BoardGroup {
  return { id, boardId, name, color: "gray", position: 0, collapsed: false, createdAt: now };
}
function column(id: string, boardId: string, name: string, type: BoardColumn["type"]): BoardColumn {
  return { id, boardId, name, type, settings: defaultSettingsFor(type), position: 0, width: 150, hidden: false, createdAt: now };
}
function item(id: string, boardId: string, groupId: string, createdAt: string, extra: Partial<Item> = {}): Item {
  return { id, boardId, groupId, parentItemId: null, name: id, description: "a brief", position: 0, createdBy: "u-danh", archivedAt: null, createdAt, updatedAt: createdAt, ...extra };
}
function value(itemId: string, columnId: string, v: ItemColumnValue["value"]): ItemColumnValue {
  return { id: `${itemId}:${columnId}`, itemId, columnId, value: v, updatedAt: now };
}
function asset(id: string, itemId: string, boardId: string, type: string | null, quantity: number | null, completedAt: string | null = null, dueDate: string | null = null): ItemAsset {
  return { id, itemId, boardId, name: id, assetType: type, quantity, assigneeIds: ["u-tuyet"], dueDate, completedAt, notes: "1080×1080", position: 0, createdBy: "u-danh", createdAt: now, updatedAt: now };
}
function user(id: string, displayName: string, department: string | null = null): User {
  return { id, email: `${id}@rmit.local`, firstName: displayName, lastName: "", displayName, avatarUrl: null, jobTitle: "Designer", department, timezone: "Australia/Melbourne", deactivatedAt: null, createdAt: now, updatedAt: now };
}

/**
 * Two teams, one intake board. Team A has three tasks (one done, one linked to a
 * copy on team B's board), team B has two; the intake board holds two bookings.
 */
function snapshot(): DashboardSnapshot {
  const teams = [team("t-a", "Alpha", "red"), team("t-b", "Beta", "blue"), { ...team("t-admin", "Admin", "gray"), system: "ADMIN" as const }];
  const boards = [board("b-a", "t-a", "Alpha board"), board("b-b", "t-b", "Beta board"), board("b-intake", "t-admin", "Task Allocation", "TASK_ALLOCATION")];
  const groups = [group("g-a", "b-a", "Work"), group("g-b", "b-b", "Work"), group("g-in", "b-intake", "Incoming"), group("g-alloc", "b-intake", "Allocated")];
  const columns = [
    column("c-a-status", "b-a", "Status", "STATUS"),
    column("c-a-due", "b-a", "Due Date", "DATE"),
    column("c-a-owner", "b-a", "Owner", "PERSON"),
    column("c-b-status", "b-b", "Status", "STATUS"),
    column("c-b-due", "b-b", "Due Date", "DATE"),
    column("c-b-requester", "b-b", "Requester", "PERSON"),
    column("c-in-status", "b-intake", "Status", "STATUS"),
    column("c-in-requester", "b-intake", "Requester", "TEXT"),
    column("c-in-email", "b-intake", "Email", "TEXT"),
    column("c-in-dept", "b-intake", "Department", "TEXT"),
    column("c-in-team", "b-intake", "Requested team", "TAGS"),
    column("c-in-priority", "b-intake", "Priority", "PRIORITY"),
    column("c-in-due", "b-intake", "Due Date", "DATE"),
  ];
  const items = [
    item("a1", "b-a", "g-a", "2026-02-10T00:00:00.000Z"),
    item("a2", "b-a", "g-a", "2026-05-01T00:00:00.000Z"),
    item("a3", "b-a", "g-a", "2025-11-20T00:00:00.000Z"),
    item("a3-sub", "b-a", "g-a", "2025-11-20T00:00:00.000Z", { parentItemId: "a3" }),
    item("b1", "b-b", "g-b", "2026-03-15T00:00:00.000Z"),
    item("b2", "b-b", "g-b", "2026-06-02T00:00:00.000Z"),
    item("in1", "b-intake", "g-in", "2026-08-30T00:00:00.000Z"),
    item("in2", "b-intake", "g-alloc", "2026-07-12T00:00:00.000Z"),
  ];
  const values = [
    value("a1", "c-a-status", { type: "STATUS", labelId: "done" }),
    value("a1", "c-a-due", { type: "DATE", date: "2026-02-20" }),
    value("a1", "c-a-owner", { type: "PERSON", userIds: ["u-tuyet"] }),
    value("a2", "c-a-status", { type: "STATUS", labelId: "working" }),
    value("a2", "c-a-due", { type: "DATE", date: "2026-05-20" }),
    value("a2", "c-a-owner", { type: "PERSON", userIds: ["u-tuyet", "u-duc"] }),
    value("a3", "c-a-status", { type: "STATUS", labelId: "stuck" }),
    value("a3", "c-a-due", { type: "DATE", date: "2026-01-05" }),
    value("b1", "c-b-status", { type: "STATUS", labelId: "done" }),
    value("b1", "c-b-due", { type: "DATE", date: "2026-03-30" }),
    value("b1", "c-b-requester", { type: "PERSON", userIds: ["u-grace"] }),
    value("b2", "c-b-status", { type: "STATUS", labelId: "not_started" }),
    value("in1", "c-in-status", { type: "STATUS", labelId: "not_started" }),
    value("in1", "c-in-requester", { type: "TEXT", text: "Hannah Lee" }),
    value("in1", "c-in-email", { type: "TEXT", text: "hannah.lee@rmit.edu.au" }),
    value("in1", "c-in-dept", { type: "TEXT", text: "School of Business" }),
    value("in1", "c-in-team", { type: "TAGS", tags: ["Alpha"] }),
    value("in1", "c-in-priority", { type: "PRIORITY", labelId: "high" }),
    value("in1", "c-in-due", { type: "DATE", date: "2026-09-20" }),
    value("in2", "c-in-status", { type: "STATUS", labelId: "working" }),
    value("in2", "c-in-dept", { type: "TEXT", text: "Library" }),
    value("in2", "c-in-due", { type: "DATE", date: "2026-07-30" }),
  ];
  const assets = [
    asset("as1", "a1", "b-a", "Print", 4, "2026-02-18T00:00:00.000Z", "2026-02-18"),
    asset("as2", "a1", "b-a", "Digital", null, null, "2026-02-20"),
    asset("as3", "a2", "b-a", "Print", 10),
    asset("as4", "b2", "b-b", "Social", 3),
    asset("as5", "b1", "b-b", null, 2, "2026-03-29T00:00:00.000Z"),
    // Intake lines: requests, not delivery. Must never count as assets delivered.
    asset("as6", "in1", "b-intake", "Print", 200),
  ];
  // a2 is mirrored on Beta's board as b2 (allocated copy): counted once, under the earlier copy.
  const links: ItemLink[] = [{ id: "l1", workspaceId: WS, itemAId: "a2", itemBId: "b2", excluded: [], createdBy: "u-danh", createdAt: now }];
  const users = [user("u-danh", "Danh Nguyen"), user("u-tuyet", "Tuyet Le"), user("u-duc", "Duc Tran"), user("u-grace", "Grace Kim", "Content")];
  return { workspace: { id: WS, name: "Test", slug: "test" }, teams, boards, groups, columns, items, values, assets, links, users, generatedAt: now };
}

const year2026: DashboardScope = { span: "year", year: 2026, half: 1, quarter: 1, teamIds: null, basis: "due" };

describe("buildFacts", () => {
  it("counts top-level items off the intake board as tasks, once per linked pair", () => {
    const facts = buildFacts(snapshot());
    expect(facts.tasks.map((t) => t.id).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(facts.tasks.find((t) => t.id === "a2")?.team.name).toBe("Alpha");
  });

  it("resolves status roles, due dates, owners and completion", () => {
    const facts = buildFacts(snapshot());
    const a1 = facts.tasks.find((t) => t.id === "a1")!;
    expect(a1.isDone).toBe(true);
    expect(a1.status).toBe("done");
    expect(a1.dueDate).toBe("2026-02-20");
    expect(a1.completedAt).toBe("2026-02-18");
    expect(a1.assetUnits).toBe(5);
    expect(a1.doneAssetUnits).toBe(4);
    const a3 = facts.tasks.find((t) => t.id === "a3")!;
    expect(a3.status).toBe("stuck");
    expect(facts.tasks.find((t) => t.id === "a2")?.owners).toEqual(["u-tuyet", "u-duc"]);
  });

  it("treats intake items and requester-tagged tasks as requests, with department, team and stage", () => {
    const facts = buildFacts(snapshot());
    expect(facts.requests.map((r) => r.id).sort()).toEqual(["b1", "in1", "in2"]);
    const in1 = facts.requests.find((r) => r.id === "in1")!.request!;
    expect(in1).toMatchObject({ requesterName: "Hannah Lee", department: "School of Business", teamName: "Alpha", urgency: "High", stage: "incoming", assetTypes: ["Print"] });
    expect(facts.requests.find((r) => r.id === "in2")!.request!.stage).toBe("allocated");
    // A person-column requester carries their own department; the board's team is the requested team.
    expect(facts.requests.find((r) => r.id === "b1")!.request).toMatchObject({ requesterName: "Grace Kim", department: "Content", teamName: "Beta", stage: "closed" });
  });

  it("keeps asset lines of delivery tasks only", () => {
    const facts = buildFacts(snapshot());
    expect(facts.assets.map((a) => a.id).sort()).toEqual(["as1", "as2", "as3", "as5"]);
    expect(facts.assets.find((a) => a.id === "as2")?.units).toBe(1);
    expect(facts.assets.find((a) => a.id === "as5")?.type).toBe("Untyped");
    expect(facts.years).toEqual([2026, 2025]);
    expect(facts.earliest).toBe("2025-11-20");
  });
});

describe("scope", () => {
  it("places tasks by the chosen basis and filters by span and team", () => {
    const facts = buildFacts(snapshot());
    expect(tasksInScope(facts.tasks, year2026).map((t) => t.id).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(tasksInScope(facts.tasks, { ...year2026, half: 1, span: "half" }).map((t) => t.id).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(tasksInScope(facts.tasks, { ...year2026, span: "quarter", quarter: 2 }).map((t) => t.id)).toEqual(["a2"]);
    expect(tasksInScope(facts.tasks, { ...year2026, basis: "created" }).map((t) => t.id).sort()).toEqual(["a1", "a2", "b1"]);
    expect(tasksInScope(facts.tasks, { ...year2026, basis: "completed" }).map((t) => t.id).sort()).toEqual(["a1", "b1"]);
    expect(tasksInScope(facts.tasks, { ...year2026, teamIds: ["t-b"] }).map((t) => t.id)).toEqual(["b1"]);
    expect(tasksInScope(facts.tasks, { ...year2026, span: "total" })).toHaveLength(4);
    const a3 = facts.tasks.find((t) => t.id === "a3")!;
    expect(taskDate(a3, "due")).toBe("2026-01-05");
    expect(taskDate(a3, "completed")).toBeNull();
  });

  it("labels the span and steps back a year for the comparison", () => {
    expect(scopeLabel(year2026)).toBe("2026");
    expect(scopeLabel({ ...year2026, span: "quarter", quarter: 3 })).toBe("2026 · Q3");
    expect(previousScope(year2026)?.year).toBe(2025);
    expect(previousScope({ ...year2026, span: "total" })).toBeNull();
  });
});

describe("aggregates", () => {
  const facts = buildFacts(snapshot());
  const tasks = tasksInScope(facts.tasks, year2026);
  const assets = assetsInScope(facts.assets, year2026);
  const requests = requestsInScope(facts.requests, year2026);

  it("summarises delivery, completion and lateness", () => {
    const s = summarize(tasks, assets, requests, "2026-09-08");
    // a2 (due May, in progress) and a3 (due January, stuck) are both past due on 8 September.
    expect(s).toMatchObject({ tasks: 4, doneTasks: 2, assetUnits: 17, doneAssetUnits: 6, overdue: 2, stuck: 1, inProgress: 1, requests: 3, openRequests: 2, teams: 2, boards: 2 });
    expect(s.onTimeRate).toBe(100);
    expect(s.people).toBe(2);
  });

  it("ranks teams and asset types", () => {
    const teams = deliveryByTeam(tasks, assets, facts.teams, "2026-09-08", "assets");
    expect(teams.map((t) => [t.name, t.tasks, t.assetUnits])).toEqual([
      ["Alpha", 3, 15],
      ["Beta", 1, 2],
    ]);
    expect(assetMix(assets).map((r) => [r.name, r.value])).toEqual([
      ["Print", 14],
      ["Untyped", 2],
      ["Digital", 1],
    ]);
    const dist = assetTypesByTeam(assets, facts.teams);
    expect(dist[0]).toMatchObject({ name: "Print", total: 14 });
    expect(dist[0]!.segments.map((s) => s.label)).toEqual(["Alpha"]);
  });

  it("lays the year out month by month with one dot per task", () => {
    const { months, dots } = acrossTheYear(facts.tasks, facts.assets, 2026, "due", "assets", null);
    expect(months[1]).toMatchObject({ month: 1, value: 5, done: 4 });
    expect(months[4]).toMatchObject({ month: 4, value: 10, done: 0 });
    expect(dots.map((d) => d.id)).toEqual(["a1", "b1", "a2"]);
    expect(dots[0]!.x).toBeGreaterThan(0.13);
    expect(dots[0]!.x).toBeLessThan(0.14);
    const byTasks = acrossTheYear(facts.tasks, facts.assets, 2026, "due", "tasks", ["t-a"]);
    expect(byTasks.months.reduce((s, m) => s + m.value, 0)).toBe(3);
    expect(byTasks.dots).toHaveLength(3);
  });

  it("summarises requests by department, team, urgency and month", () => {
    const r = summarizeRequests(requests, 2026, facts.teams);
    expect(r.total).toBe(3);
    expect(r.open).toBe(2);
    expect(r.byDepartment.map((d) => d.name)).toEqual(["Content", "Library", "School of Business"]);
    expect(r.byTeam.map((d) => [d.name, d.value])).toEqual([
      ["Alpha", 1],
      ["Beta", 1],
      ["Unassigned", 1],
    ]);
    expect(r.byUrgency.map((d) => d.name)).toEqual(["High", "No priority"]);
    expect(r.perMonth[6]).toBe(1);
    expect(r.perMonth[7]).toBe(1);
    expect(r.medianLeadDays).toBe(18);
  });
});

describe("publicDashboardSnapshot", () => {
  it("strips briefs, notes, contact details and every text cell but the department", () => {
    const pub = publicDashboardSnapshot(snapshot());
    expect(pub.items.every((i) => i.description === null)).toBe(true);
    expect(pub.assets.every((a) => a.notes === null)).toBe(true);
    expect(pub.users.every((u) => u.email === "" && u.jobTitle === null)).toBe(true);
    const textColumns = new Set(pub.values.filter((v) => v.value.type === "TEXT").map((v) => v.columnId));
    expect([...textColumns]).toEqual(["c-in-dept"]);
    // The charts still have what they need: the requests panel keeps its departments and teams.
    const facts = buildFacts(pub);
    expect(facts.requests.find((r) => r.id === "in1")!.request).toMatchObject({ requesterName: null, department: "School of Business", teamName: "Alpha" });
  });
});
