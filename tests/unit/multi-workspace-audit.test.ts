import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { BookingRequest, EntityId } from "@/domain";
import { buildPermissionContext, canDeleteComment, canEditProfile } from "@/lib/permissions/permissions";
import { createServices, type Services } from "@/services";

/**
 * The edge cases the multi-workspace audit turned up, one test each: bookings
 * that must never hand out access, links that must never reset a password
 * twice, and guards that keep teams, boards, rules and templates inside their
 * workspace. Local provider, which mirrors the server's rules.
 */

let counter = 0;
function fresh() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `mw-audit-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const A = SEED_WORKSPACE_ID;
const { danh, emily, jun, anh } = SEED_USER_IDS;

async function second(services: Services, name = "Hanoi Studio"): Promise<{ id: EntityId; slug: string; key: string }> {
  const created = await services.workspace.createWorkspace({ name }, danh, A);
  const again = (await services.repos.workspaces.getById(created.id))!;
  return { id: created.id, slug: again.slug, key: again.bookingKey! };
}

const request = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  requesterName: "Somebody",
  requesterEmail: "somebody@example.com",
  department: "Comm.",
  title: "Open Day posters",
  brief: "",
  assetTypes: [],
  assets: [],
  serviceTypeId: "svc-design",
  subServices: ["Print"],
  teamId: null,
  dueDate: "2026-10-01",
  priority: "High",
  referenceUrl: null,
  answers: {
    "design-what": { kind: "text", text: "Six A1 posters, print ready." },
    "design-specs": { kind: "text", text: "A1 portrait." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  ...overrides,
});

const seatIn = async (services: Services, workspaceId: EntityId, userId: EntityId) => (await services.repos.workspaces.listMembers(workspaceId)).find((m) => m.userId === userId) ?? null;

describe("a booking never hands out access", () => {
  it("leaves a person from another workspace out of this one, and still takes the booking", async () => {
    const { services } = fresh();
    const b = await second(services);
    const receipt = await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ requesterName: "Jun Tanaka", requesterEmail: "jun@rmit.local" }) });
    expect(receipt.ticket).toBeTruthy();
    expect(await seatIn(services, b.id, jun)).toBeNull();
    const values = await services.repos.items.listValuesByItem(receipt.itemId);
    expect(values.some((v) => v.value.type === "REQUESTER" && v.value.userIds.length > 0)).toBe(false);
    // Their seat where they belong is untouched.
    expect(await seatIn(services, A, jun)).toMatchObject({ status: "ACTIVE" });
  });

  it("leaves somebody pending in another workspace alone too", async () => {
    const { services } = fresh();
    const b = await second(services);
    await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ requesterEmail: "anh@rmit.local" }) });
    expect(await seatIn(services, b.id, anh)).toBeNull();
  });

  it("still adds a brand-new requester as a pending member, who gets in nowhere", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ requesterName: "New Person", requesterEmail: "new.person@example.com" }) });
    const user = (await repos.users.getByEmail("new.person@example.com"))!;
    expect(await seatIn(services, b.id, user.id)).toMatchObject({ status: "INVITED" });
    expect(await services.workspace.listWorkspacesForUser(user.id)).toEqual([]);
  });

  it("records a member of the workspace as themselves, as it always has", async () => {
    const { services, repos } = fresh();
    const receipt = await services.booking.submit({ workspaceSlug: "rmit", key: (await repos.workspaces.getById(A))!.bookingKey!, request: request({ requesterEmail: "jun@rmit.local" }) });
    const values = await repos.items.listValuesByItem(receipt.itemId);
    expect(values.some((v) => v.value.type === "REQUESTER" && v.value.userIds.includes(jun))).toBe(true);
  });
});

describe("one person, one password", () => {
  it("lets an admin add somebody pending elsewhere, and the first link finished cancels the other", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    // A stranger books in B and is left pending there.
    await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ requesterName: "Bob Stone", requesterEmail: "bob@example.com" }) });
    const bob = (await repos.users.getByEmail("bob@example.com"))!;
    // A's admin adds Bob for real: allowed, with a link of A's own.
    const added = await services.workspace.inviteMember({ workspaceId: A, invitedBy: emily, email: "bob@example.com", firstName: "Bob", lastName: "Stone", jobTitle: null, role: "MEMBER", teamIds: [] });
    expect(added.invitation?.token).toBeTruthy();
    await services.workspace.completeOnboarding({ token: added.invitation!.token, password: "a long enough password", firstName: "Bob", lastName: "Stone", jobTitle: null });
    expect(await seatIn(services, A, bob.id)).toMatchObject({ status: "ACTIVE" });
    // B's link can no longer set his password, and B's seat is not access.
    expect((await services.workspace.listLiveInvitations(b.id)).has(bob.id)).toBe(false);
    expect(await seatIn(services, b.id, bob.id)).toMatchObject({ status: "INVITED" });
    // B's admin adds him: his pending seat becomes access, with no link.
    const inB = await services.workspace.inviteMember({ workspaceId: b.id, invitedBy: danh, email: "bob@example.com", firstName: "Bob", lastName: "Stone", jobTitle: null, role: "MEMBER", teamIds: [] });
    expect(inB.invitation).toBeNull();
    expect(inB.member).toMatchObject({ workspaceId: b.id, status: "ACTIVE" });
  });

  it("refuses to renew a link for somebody who has joined another workspace", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ requesterEmail: "carol@example.com" }) });
    const carol = (await repos.users.getByEmail("carol@example.com"))!;
    const inA = await services.workspace.inviteMember({ workspaceId: A, invitedBy: emily, email: "carol@example.com", firstName: "Carol", lastName: "Day", jobTitle: null, role: "MEMBER", teamIds: [] });
    await services.workspace.completeOnboarding({ token: inA.invitation!.token, password: "a long enough password", firstName: "Carol", lastName: "Day", jobTitle: null });
    await expect(services.workspace.regenerateInvitation(b.id, carol.id)).rejects.toThrow(/already has an account/);
  });

  it("keeps an admin from resetting somebody who is only deactivated elsewhere", async () => {
    const { services } = fresh();
    const b = await second(services);
    await services.workspace.addExistingMember({ workspaceId: b.id, userId: jun, role: "MEMBER" });
    const seatA = (await seatIn(services, A, jun))!;
    await services.workspace.setMemberActive(seatA.id, jun, false);
    // Jun is DEACTIVATED in A and active in B; B's admins are Owners only here, so use A's admin on B's seat.
    await services.workspace.addExistingMember({ workspaceId: b.id, userId: emily, role: "ADMIN" });
    await expect(services.workspace.reinitiateMember(b.id, jun, emily)).rejects.toThrow(/Only an Owner/);
  });

  it("switches an account back on when its owner finishes joining", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const invited = await services.workspace.inviteMember({ workspaceId: b.id, invitedBy: danh, email: "dora@example.com", firstName: "Dora", lastName: "Lee", jobTitle: null, role: "MEMBER", teamIds: [] });
    await repos.users.update(invited.user.id, { deactivatedAt: new Date().toISOString() });
    await services.workspace.completeOnboarding({ token: invited.invitation!.token, password: "a long enough password", firstName: "Dora", lastName: "Lee", jobTitle: null });
    expect((await repos.users.getById(invited.user.id))?.deactivatedAt).toBeNull();
  });
});

describe("guards that keep things in their workspace", () => {
  it("a team, and a board seat, take only people in the workspace", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const [team] = await repos.teams.listByWorkspace(b.id);
    await expect(services.workspace.addTeamMember(team!.id, jun)).rejects.toThrow(/Only people in this workspace/);
    const bundle = await services.boards.createBoard({ workspaceId: b.id, name: "B board", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    await expect(services.boards.setMember(bundle.board.id, jun, "EDITOR", danh, "Jun")).rejects.toThrow(/Only people in this workspace/);
    await services.workspace.addExistingMember({ workspaceId: b.id, userId: jun, role: "MEMBER" });
    await expect(services.workspace.addTeamMember(team!.id, jun)).resolves.toBeTruthy();
  });

  it("a board's team is one of its own workspace's", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const [teamB] = await repos.teams.listByWorkspace(b.id);
    const boardA = (await repos.boards.listByWorkspace(A)).find((board) => !board.system)!;
    await expect(services.boards.updateBoard(boardA.id, { teamId: teamB!.id }, danh)).rejects.toThrow(/team from this workspace/);
  });

  it("a rule cannot add tasks to another workspace's board, saved or run", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const bundleB = await services.boards.createBoard({ workspaceId: b.id, name: "Target", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, danh);
    const boardA = (await repos.boards.listByWorkspace(A)).find((board) => !board.system)!;
    const columns = await repos.boards.listColumns(boardA.id);
    const groups = await repos.boards.listGroups(boardA.id);
    const vocabulary = { columns, groups, boards: [], users: [] } as never;
    await expect(
      services.automations.create(
        {
          workspaceId: A,
          boardId: boardA.id,
          name: "Leak",
          enabled: true,
          trigger: { kind: "item_created" },
          conditions: [],
          conditionMatch: "all",
          actions: [{ kind: "create_item", boardId: bundleB.board.id, groupId: bundleB.groups[0]!.id, name: "Leaked" }],
          createdBy: danh,
        } as never,
        vocabulary,
      ),
    ).rejects.toThrow(/boards in its own workspace/);
  });

  it("a board template makes boards only in its own workspace", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const boardA = (await repos.boards.listByWorkspace(A)).find((board) => !board.system)!;
    const template = await services.boardTemplates.saveFromBoard(boardA.id, { name: "A layout", description: null, parts: ["groups", "columns"] } as never, danh);
    await expect(services.boardTemplates.createBoard(template.id, { workspaceId: b.id, name: "Copy", teamId: null, visibility: "WORKSPACE" }, danh)).rejects.toThrow(/another workspace/);
  });

  it("an active or deactivated seat must belong to the person named", async () => {
    const { services } = fresh();
    const seat = (await seatIn(services, A, jun))!;
    await expect(services.workspace.setMemberActive(seat.id, emily, false)).rejects.toThrow();
  });
});

describe("each workspace's booking form and intake are its own", () => {
  it("lands a booking in its own workspace's Task Allocation, numbered in its own series", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const keyA = (await repos.workspaces.getById(A))!.bookingKey!;
    expect(b.key).not.toBe(keyA);
    const inB = await services.booking.submit({ workspaceSlug: b.slug, key: b.key, request: request({ title: "Only in B" }) });
    const inA = await services.booking.submit({ workspaceSlug: "rmit", key: keyA, request: request({ title: "Only in A" }) });
    const boardB = await repos.boards.getById(inB.boardId);
    const boardA = await repos.boards.getById(inA.boardId);
    expect(boardB?.workspaceId).toBe(b.id);
    expect(boardB?.system).toBe("TASK_ALLOCATION");
    expect(boardA?.workspaceId).toBe(A);
    expect(inB.boardId).not.toBe(inA.boardId);
    // B's first ticket, whatever A has handed out.
    expect(inB.ticket).toMatch(/_001$/);
    const itemsA = await repos.items.listByBoard(inA.boardId);
    expect(itemsA.some((i) => i.name === "Only in B")).toBe(false);
  });

  it("does not open one workspace's form with another's key", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const keyA = (await repos.workspaces.getById(A))!.bookingKey!;
    await expect(services.booking.submit({ workspaceSlug: b.slug, key: keyA, request: request() })).rejects.toThrow();
  });

  it("keeps each workspace's form and its drafts apart", async () => {
    const { services, repos } = fresh();
    const b = await second(services);
    const formA = await services.booking.getForm({ workspaceSlug: "rmit", key: null });
    const formB = await services.booking.getForm({ workspaceSlug: b.slug, key: null });
    expect(formB.teams.map((t) => t.id).some((id) => formA.teams.some((t) => t.id === id))).toBe(false);
    expect((await repos.workspaces.getById(b.id))?.bookingForm ?? null).toBeNull();
  });
});

describe("comments and profiles belong to their people", () => {
  const ctx = (role: "OWNER" | "ADMIN" | "MEMBER", boardSeats: string[] = []) =>
    buildPermissionContext({
      userId: "me",
      workspaceMembers: [{ id: "m", workspaceId: A, userId: "me", role, status: "ACTIVE", joinedAt: "" }],
      teamMembers: [],
      boardMembers: boardSeats.map((boardId) => ({ id: `bm-${boardId}`, boardId, userId: "me", role: "EDITOR" as const, createdAt: "" })) as never,
    });
  const board = { id: "board-1", ownerId: "someone" };

  it("an update is deleted by its author, or an admin or Owner who is on that board", () => {
    expect(canDeleteComment(ctx("MEMBER"), { authorId: "me" }, board)).toBe(true);
    expect(canDeleteComment(ctx("MEMBER"), { authorId: "other" }, board)).toBe(false);
    expect(canDeleteComment(ctx("ADMIN"), { authorId: "other" }, board)).toBe(false);
    expect(canDeleteComment(ctx("OWNER"), { authorId: "other" }, board)).toBe(false);
    expect(canDeleteComment(ctx("ADMIN", ["board-1"]), { authorId: "other" }, board)).toBe(true);
    expect(canDeleteComment(ctx("OWNER"), { authorId: "other" }, { id: "board-1", ownerId: "me" })).toBe(true);
    expect(canDeleteComment(ctx("MEMBER", ["board-1"]), { authorId: "other" }, board)).toBe(false);
  });

  it("an admin edits somebody's details only until they have joined", async () => {
    expect(canEditProfile(ctx("ADMIN"), { userId: "other", joined: false })).toBe(true);
    expect(canEditProfile(ctx("ADMIN"), { userId: "other", joined: true })).toBe(false);
    expect(canEditProfile(ctx("OWNER"), { userId: "other", joined: true })).toBe(false);
    expect(canEditProfile(ctx("MEMBER"), { userId: "me", joined: true })).toBe(true);
    const { services } = fresh();
    await expect(services.profiles.updateProfile(jun, { jobTitle: "Hijacked" }, emily)).rejects.toThrow(/theirs to change/);
    await expect(services.profiles.updateProfile(jun, { jobTitle: "Producer" }, jun)).resolves.toMatchObject({ jobTitle: "Producer" });
    // Somebody still pending: an admin fills them in.
    await expect(services.profiles.updateProfile(anh, { jobTitle: "Designer" }, emily)).resolves.toMatchObject({ jobTitle: "Designer" });
  });
});

describe("removing somebody completely", () => {
  async function busyPerson(services: Services, repos: ReturnType<typeof fresh>["repos"]) {
    // A new person who joins A and leaves work and history behind.
    const invited = await services.workspace.inviteMember({ workspaceId: A, invitedBy: emily, email: "leaver@example.com", firstName: "Lee", lastName: "Ver", jobTitle: null, role: "MEMBER", teamIds: [] });
    await services.workspace.completeOnboarding({ token: invited.invitation!.token, password: "a long enough password", firstName: "Lee", lastName: "Ver", jobTitle: null });
    const lee = invited.user.id;
    const bundle = await services.boards.createBoard({ workspaceId: A, name: "Lee's board", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, lee);
    const task = await services.items.createItem({ boardId: bundle.board.id, groupId: bundle.groups[0]!.id, name: "Lee's task" }, lee);
    await services.assets.add({ itemId: task.id, boardId: bundle.board.id, name: "Lee's poster", assigneeIds: [lee, jun] }, lee);
    const users = await repos.users.list();
    await services.comments.addComment(task.id, "Lee's update", lee, users);
    return { lee, board: bundle.board, task };
  }

  it("takes their history and account, and hands their work to whoever removes them", async () => {
    const { services, repos } = fresh();
    const { lee, board, task } = await busyPerson(services, repos);
    await expect(services.workspace.removePerson(A, lee, emily, "Lee")).rejects.toThrow(/Type their name/);
    await services.workspace.removePerson(A, lee, emily, "Lee Ver");
    expect(await repos.users.getById(lee)).toBeNull();
    expect(await seatIn(services, A, lee)).toBeNull();
    // Their work stays, now Emily's.
    expect((await repos.boards.getById(board.id))?.ownerId).toBe(emily);
    expect((await repos.items.getById(task.id))?.createdBy).toBe(emily);
    const [poster] = await repos.itemAssets.listByItem(task.id);
    expect(poster).toMatchObject({ name: "Lee's poster", createdBy: emily });
    expect(poster!.assigneeIds).toEqual([jun]);
    // Their history goes.
    expect((await repos.comments.listByItem(task.id)).some((c) => c.body.includes("Lee's update"))).toBe(false);
    expect((await repos.activities.listByBoard(board.id, 100)).some((a) => a.actorId === lee)).toBe(false);
  });

  it("is refused for yourself, an Owner, a member, and an admin reaching into another workspace", async () => {
    const { services } = fresh();
    await expect(services.workspace.removePerson(A, emily, emily, "Emily Carter")).rejects.toThrow(/yourself/);
    await expect(services.workspace.removePerson(A, danh, emily, "Danh Nguyen")).rejects.toThrow(/Owner/);
    await expect(services.workspace.removePerson(A, emily, jun, "Emily Carter")).rejects.toThrow(/Only admins and Owners/);
    const b = await second(services);
    await services.workspace.addExistingMember({ workspaceId: b.id, userId: jun, role: "MEMBER" });
    await expect(services.workspace.removePerson(A, jun, emily, "Jun Tanaka")).rejects.toThrow(/another workspace too/);
    // An Owner may.
    await expect(services.workspace.removePerson(A, jun, danh, "Jun Tanaka")).resolves.toBeUndefined();
  });
});
