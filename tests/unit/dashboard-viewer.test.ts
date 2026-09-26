import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { buildPermissionContext, canEditBoardSeat, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { createServices } from "@/services";

async function setup(name: string) {
  const services = createServices(createLocalRepositories({ databaseName: `dashboard-viewer-${name}-${Date.now()}` }));
  await services.repos.admin.resetToSeed();
  const context = async (userId: string) => {
    const [members, teamMembers, boardMembers] = await Promise.all([
      services.repos.workspaces.listMembers(SEED_WORKSPACE_ID),
      services.repos.teams.listMembersByWorkspace(SEED_WORKSPACE_ID),
      services.repos.boards.listMembersByWorkspace(SEED_WORKSPACE_ID),
    ]);
    return buildPermissionContext({ userId, workspaceMembers: members, teamMembers, boardMembers });
  };
  return { services, context };
}

describe("the dashboard, for whoever reads it", () => {
  it("counts every board for a member, and names nothing on the boards they cannot open", async () => {
    const { services, context } = await setup("same");
    const load = async (userId: string) => services.dashboard.loadForViewer({ workspaceId: SEED_WORKSPACE_ID, workspaceSlug: "rmit", viewer: await context(userId) });
    const admin = await load(SEED_USER_IDS.emily);
    const member = await load(SEED_USER_IDS.jun);

    // The same boards, tasks and deliverables, so the same figures.
    expect(member.boards.map((b) => b.id).sort()).toEqual(admin.boards.map((b) => b.id).sort());
    expect(member.items.length).toBe(admin.items.length);
    expect(member.assets.length).toBe(admin.assets.length);

    const jun = await context(SEED_USER_IDS.jun);
    const closed = member.boards.filter((b) => !canViewBoard(jun, b));
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.some((b) => b.system === "TASK_ALLOCATION")).toBe(true);
    for (const board of closed) {
      expect(board.name).toBe("");
      expect(member.items.filter((i) => i.boardId === board.id).every((i) => i.name === "" && i.ticket === null)).toBe(true);
    }
    // What they can open arrives as it is.
    const open = member.boards.find((b) => canViewBoard(jun, b))!;
    expect(open.name).not.toBe("");
    expect(admin.items.filter((i) => i.boardId !== undefined && closed.some((b) => b.id === i.boardId)).some((i) => i.name !== "")).toBe(true);
  });

  it("leaves the App development board out for everyone", async () => {
    const { services, context } = await setup("bugs");
    await services.bugReports.file(SEED_WORKSPACE_ID, { category: "other", description: "A bug", screenshots: [], pageUrl: null, appVersion: null, userAgent: null, viewport: null }, SEED_USER_IDS.jun);
    const snapshot = await services.dashboard.loadForViewer({ workspaceId: SEED_WORKSPACE_ID, workspaceSlug: "rmit", viewer: await context(SEED_USER_IDS.danh) });
    expect(snapshot.boards.some((b) => b.system === "APP_DEVELOPMENT")).toBe(false);
  });
});

describe("a seat on a board", () => {
  it("is somebody else's to change, and on App development the owner's alone", async () => {
    const { services, context } = await setup("seats");
    await services.bugReports.file(SEED_WORKSPACE_ID, { category: "other", description: "A bug", screenshots: [], pageUrl: null, appVersion: null, userAgent: null, viewport: null }, SEED_USER_IDS.jun);
    const bugs = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => b.system === "APP_DEVELOPMENT")!;
    await services.boards.setMember(bugs.id, SEED_USER_IDS.emily, "VIEWER", SEED_USER_IDS.danh, "Emily");

    const emily = await context(SEED_USER_IDS.emily);
    const danh = await context(SEED_USER_IDS.danh);
    // Emily, a workspace admin seated as a viewer, sees it and cannot run it.
    expect([canViewBoard(emily, bugs), canManageBoard(emily, bugs), canEditBoardSeat(emily, bugs, SEED_USER_IDS.emily)]).toEqual([true, false, false]);
    expect([canManageBoard(danh, bugs), canEditBoardSeat(danh, bugs, SEED_USER_IDS.emily), canEditBoardSeat(danh, bugs, SEED_USER_IDS.danh)]).toEqual([true, true, false]);
    await expect(services.boards.setMember(bugs.id, SEED_USER_IDS.emily, "EDITOR", SEED_USER_IDS.emily, "Emily")).rejects.toThrow(/own place/);
    await expect(services.boards.removeMember(bugs.id, SEED_USER_IDS.emily, SEED_USER_IDS.emily, "Emily")).rejects.toThrow(/own place/);

    // Elsewhere an admin still runs the board, but not their own seat on it.
    const other = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && b.ownerId !== SEED_USER_IDS.emily)!;
    await services.boards.setMember(other.id, SEED_USER_IDS.emily, "VIEWER", other.ownerId, "Emily");
    const seated = await context(SEED_USER_IDS.emily);
    expect([canManageBoard(seated, other), canEditBoardSeat(seated, other, SEED_USER_IDS.emily), canEditBoardSeat(seated, other, SEED_USER_IDS.jun)]).toEqual([true, false, true]);
  });
});
