import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { PortalTask, PortalTeamRef } from "@/domain";
import { defaultSettingsFor, EVERY_PORTAL_RANGE } from "@/domain";
import { applyPortalGrouping, withTeamColumn } from "@/features/portal/portal-grouping";
import { createServices } from "@/services";
import { buildPortalBoard, type PortalBoardTask } from "@/services/portal/portal-board";

/**
 * Teams in both portals (v0.157.1): a grouping by team, and a hidden Team
 * column so Kanban can lay its lanes out by team. Both read the team each row
 * carries (`teamOfItem`); neither reads anything more.
 */
function task(id: string, sourceName: string): PortalTask {
  return {
    id,
    ticket: null,
    name: `Task ${id}`,
    status: null,
    priority: null,
    dueDate: null,
    timeline: null,
    people: [],
    sourceName,
    assetTypes: [],
    deliverables: { total: 0, done: 0 },
    subitems: { total: 0, done: 0 },
    stakeholder: null,
    linkedCount: 0,
    awaitingAllocation: false,
    bookedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

const entry = (t: PortalTask): PortalBoardTask => ({ task: t, brief: null, deliverables: [], subitems: [] });
const BRAND: PortalTeamRef = { id: "team-brand", name: "Brand", color: "purple" };
const VIDEO: PortalTeamRef = { id: "team-video", name: "Video & Motion", color: "red" };

function payload() {
  const board = buildPortalBoard({
    portalId: "portal-1",
    workspaceId: "ws-1",
    tasks: [entry(task("a", "Brand Board")), entry(task("b", "Reels")), entry(task("c", "Brand Board")), entry(task("d", "Task Allocation"))],
    links: [],
    comments: [],
    commentAuthors: [],
    workspaceName: "RMIT",
    now: "2026-09-09T00:00:00.000Z",
  });
  return { ...board, teamOfItem: { a: BRAND, b: VIDEO, c: BRAND, d: null } as Record<string, PortalTeamRef | null> };
}

describe("grouping by team", () => {
  it("makes one group per team in name order, the teamless last, with the same items", () => {
    const before = payload();
    const after = applyPortalGrouping(before, "team", [], before.teamOfItem);
    expect(after.groups.map((g) => g.name)).toEqual(["Brand", "Video & Motion", "No team"]);
    const nameOf = (id: string) => after.groups.find((g) => g.id === after.items.find((i) => i.id === id)!.groupId)!.name;
    expect([nameOf("a"), nameOf("b"), nameOf("c"), nameOf("d")]).toEqual(["Brand", "Video & Motion", "Brand", "No team"]);
    expect(after.items.map((i) => i.id).sort()).toEqual(before.items.map((i) => i.id).sort());
    expect(after.values).toBe(before.values);
  });

  it("leaves the board as it was without teams to group by", () => {
    const before = payload();
    expect(applyPortalGrouping(before, "team", [], undefined)).toBe(before);
  });
});

describe("the Team column for Kanban lanes", () => {
  it("adds a hidden list column with a label per team and a value per task that has one", () => {
    const before = payload();
    const after = withTeamColumn(before);
    const column = after.columns.find((c) => c.name === "Team")!;
    expect(column.type).toBe("DROPDOWN");
    expect(column.hidden).toBe(true);
    expect(column.hiddenInPanel).toBe(true);
    expect(column.settings.kind === "dropdown" ? column.settings.labels.map((l) => l.name) : null).toEqual(["Brand", "Video & Motion"]);
    const values = after.values.filter((v) => v.columnId === column.id);
    expect(Object.fromEntries(values.map((v) => [v.itemId, v.value.type === "DROPDOWN" ? v.value.labelId : null]))).toEqual({ a: BRAND.id, b: VIDEO.id, c: BRAND.id });
    // Everything that was there is still there.
    expect(after.columns.slice(0, before.columns.length)).toEqual(before.columns);
  });

  it("adds nothing when no row has a team", () => {
    const before = { ...payload(), teamOfItem: { a: null, b: null, c: null, d: null } };
    expect(withTeamColumn(before)).toBe(before);
    const none = payload();
    delete (none as { teamOfItem?: unknown }).teamOfItem;
    expect(withTeamColumn(none)).toBe(none);
  });
});

describe("the stakeholders' portal carries each request's team", () => {
  it("names the team of the board each request is on", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `portal-team-${Date.now()}-${Math.random()}` }));
    const board = (await services.repos.boards.getById(SEED_BOARD_IDS.rmitinerary))!;
    const team = (await services.repos.teams.getById(board.teamId!))!;
    const departments = await services.portals.ensureDepartments(SEED_WORKSPACE_ID);
    const column = await services.repos.boards.createColumn({ boardId: board.id, name: "Stakeholder", type: "STAKEHOLDER", settings: defaultSettingsFor("STAKEHOLDER"), position: 99, width: 124, hidden: false });
    const item = (await services.repos.items.listByBoard(board.id)).find((i) => i.parentItemId === null && !i.archivedAt)!;
    await services.repos.items.setValue(item.id, column.id, { type: "STAKEHOLDER", group: departments[0]!.name });

    const portal = await services.portals.setEnabled(SEED_WORKSPACE_ID, true);
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const result = await services.portals.board(resolved, { stakeholderId: null, range: EVERY_PORTAL_RANGE });
    expect(result.teamOfItem?.[item.id]).toEqual({ id: team.id, name: team.name, color: team.color });
    // Only the requests the portal shows: nothing else on the board is named.
    expect(Object.keys(result.teamOfItem ?? {})).toEqual(result.items.filter((i) => i.parentItemId === null).map((i) => i.id).filter((id) => id in (result.teamOfItem ?? {})));
    expect(Object.keys(result.teamOfItem ?? {})).toContain(item.id);
    expect(Object.keys(result.teamOfItem ?? {}).length).toBe(result.items.filter((i) => i.parentItemId === null).length);
  });
});
