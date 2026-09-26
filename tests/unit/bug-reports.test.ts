import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { BUG_BOARD, BUG_BOARD_OWNER_EMAIL, bugReportTitle, type BugReportInput } from "@/domain";
import { buildPermissionContext, canDeleteBoard, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { createServices } from "@/services";

const SHOT = "data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73vw==";

function report(patch: Partial<BugReportInput> = {}): BugReportInput {
  return { category: "looks-wrong", description: "The Save button overlaps the footer\nOn the settings page, at 1280 wide.", screenshots: [SHOT], pageUrl: "http://localhost:3000/workspace/rmit/settings?section=tickets", appVersion: "0.52.0", userAgent: "Test", viewport: "1280 × 800", ...patch };
}

async function setup(name: string) {
  const services = createServices(createLocalRepositories({ databaseName: `bug-reports-${name}-${Date.now()}` }));
  await services.repos.admin.resetToSeed();
  return services;
}

describe("bug reports", () => {
  it("files a member's report as a task in Bugs on a private App development board only its keeper belongs to", async () => {
    const services = await setup("first");
    const counterBefore = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.ticketCounter;
    const receipt = await services.bugReports.file(SEED_WORKSPACE_ID, report(), SEED_USER_IDS.emily);
    // A ticket of its own series, and the workspace's own series untouched.
    expect(receipt.ticket).toBe("BUG_001");

    const workspace = await services.repos.workspaces.getById(SEED_WORKSPACE_ID);
    expect(workspace!.ticketCounter).toBe(counterBefore);
    const board = (await services.repos.boards.getById(workspace!.bugBoardId!))!;
    expect(board.name).toBe(BUG_BOARD.name);
    expect(board.system).toBe("APP_DEVELOPMENT");
    expect(board.visibility).toBe("PRIVATE");
    // Nobody in the demo has the keeper's address, so the workspace owner keeps it.
    expect(board.ownerId).toBe(SEED_USER_IDS.danh);
    expect((await services.repos.boards.listMembers(board.id)).map((m) => m.userId)).toEqual([SEED_USER_IDS.danh]);

    const groups = await services.repos.boards.listGroups(board.id);
    const item = (await services.repos.items.getById(receipt.itemId))!;
    expect(groups.find((g) => g.id === item.groupId)?.name).toBe("Bugs");
    expect(item.name).toBe("The Save button overlaps the footer");

    const columns = await services.repos.boards.listColumns(board.id);
    const values = new Map((await services.repos.items.listValuesByBoard(board.id)).filter((v) => v.itemId === item.id).map((v) => [columns.find((c) => c.id === v.columnId)!.name, v.value]));
    expect(values.get("Category")).toEqual({ type: "DROPDOWN", labelId: "looks-wrong" });
    expect(values.get("Reported by")).toEqual({ type: "REQUESTER", userIds: [SEED_USER_IDS.emily] });
    expect(values.get("PIC")).toEqual({ type: "PERSON", userIds: [SEED_USER_IDS.danh] });
    expect(values.get("Screenshot")).toEqual({ type: "LINK", url: SHOT, text: "Screenshot 1" });
    expect(values.has("Screenshot 2")).toBe(false);
    expect(values.get("Page")).toEqual({ type: "LINK", url: "http://localhost:3000/workspace/rmit/settings?section=tickets", text: "/workspace/rmit/settings?section=tickets" });
    expect(values.get("Version")).toEqual({ type: "TEXT", text: "0.52.0" });
    expect(values.get("Status")).toEqual({ type: "STATUS", labelId: "new" });
    const brief = values.get("Brief");
    expect(brief?.type === "RICH_TEXT" && brief.text).toContain("## What happened\nThe Save button overlaps the footer");
    expect(brief?.type === "RICH_TEXT" && brief.text).toContain("**Category:** Looks wrong");

    // The special columns every board holds are there, the ones a bug has no use for hidden.
    expect(columns.find((c) => c.type === "SIZE")?.hidden).toBe(true);
    expect(columns.find((c) => c.type === "BRIEF")?.hidden ?? false).toBe(false);

    const told = await services.repos.notifications.listByUser(SEED_USER_IDS.danh);
    expect(item.ticket).toBe("BUG_001");
    expect(told.some((n) => n.entityId === item.id && n.title.startsWith("Emily reported BUG_001"))).toBe(true);
  });

  it("keeps using the board, which the app will not archive or delete, and makes it again if it goes by hand", async () => {
    const services = await setup("again");
    await services.bugReports.file(SEED_WORKSPACE_ID, report(), SEED_USER_IDS.emily);
    const first = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bugBoardId!;
    await services.bugReports.file(SEED_WORKSPACE_ID, report({ description: "Second" }), SEED_USER_IDS.jun);
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bugBoardId).toBe(first);
    expect((await services.repos.items.listByBoard(first)).map((i) => i.name).sort()).toEqual(["Second", "The Save button overlaps the footer"]);

    await expect(services.boards.archiveBoard(first, SEED_USER_IDS.danh)).rejects.toThrow(/built in/);
    await expect(services.boards.deleteBoard(first)).rejects.toThrow(/built in/);
    await expect(services.boards.updateBoard(first, { visibility: "WORKSPACE" }, SEED_USER_IDS.danh)).rejects.toThrow(/built in/);

    await services.repos.boards.delete(first);
    await services.bugReports.file(SEED_WORKSPACE_ID, report({ description: "Third" }), SEED_USER_IDS.jun);
    const second = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => b.system === "APP_DEVELOPMENT")!;
    expect(second.id).not.toBe(first);
    expect((await services.repos.items.listByBoard(second.id)).map((i) => i.name)).toEqual(["Third"]);
  });

  it("adopts the plain board v0.52.0 made rather than making a second", async () => {
    const services = await setup("adopt");
    const { board } = await services.boards.createBoard({ workspaceId: SEED_WORKSPACE_ID, name: BUG_BOARD.name, teamId: null, visibility: "PRIVATE", templateId: "blank" }, SEED_USER_IDS.danh);
    await services.repos.workspaces.update(SEED_WORKSPACE_ID, { bugBoardId: board.id });
    await services.bugReports.file(SEED_WORKSPACE_ID, report(), SEED_USER_IDS.emily);
    expect((await services.repos.boards.getById(board.id))?.system).toBe("APP_DEVELOPMENT");
    expect((await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.name === BUG_BOARD.name)).toHaveLength(1);
  });

  it("is its members' alone: an admin who is not on it can neither see, manage nor delete it", async () => {
    const services = await setup("access");
    await services.bugReports.file(SEED_WORKSPACE_ID, report(), SEED_USER_IDS.jun);
    const [members, teamMembers, boardMembers, boards] = await Promise.all([
      services.repos.workspaces.listMembers(SEED_WORKSPACE_ID),
      services.repos.teams.listMembersByWorkspace(SEED_WORKSPACE_ID),
      services.repos.boards.listMembersByWorkspace(SEED_WORKSPACE_ID),
      services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID),
    ]);
    const as = (userId: string) => buildPermissionContext({ userId, workspaceMembers: members, teamMembers, boardMembers });
    const bugs = boards.find((b) => b.system === "APP_DEVELOPMENT")!;
    const allocation = boards.find((b) => b.system === "TASK_ALLOCATION")!;

    // Danh owns it; Emily is a workspace admin; Jun is a member who filed into it.
    expect([canViewBoard(as(SEED_USER_IDS.danh), bugs), canManageBoard(as(SEED_USER_IDS.danh), bugs), canDeleteBoard(as(SEED_USER_IDS.danh), bugs)]).toEqual([true, true, true]);
    expect([canViewBoard(as(SEED_USER_IDS.emily), bugs), canManageBoard(as(SEED_USER_IDS.emily), bugs), canDeleteBoard(as(SEED_USER_IDS.emily), bugs)]).toEqual([false, false, false]);
    expect(canViewBoard(as(SEED_USER_IDS.jun), bugs)).toBe(false);

    // A seat opens it, admin or not, and running it stays the owner's; Task Allocation stays the admins'.
    await services.repos.boards.setMember(bugs.id, SEED_USER_IDS.emily, "EDITOR");
    const seated = buildPermissionContext({ userId: SEED_USER_IDS.emily, workspaceMembers: members, teamMembers, boardMembers: await services.repos.boards.listMembersByWorkspace(SEED_WORKSPACE_ID) });
    expect([canViewBoard(seated, bugs), canManageBoard(seated, bugs)]).toEqual([true, false]);
    expect([canViewBoard(as(SEED_USER_IDS.emily), allocation), canViewBoard(as(SEED_USER_IDS.jun), allocation)]).toEqual([true, false]);
  });

  it("gives the board to whoever has the keeper's address", async () => {
    const services = await setup("keeper");
    await services.repos.users.update(SEED_USER_IDS.jun, { email: BUG_BOARD_OWNER_EMAIL });
    const receipt = await services.bugReports.file(SEED_WORKSPACE_ID, report(), SEED_USER_IDS.emily);
    const board = (await services.repos.boards.getById((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bugBoardId!))!;
    expect(board.ownerId).toBe(SEED_USER_IDS.jun);
    expect((await services.repos.boards.listMembers(board.id)).map((m) => m.userId)).toEqual([SEED_USER_IDS.jun]);
    const columns = await services.repos.boards.listColumns(board.id);
    const pic = columns.find((c) => c.type === "PERSON")!;
    const value = (await services.repos.items.listValuesByBoard(board.id)).find((v) => v.itemId === receipt.itemId && v.columnId === pic.id);
    expect(value?.value).toEqual({ type: "PERSON", userIds: [SEED_USER_IDS.jun] });
  });

  it("refuses an empty report, a screenshot that is not an image, and somebody outside the workspace", async () => {
    const services = await setup("refused");
    await expect(services.bugReports.file(SEED_WORKSPACE_ID, report({ description: "   " }), SEED_USER_IDS.emily)).rejects.toThrow(/what happened/i);
    await expect(services.bugReports.file(SEED_WORKSPACE_ID, report({ screenshots: ["javascript:alert(1)"] }), SEED_USER_IDS.emily)).rejects.toThrow(/uploaded image/i);
    await expect(services.bugReports.file(SEED_WORKSPACE_ID, report(), "nobody")).rejects.toThrow(/only members/i);
    expect((await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!.bugBoardId ?? null).toBeNull();
  });

  it("numbers bugs in their own series, which a prefix change leaves alone", async () => {
    const services = await setup("tickets");
    const tickets = [];
    for (const description of ["One", "Two", "Three"]) tickets.push((await services.bugReports.file(SEED_WORKSPACE_ID, report({ description }), SEED_USER_IDS.jun)).ticket);
    expect(tickets).toEqual(["BUG_001", "BUG_002", "BUG_003"]);

    await services.tickets.setPrefix(SEED_WORKSPACE_ID, "PROD", { rewriteExisting: true });
    const board = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => b.system === "APP_DEVELOPMENT")!;
    expect((await services.repos.items.listByBoard(board.id)).map((i) => i.ticket).sort()).toEqual(["BUG_001", "BUG_002", "BUG_003"]);
    await expect(services.tickets.setPrefix(SEED_WORKSPACE_ID, "bug", { rewriteExisting: false })).rejects.toThrow(/bug reports/i);

    // A bug that lost its ticket gets the next bug one back, not a booking's.
    const bug = (await services.repos.items.listByBoard(board.id)).find((i) => i.name === "Two")!;
    await services.tickets.setTicket(SEED_WORKSPACE_ID, bug.id, null, SEED_USER_IDS.danh);
    expect((await services.tickets.assign(SEED_WORKSPACE_ID, bug.id, SEED_USER_IDS.danh)).ticket).toBe("BUG_004");
  });

  it("names the task after the first line written", () => {
    expect(bugReportTitle("\n\n  Kanban   lane  is empty \nmore")).toBe("Kanban lane is empty");
    expect(bugReportTitle("   ")).toBe("Bug report");
    expect(bugReportTitle("x".repeat(200))).toHaveLength(90);
  });
});
