import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, WorkspaceMember } from "@/domain";
import { EVERY_PORTAL_RANGE } from "@/domain";
import { buildPermissionContext, canUseInternalPortal } from "@/lib/permissions/permissions";
import { createServices } from "@/services";

/**
 * The internal portal (v0.157): every task on the team boards the reader can
 * see, as the portal arranges them, offered to admins and allocators.
 */
describe("the internal portal", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let boards: Board[];

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `internal-portal-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
  });

  const read = (from: readonly Board[], scope: { teamId?: string | null } = {}) =>
    services.portals.internalBoard({ workspaceId: SEED_WORKSPACE_ID, boards: from, scope: { stakeholderId: null, teamId: scope.teamId ?? null, range: EVERY_PORTAL_RANGE }, viewerName: "Danh" });

  it("lists every open task on the team boards it is given, and none from the built-in boards", async () => {
    const payload = await read(boards);
    const team = boards.filter((b) => !b.system && !b.archivedAt);
    const expected = new Set<string>();
    for (const board of team) for (const item of await repos.items.listByBoard(board.id)) if (!item.parentItemId && !item.archivedAt) expected.add(item.id);
    const shown = Object.keys(payload.boardOfItem);
    expect(shown.length).toBeGreaterThan(0);
    // Linked copies are shown once, so never more than the open top-level tasks.
    expect(shown.length).toBeLessThanOrEqual(expected.size);
    expect(shown.every((id) => expected.has(id))).toBe(true);
    const system = new Set(boards.filter((b) => b.system).map((b) => b.id));
    expect(Object.values(payload.boardOfItem).some((boardId) => system.has(boardId))).toBe(false);
    // Each row names the board it really lives on.
    for (const [itemId, boardId] of Object.entries(payload.boardOfItem).slice(0, 5)) expect((await repos.items.getById(itemId))?.boardId).toBe(boardId);
    expect(payload.items.length).toBeGreaterThanOrEqual(shown.length);
    expect(payload.context.teams.length).toBeGreaterThan(0);
  });

  it("reads only the boards it is handed, so a board the reader cannot open stays out", async () => {
    const team = boards.filter((b) => !b.system && !b.archivedAt);
    const [kept, left] = [team[0]!, team[1]!];
    const payload = await read([kept]);
    const onLeft = new Set((await repos.items.listByBoard(left.id)).map((i) => i.id));
    expect(Object.keys(payload.boardOfItem).some((id) => onLeft.has(id))).toBe(false);
    expect(new Set(Object.values(payload.boardOfItem))).toEqual(new Set([kept.id]));
  });

  it("narrows to one team", async () => {
    const all = await read(boards);
    const team = all.context.teams[0]!;
    const one = await read(boards, { teamId: team.id });
    expect(Object.keys(one.boardOfItem)).toHaveLength(team.count);
    expect(Object.values(one.boardOfItem).every((boardId) => boards.find((b) => b.id === boardId)?.teamId === team.id)).toBe(true);
  });
});

describe("who is offered the internal portal", () => {
  const taskAllocation = { id: "ta", ownerId: "someone", teamId: "admin-team", visibility: "PRIVATE", system: "TASK_ALLOCATION", editScope: "ADDED" } as unknown as Board;
  const member = (role: WorkspaceMember["role"]) => [{ userId: SEED_USER_IDS.emily, workspaceId: SEED_WORKSPACE_ID, role, status: "ACTIVE" }] as unknown as WorkspaceMember[];

  it("is offered to admins", () => {
    const ctx = buildPermissionContext({ userId: SEED_USER_IDS.emily, workspaceMembers: member("ADMIN"), teamMembers: [], boardMembers: [] });
    expect(canUseInternalPortal(ctx, taskAllocation)).toBe(true);
  });

  it("is offered to an allocator, who may edit Task Allocation, and to no other member", () => {
    const plain = buildPermissionContext({ userId: SEED_USER_IDS.emily, workspaceMembers: member("MEMBER"), teamMembers: [], boardMembers: [] });
    expect(canUseInternalPortal(plain, taskAllocation)).toBe(false);
    const viewer = buildPermissionContext({ userId: SEED_USER_IDS.emily, workspaceMembers: member("MEMBER"), teamMembers: [], boardMembers: [{ boardId: "ta", userId: SEED_USER_IDS.emily, role: "VIEWER" } as never] });
    expect(canUseInternalPortal(viewer, taskAllocation)).toBe(false);
    const allocator = buildPermissionContext({ userId: SEED_USER_IDS.emily, workspaceMembers: member("MEMBER"), teamMembers: [], boardMembers: [{ boardId: "ta", userId: SEED_USER_IDS.emily, role: "EDITOR" } as never] });
    expect(canUseInternalPortal(allocator, taskAllocation)).toBe(true);
    expect(canUseInternalPortal(allocator, undefined)).toBe(false);
  });
});
