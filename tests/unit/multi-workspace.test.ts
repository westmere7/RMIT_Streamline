import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BoardColumn, EntityId } from "@/domain";
import { buildPermissionContext, canManageMember, canManageWorkspaces, canUseSnapshots, isOwner, isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { createServices, type Services } from "@/services";
import { checkShareAccess, ShareAccessError } from "@/services/board-share-service";

/**
 * Several workspaces in one database: one directory of people, departments
 * shared, everything else a workspace's own, and Owners above them all. Run
 * against the local provider, which enforces the same rules as the database
 * (supabase/migrations/0089_multi_workspace.sql); the database's own copy is
 * checked by scripts/mw-rls-check.mjs on a disposable stack.
 */

let counter = 0;
function fresh() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `multi-workspace-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const A = SEED_WORKSPACE_ID;
const { danh, admin, emily, jun, ben, anh } = SEED_USER_IDS;

async function second(services: Services, name = "Second Office"): Promise<EntityId> {
  return (await services.workspace.createWorkspace({ name }, danh, A)).id;
}

async function memberIn(services: Services, workspaceId: EntityId, userId: EntityId) {
  return (await services.repos.workspaces.listMembers(workspaceId)).find((m) => m.userId === userId) ?? null;
}

async function departmentColumn(services: Services, boardId: EntityId): Promise<BoardColumn> {
  const existing = (await services.repos.boards.listColumns(boardId)).find((c) => c.type === "STAKEHOLDER");
  return existing ?? services.boards.addColumn({ boardId, name: "Department", type: "STAKEHOLDER" });
}

describe("Owners", () => {
  it("are the people with an active OWNER seat before there were several workspaces", async () => {
    const { services } = fresh();
    expect((await services.workspace.listOwners()).sort()).toEqual([admin, danh].sort());
  });

  it("are seated as OWNER in a workspace from the moment it exists", async () => {
    const { services } = fresh();
    const b = await second(services);
    for (const owner of [danh, admin]) expect(await memberIn(services, b, owner)).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    // Nobody else comes along: access is per workspace.
    expect(await memberIn(services, b, emily)).toBeNull();
  });

  it("can be made only by an Owner, and take a seat in every workspace", async () => {
    const { services } = fresh();
    const b = await second(services);
    await expect(services.workspace.grantOwner(jun, emily)).rejects.toThrow(/Only Owners/);
    await services.workspace.grantOwner(emily, danh);
    expect(await memberIn(services, A, emily)).toMatchObject({ role: "OWNER" });
    expect(await memberIn(services, b, emily)).toMatchObject({ role: "OWNER", status: "ACTIVE" });
  });

  it("stay in every workspace as members once unmade, and the last one stays", async () => {
    const { services } = fresh();
    const b = await second(services);
    await services.workspace.revokeOwner(admin, danh);
    expect(await memberIn(services, A, admin)).toMatchObject({ role: "MEMBER" });
    expect(await memberIn(services, b, admin)).toMatchObject({ role: "MEMBER" });
    await expect(services.workspace.revokeOwner(danh, danh)).rejects.toThrow(/at least one Owner/);
  });

  it("cannot be made of somebody still pending", async () => {
    const { services } = fresh();
    await expect(services.workspace.grantOwner(anh, danh)).rejects.toThrow(/finished onboarding/);
  });

  it("hold a seat nobody else can change: not demoted, deactivated or removed", async () => {
    const { services, repos } = fresh();
    const seat = (await memberIn(services, A, danh))!;
    await expect(services.workspace.changeMemberRole(seat.id, "MEMBER")).rejects.toThrow(/Owner/);
    await expect(repos.workspaces.updateMember(seat.id, { status: "DEACTIVATED" })).rejects.toThrow(/Owner/);
    await expect(repos.workspaces.removeMember(seat.id)).rejects.toThrow(/Owner/);
  });

  it("are the only ones who hold the OWNER role", async () => {
    const { services, repos } = fresh();
    const seat = (await memberIn(services, A, jun))!;
    await expect(services.workspace.changeMemberRole(seat.id, "OWNER")).rejects.toThrow(/Only Owners hold the Owner role/);
    await expect(repos.workspaces.updateMember(seat.id, { role: "OWNER" })).rejects.toThrow(/Only Owners hold the Owner role/);
  });
});

describe("permissions", () => {
  const ctx = (role: "OWNER" | "ADMIN" | "MEMBER") =>
    buildPermissionContext({ userId: "me", workspaceMembers: [{ id: "m", workspaceId: A, userId: "me", role, status: "ACTIVE", joinedAt: "" }], teamMembers: [], boardMembers: [] });

  it("give Owners the workspaces, the Owners and snapshots, and admins neither", () => {
    expect([canManageWorkspaces(ctx("OWNER")), canUseSnapshots(ctx("OWNER")), isOwner(ctx("OWNER"))]).toEqual([true, true, true]);
    expect([canManageWorkspaces(ctx("ADMIN")), canUseSnapshots(ctx("ADMIN")), isOwner(ctx("ADMIN"))]).toEqual([false, false, false]);
    expect(isWorkspaceAdmin(ctx("ADMIN"))).toBe(true);
  });

  it("let an admin manage members but not an Owner's seat", () => {
    expect(canManageMember(ctx("ADMIN"), { role: "MEMBER" })).toBe(true);
    expect(canManageMember(ctx("ADMIN"), { role: "OWNER" })).toBe(false);
    expect(canManageMember(ctx("OWNER"), { role: "OWNER" })).toBe(true);
    expect(canManageMember(ctx("MEMBER"), { role: "MEMBER" })).toBe(false);
  });
});

describe("creating a workspace", () => {
  it("is for Owners only", async () => {
    const { services } = fresh();
    await expect(services.workspace.createWorkspace({ name: "Rogue" }, emily)).rejects.toThrow(/Only Owners/);
  });

  it("makes an address from the name, and refuses one that is taken or malformed", async () => {
    const { services } = fresh();
    const made = await services.workspace.createWorkspace({ name: "Hanoi Office!" }, danh);
    expect(made.slug).toBe("hanoi-office");
    await expect(services.workspace.createWorkspace({ name: "Again", slug: "hanoi-office" }, danh)).rejects.toThrow(/already uses/);
    await expect(services.workspace.createWorkspace({ name: "Bad", slug: "Not OK" }, danh)).rejects.toThrow(/lower-case/);
    // A second one with the same name gets its own address.
    expect((await services.workspace.createWorkspace({ name: "Hanoi Office" }, danh)).slug).not.toBe("hanoi-office");
  });

  it("starts with its own Admin team, Task Allocation board and booking link, and nothing else", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const workspace = await repos.workspaces.getById(b);
    expect(workspace?.bookingKey).toBeTruthy();
    const teams = await repos.teams.listByWorkspace(b);
    expect(teams.map((t) => t.system)).toEqual(["ADMIN"]);
    const boards = await repos.boards.listByWorkspace(b);
    expect(boards.every((board) => board.system !== null)).toBe(true);
    expect(boards.some((board) => board.system === "TASK_ALLOCATION")).toBe(true);
    // The first workspace's own things stay there.
    expect((await repos.boards.listByWorkspace(A)).length).toBeGreaterThan(5);
    expect(await repos.trackers.listByWorkspace(b)).toEqual([]);
  });

  it("shares the departments, and keeps its own asset types", async () => {
    const { services } = fresh();
    await services.lists.save(A, "STAKEHOLDER_GROUPS", [
      { name: "Comm.", color: "blue" },
      { name: "Alumni", color: "green" },
    ]);
    await services.lists.save(A, "ASSET_TYPES", [{ name: "Only in A", color: "red" }]);
    const b = await second(services);
    const lists = await services.lists.lists(b);
    expect(lists.STAKEHOLDER_GROUPS.map((o) => o.name)).toEqual(["Comm.", "Alumni"]);
    expect(lists.ASSET_TYPES.map((o) => o.name)).not.toContain("Only in A");
    // The portal's registry has them too, so a Department cell there is valid.
    expect((await services.portals.departments(b)).map((d) => d.name)).toEqual(expect.arrayContaining(["Comm.", "Alumni"]));
  });
});

describe("the directory: one person, one account", () => {
  it("lets an admin give an existing person access with no new account and no link", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const users = (await repos.users.list()).length;
    const result = await services.workspace.inviteMember({ workspaceId: b, invitedBy: danh, email: "jun@rmit.local", firstName: "Jun", lastName: "Tanaka", jobTitle: null, role: "ADMIN", teamIds: [] });
    expect(result.invitation).toBeNull();
    expect(result.member).toMatchObject({ workspaceId: b, userId: jun, role: "ADMIN", status: "ACTIVE" });
    expect((await repos.users.list()).length).toBe(users);
    // Their seat in the first workspace is as it was.
    expect(await memberIn(services, A, jun)).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
  });

  it("adds a directory person directly, into teams of that workspace only", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const [bTeam] = await repos.teams.listByWorkspace(b);
    await services.workspace.addExistingMember({ workspaceId: b, userId: ben, role: "MEMBER", teamIds: [bTeam!.id, SEED_TEAM_IDS.campaigns] });
    expect(await memberIn(services, b, ben)).toMatchObject({ status: "ACTIVE", role: "MEMBER" });
    const bTeams = (await repos.teams.listMembersByWorkspace(b)).filter((m) => m.userId === ben).map((m) => m.teamId);
    expect(bTeams).toEqual([bTeam!.id]);
    await expect(services.workspace.addExistingMember({ workspaceId: b, userId: ben, role: "MEMBER" })).rejects.toThrow(/already a member/);
  });

  it("gives somebody pending elsewhere a link of their own here, but never direct access", async () => {
    const { services } = fresh();
    const b = await second(services);
    const anhUser = (await services.repos.users.getById(anh))!;
    const result = await services.workspace.inviteMember({ workspaceId: b, invitedBy: danh, email: anhUser.email, firstName: "Anh", lastName: "Pham", jobTitle: null, role: "MEMBER", teamIds: [] });
    expect(result.invitation?.token).toBeTruthy();
    expect(result.member.status).toBe("INVITED");
    // Adding directly (no link) is only for somebody who has joined somewhere.
    await expect(services.workspace.addExistingMember({ workspaceId: b, userId: anh, role: "MEMBER" })).rejects.toThrow(/has been added here already|not finished joining/);
  });

  it("still sends a brand-new person a link", async () => {
    const { services } = fresh();
    const b = await second(services);
    const result = await services.workspace.inviteMember({ workspaceId: b, invitedBy: danh, email: "new.person@rmit.edu.au", firstName: "New", lastName: "Person", jobTitle: null, role: "MEMBER", teamIds: [] });
    expect(result.invitation?.token).toBeTruthy();
    expect(result.member.status).toBe("INVITED");
  });

  it("lists only the workspaces where someone's seat is active, by name", async () => {
    const { services } = fresh();
    const b = await services.workspace.createWorkspace({ name: "Aardvark" }, danh);
    expect((await services.workspace.listWorkspacesForUser(danh)).map((w) => w.id)).toEqual([b.id, A]);
    expect((await services.workspace.listWorkspacesForUser(emily)).map((w) => w.id)).toEqual([A]);
  });
});

describe("access is per workspace", () => {
  it("deactivating in one workspace leaves the account and the other workspace alone", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    await services.workspace.addExistingMember({ workspaceId: b, userId: jun, role: "MEMBER" });
    const seatB = (await memberIn(services, b, jun))!;
    await services.workspace.setMemberActive(seatB.id, jun, false);
    expect((await repos.users.getById(jun))?.deactivatedAt).toBeNull();
    expect(await memberIn(services, A, jun)).toMatchObject({ status: "ACTIVE" });
    expect((await services.workspace.listWorkspacesForUser(jun)).map((w) => w.id)).toEqual([A]);
  });

  it("switches the account off only when its last workspace goes, and back on with any", async () => {
    const { services, repos } = fresh();
    const seat = (await memberIn(services, A, jun))!;
    await services.workspace.setMemberActive(seat.id, jun, false);
    expect((await repos.users.getById(jun))?.deactivatedAt).not.toBeNull();
    const b = await second(services);
    // Joined before, so they come back without a link, and the account with them.
    const result = await services.workspace.inviteMember({ workspaceId: b, invitedBy: danh, email: "jun@rmit.local", firstName: "Jun", lastName: "Tanaka", jobTitle: null, role: "MEMBER", teamIds: [] });
    expect(result.invitation).toBeNull();
    expect((await repos.users.getById(jun))?.deactivatedAt).toBeNull();
  });

  it("keeps an admin of one workspace from resetting the account of someone who uses another", async () => {
    const { services } = fresh();
    const b = await second(services);
    await services.workspace.addExistingMember({ workspaceId: b, userId: jun, role: "MEMBER" });
    // Emily is an admin of A, not an Owner: the link would set Jun's password everywhere.
    await expect(services.workspace.reinitiateMember(A, jun, emily)).rejects.toThrow(/Only an Owner/);
    // An Owner may.
    expect((await services.workspace.reinitiateMember(A, jun, danh)).token).toBeTruthy();
  });

  it("lets an admin reset somebody who is in their workspace alone", async () => {
    const { services } = fresh();
    expect((await services.workspace.reinitiateMember(A, jun, emily)).token).toBeTruthy();
  });
});

describe("departments are one list for every workspace", () => {
  async function labelledIn(services: Services, workspaceId: EntityId, department: string) {
    const bundle = await services.boards.createBoard({ workspaceId, name: `Board ${department}`, teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    const column = await departmentColumn(services, bundle.board.id);
    const item = await services.items.createItem({ boardId: bundle.board.id, groupId: bundle.groups[0]!.id, name: "Task" }, danh);
    await services.repos.items.setValues([{ itemId: item.id, columnId: column.id, value: { type: "STAKEHOLDER", group: department } }]);
    return { itemId: item.id, columnId: column.id };
  }
  async function cell(services: Services, at: { itemId: EntityId; columnId: EntityId }) {
    const value = (await services.repos.items.listValuesByItem(at.itemId)).find((v) => v.columnId === at.columnId)?.value;
    return value?.type === "STAKEHOLDER" ? value.group : undefined;
  }

  it("renames a department everywhere, cells included, from whichever workspace it was changed in", async () => {
    const { services } = fresh();
    const b = await second(services);
    const inB = await labelledIn(services, b, "Comm.");
    const lists = await services.lists.lists(A);
    const renamed = lists.STAKEHOLDER_GROUPS.map((o) => (o.name === "Comm." ? { ...o, name: "Communications" } : o));
    await services.lists.save(A, "STAKEHOLDER_GROUPS", renamed, { "Comm.": "Communications" });
    expect((await services.lists.lists(b)).STAKEHOLDER_GROUPS.map((o) => o.name)).toContain("Communications");
    expect(await cell(services, inB)).toBe("Communications");
  });

  it("counts a department's use across every workspace, and moves them all on removal", async () => {
    const { services } = fresh();
    const b = await second(services);
    const inA = await labelledIn(services, A, "Event");
    const inB = await labelledIn(services, b, "Event");
    const usage = await services.lists.usage(A, "STAKEHOLDER_GROUPS", "Event");
    expect(usage.count).toBeGreaterThanOrEqual(2);
    await services.lists.remove(b, "STAKEHOLDER_GROUPS", "Event", { replaceWith: "Digital" });
    expect(await cell(services, inA)).toBe("Digital");
    expect(await cell(services, inB)).toBe("Digital");
    for (const ws of [A, b]) expect((await services.lists.lists(ws)).STAKEHOLDER_GROUPS.map((o) => o.name)).not.toContain("Event");
  });

  it("leaves each workspace's asset types to itself", async () => {
    const { services } = fresh();
    const b = await second(services);
    const before = (await services.lists.lists(A)).ASSET_TYPES.map((o) => o.name);
    await services.lists.save(b, "ASSET_TYPES", [{ name: "Only in B", color: "red" }]);
    expect((await services.lists.lists(A)).ASSET_TYPES.map((o) => o.name)).toEqual(before);
  });
});

describe("deleting a workspace", () => {
  it("is for Owners, needs the name typed, and takes everything of that workspace with it", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const bundle = await services.boards.createBoard({ workspaceId: b, name: "Doomed", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    await services.items.createItem({ boardId: bundle.board.id, groupId: bundle.groups[0]!.id, name: "Gone" }, danh);
    const boardsInA = (await repos.boards.listByWorkspace(A)).length;
    const usersBefore = (await repos.users.list()).length;

    await expect(services.workspace.deleteWorkspace(b, emily, "Second Office")).rejects.toThrow(/Only Owners/);
    await expect(services.workspace.deleteWorkspace(b, danh, "second office")).rejects.toThrow(/Type the workspace/);
    await services.workspace.deleteWorkspace(b, danh, "Second Office");

    expect(await repos.workspaces.getById(b)).toBeNull();
    expect(await repos.boards.getById(bundle.board.id)).toBeNull();
    expect(await repos.items.listByBoard(bundle.board.id)).toEqual([]);
    expect(await repos.teams.listByWorkspace(b)).toEqual([]);
    expect(await repos.workspaces.listMembers(b)).toEqual([]);
    // The rest is untouched: the other workspace, and the people.
    expect((await repos.boards.listByWorkspace(A)).length).toBe(boardsInA);
    expect((await repos.users.list()).length).toBe(usersBefore);
  });

  it("never takes the last workspace", async () => {
    const { services } = fresh();
    const only = (await services.repos.workspaces.getById(A))!;
    await expect(services.workspace.deleteWorkspace(A, danh, only.name)).rejects.toThrow(/last workspace/);
  });
});

describe("nothing crosses between workspaces", () => {
  it("each workspace's inbox holds its own notifications", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const [boardB] = await repos.boards.listByWorkspace(b);
    const [boardA] = await repos.boards.listByWorkspace(A);
    await repos.notifications.createMany([
      { userId: danh, type: "COMMENT", delivery: "NOTIFICATION", title: "in A", body: null, entityType: "BOARD", entityId: boardA!.id, boardId: boardA!.id, actorId: null },
      { userId: danh, type: "COMMENT", delivery: "NOTIFICATION", title: "in B", body: null, entityType: "BOARD", entityId: boardB!.id, boardId: boardB!.id, actorId: null },
    ]);
    const all = await repos.notifications.listByUser(danh);
    expect(all.find((n) => n.title === "in B")?.workspaceId).toBe(b);
    await repos.notifications.markAllRead(danh, undefined, b);
    const after = await repos.notifications.listByUser(danh);
    expect(after.find((n) => n.title === "in B")?.readAt).not.toBeNull();
    expect(after.find((n) => n.title === "in A")?.readAt).toBeNull();
    await repos.notifications.deleteAll(danh, undefined, b);
    expect((await repos.notifications.listByUser(danh)).some((n) => n.title === "in A")).toBe(true);
    expect((await repos.notifications.listByUser(danh)).some((n) => n.title === "in B")).toBe(false);
  });

  it("an update mentions nobody outside the task's workspace", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const bundle = await services.boards.createBoard({ workspaceId: b, name: "Mentions", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    const item = await services.items.createItem({ boardId: bundle.board.id, groupId: bundle.groups[0]!.id, name: "Task" }, danh);
    // Every profile, as a service-role caller would hand over. Jun is in A only.
    const everyone = await repos.users.list();
    const comment = await services.comments.addComment(item.id, "@Jun Tanaka and @Admin Account", danh, everyone);
    expect(comment.mentionUserIds).toEqual([admin]);
  });

  it("a private share link opens only for members of its own workspace", () => {
    const share = { access: "PRIVATE" } as Parameters<typeof checkShareAccess>[0];
    expect(() => checkShareAccess(share, { userId: jun, isWorkspaceMember: true, workspaceIds: [A] }, A)).not.toThrow();
    expect(() => checkShareAccess(share, { userId: jun, isWorkspaceMember: true, workspaceIds: [A] }, "other-workspace")).toThrow(ShareAccessError);
    expect(() => checkShareAccess(share, null, A)).toThrow(ShareAccessError);
  });

  it("boards, teams and lists of one workspace are not another's", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    await services.boards.createBoard({ workspaceId: b, name: "Only B", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    expect((await repos.boards.listByWorkspace(A)).some((board) => board.name === "Only B")).toBe(false);
    const context = await services.workspace.loadContext(b);
    expect(context.users.map((u) => u.id).sort()).toEqual([admin, danh].sort());
    expect(context.teams.every((team) => team.workspaceId === b)).toBe(true);
  });
});

describe("the Portal and Booking menu entry", () => {
  it("is on until a workspace turns it off, and turning it off there leaves the others alone", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    expect((await repos.workspaces.getById(A))?.showPortalMenu).not.toBe(false);
    await services.workspace.setPortalMenu(b, false);
    expect((await repos.workspaces.getById(b))?.showPortalMenu).toBe(false);
    expect((await repos.workspaces.getById(A))?.showPortalMenu).not.toBe(false);
    await services.workspace.setPortalMenu(b, true);
    expect((await repos.workspaces.getById(b))?.showPortalMenu).toBe(true);
  });
});
