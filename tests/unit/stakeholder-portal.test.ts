import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { EVERY_PORTAL_RANGE } from "@/domain";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices, PortalAccessError, type Services } from "@/services";
import type { PortalViewer } from "@/services";

let counter = 0;
const WS = SEED_WORKSPACE_ID;
const BOARD = SEED_BOARD_IDS.rmitinerary;

/** A member with an editor's seat on the board, and one signed in to nothing. */
const MEMBER: PortalViewer = { userId: SEED_USER_IDS.danh, displayName: "Danh", isWorkspaceMember: true };
const OUTSIDER: PortalViewer = { userId: "someone-else", displayName: "Nobody", isWorkspaceMember: false };

describe("the stakeholder portal", () => {
  let services: Services;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `portal-${Date.now()}-${counter}` }));
  });

  /** The filter the selector sets: one stakeholder, every year. */
  const forOne = (departmentId: string) => ({ stakeholderId: departmentId, range: EVERY_PORTAL_RANGE });

  /** The workspace's portal, live, with two stakeholders and a request each. */
  async function twoDepartments() {
    const departments = await services.portals.ensureDepartments(WS);
    const [first, second] = departments;
    expect(first && second).toBeTruthy();

    const items = (await services.repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === null);
    const [itemA, itemB] = items;
    expect(itemA && itemB).toBeTruthy();

    await services.portals.associate({ workspaceId: WS, departmentId: first!.id, itemId: itemA!.id, source: "PORTAL_BOOKING", publicBrief: "First brief" });
    await services.portals.associate({ workspaceId: WS, departmentId: second!.id, itemId: itemB!.id, source: "PORTAL_BOOKING", publicBrief: "Second brief" });

    const portal = await services.portals.setEnabled(WS, true);
    return { first: first!, second: second!, portal, itemA: itemA!, itemB: itemB! };
  }

  // ---- identity ------------------------------------------------------------

  it("materialises a department for each stakeholder group, and one portal, shut", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    expect(departments.length).toBeGreaterThan(0);
    expect(departments.map((d) => d.name)).toContain("Comm.");
    const overview = await services.portals.overview(WS);
    // The stakeholders exist; the portal exists and is shut, and nothing is
    // published until somebody deliberately opens it.
    expect(overview.departments.map((row) => row.department.name)).toContain("Comm.");
    expect(overview.portal.departmentId).toBeNull();
    expect(overview.portal.enabled).toBe(false);
  });

  // Portal and Booking shows every member the two links, read-only. Their copy
  // is read through migration 0118 in production, which leaves the hash out.
  it("gives a member the link and its settings, but no password hash and no counts", async () => {
    expect(await services.portals.memberOverview(WS)).toBeNull();
    const { portal } = await twoDepartments();
    await services.portals.setPassword(WS, "let me in");

    const member = await services.portals.memberOverview(WS);
    expect(member).not.toBeNull();
    expect(member!.readOnly).toBe(true);
    expect(member!.portal.token).toBe(portal.token);
    expect(member!.portal.passwordHash).toBeNull();
    expect(member!.hasPassword).toBe(true);
    expect(member!.departments.length).toBeGreaterThan(1);
    expect(member!.departments.every((row) => row.requests === 0)).toBe(true);

    const admin = await services.portals.overview(WS);
    expect(admin.readOnly).toBe(false);
    expect(admin.hasPassword).toBe(true);
    expect(admin.departments.some((row) => row.requests > 0)).toBe(true);
  });

  // Home's two links: the token and which doors serve, nothing else.
  it("gives Home the token and whether each link is serving", async () => {
    expect(await services.portals.links(WS)).toBeNull();
    const { portal } = await twoDepartments();
    const links = await services.portals.links(WS);
    expect(links).toEqual({ token: portal.token, enabled: portal.enabled, allowBooking: portal.allowBooking });
    await services.portals.setEnabled(WS, !portal.enabled);
    expect((await services.portals.links(WS))!.enabled).toBe(!portal.enabled);
  });

  it("keeps the stakeholder and its requests through a rename, and the link still opens", async () => {
    const { first, portal } = await twoDepartments();
    const lists = await services.lists.lists(WS);
    const renamed = lists.STAKEHOLDER_GROUPS.map((o) => (o.name === first.name ? { ...o, name: "Communications" } : o));
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", renamed, { [first.name]: "Communications" });

    const after = await services.repos.stakeholderPortals.getDepartment(first.id);
    expect(after?.name).toBe("Communications");
    expect(after?.status).toBe("ACTIVE");
    const gate = await services.portals.gate(portal.token);
    expect(gate.open).toBe(true);
    // The link belongs to the team, not to the stakeholder, so a rename does
    // not touch it — and the requests stay attached to the same stakeholder.
    expect(gate.portalName).toBeTruthy();
    expect(await services.repos.stakeholderPortals.countRequests(first.id)).toBe(1);
  });

  it("retires a stakeholder when its group leaves the list, without losing the requests or the link", async () => {
    const { first, portal, itemA } = await twoDepartments();
    const lists = await services.lists.lists(WS);
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", lists.STAKEHOLDER_GROUPS.filter((o) => o.name !== first.name));

    const after = await services.repos.stakeholderPortals.getDepartment(first.id);
    expect(after?.status).toBe("DISABLED");
    // The provenance stays attached: a stakeholder leaving the list is not a
    // reason to forget who asked for what.
    expect(await services.repos.stakeholderPortals.countRequests(first.id)).toBe(1);

    // The link belongs to the team, so it keeps opening — it is the one portal
    // for every other stakeholder too. What goes is the retired stakeholder's
    // place in the selector.
    expect((await services.portals.gate(portal.token)).open).toBe(true);
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const context = await services.portals.context(resolved, null);
    expect(context.stakeholders.map((s) => s.id)).not.toContain(first.id);
    // And its work is no longer claimed by it.
    const page = await services.portals.tasks(resolved);
    expect(page.tasks.find((t) => t.id === itemA.id)?.stakeholder).toBeNull();
  });

  it("never leaves a removed department on its tasks: they move to another or are cleared", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    const [gone, kept, cleared] = departments;
    const boards = await services.repos.boards.listByWorkspace(WS);
    let column = null;
    for (const board of boards) {
      column = (await services.repos.boards.listColumns(board.id)).find((c) => c.type === "STAKEHOLDER") ?? null;
      if (column) break;
    }
    expect(column).toBeTruthy();
    const [itemA, itemB] = (await services.repos.items.listByBoard(column!.boardId)).filter((i) => i.parentItemId === null);
    await services.repos.items.setValue(itemA!.id, column!.id, { type: "STAKEHOLDER", group: gone!.name });
    await services.repos.items.setValue(itemB!.id, column!.id, { type: "STAKEHOLDER", group: cleared!.name });
    const groupOf = async (itemId: string) => {
      const value = (await services.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === column!.id)?.value;
      return value?.type === "STAKEHOLDER" ? value.group : null;
    };

    await services.lists.remove(WS, "STAKEHOLDER_GROUPS", gone!.name, { replaceWith: kept!.name });
    expect(await groupOf(itemA!.id)).toBe(kept!.name);

    // No "keep it on them" for a department: asked for nothing, the tasks let it go.
    await services.lists.remove(WS, "STAKEHOLDER_GROUPS", cleared!.name);
    expect(await groupOf(itemB!.id)).toBeNull();
  });

  it("gives a re-added group a fresh department rather than the old one's history", async () => {
    const { first } = await twoDepartments();
    const lists = await services.lists.lists(WS);
    const without = lists.STAKEHOLDER_GROUPS.filter((o) => o.name !== first.name);
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", without);
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", [...without, { name: first.name, color: "blue" }]);

    const all = await services.repos.stakeholderPortals.listDepartments(WS, { includeDisabled: true });
    const sameName = all.filter((d) => d.name === first.name);
    expect(sameName).toHaveLength(2);
    const fresh = sameName.find((d) => d.status === "ACTIVE")!;
    expect(fresh.id).not.toBe(first.id);
    // The newcomer inherits nothing: no requests, and no link.
    expect(await services.repos.stakeholderPortals.countRequests(fresh.id)).toBe(0);
    expect(await services.repos.stakeholderPortals.getPortalByDepartment(fresh.id)).toBeNull();
  });

  // ---- the gate -------------------------------------------------------------

  it("refuses an unknown token the same way it refuses a closed one", async () => {
    const { portal } = await twoDepartments();
    await services.portals.setEnabled(WS, false);

    const closed = await services.portals.gate(portal.token);
    const nonsense = await services.portals.gate("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    // Neither reply names anything, so the shape cannot be used to discover a
    // workspace, a team or a stakeholder.
    expect(closed.open).toBe(false);
    expect(nonsense.open).toBe(false);
    expect(closed.portalName).toBe("");
    expect(nonsense.portalName).toBe("");
  });

  it("tells the booking link whether it takes requests, with the team's own words when it does not", async () => {
    const { portal } = await twoDepartments();
    expect(await services.portals.gate(portal.token)).toMatchObject({ open: true, bookingOpen: true, bookingClosedMessage: null });

    await services.portals.setPresentation(WS, { allowBooking: false });
    expect(await services.portals.gate(portal.token)).toMatchObject({ open: true, bookingOpen: false, bookingClosedMessage: null });

    // Stored trimmed, as the rich text markup it was written in; blank is the built-in words.
    await services.portals.setPresentation(WS, { bookingClosedHeading: "  Closed for the break  ", bookingClosedMessage: "  **Back on 6 January.**\n- Urgent? Call ext 1234.  " });
    expect(await services.portals.gate(portal.token)).toMatchObject({ bookingClosedHeading: "Closed for the break", bookingClosedMessage: "**Back on 6 January.**\n- Urgent? Call ext 1234." });
    // A heading is cut to its limit; markup too long is refused whole, since a cut could end inside a link.
    await services.portals.setPresentation(WS, { bookingClosedHeading: "h".repeat(120) });
    expect((await services.portals.gate(portal.token)).bookingClosedHeading).toHaveLength(80);
    await expect(services.portals.setPresentation(WS, { bookingClosedMessage: "x".repeat(2001) })).rejects.toThrow(/at most 2000 characters/);
    expect((await services.portals.gate(portal.token)).bookingClosedMessage).toBe("**Back on 6 January.**\n- Urgent? Call ext 1234.");
    await services.portals.setPresentation(WS, { bookingClosedHeading: " ", bookingClosedMessage: "   " });
    expect(await services.portals.gate(portal.token)).toMatchObject({ bookingClosedHeading: null, bookingClosedMessage: null });
  });

  it("a closed portal's booking link still carries the message, and nothing else about the workspace", async () => {
    const { portal } = await twoDepartments();
    await services.portals.setPresentation(WS, { bookingClosedHeading: "See you in January", bookingClosedMessage: "Closed over the break.", bookingTheme: "dark" });
    await services.portals.setEnabled(WS, false);

    const closed = await services.portals.gate(portal.token);
    expect(closed).toMatchObject({ open: false, refusal: "off", bookingOpen: false, bookingClosedHeading: "See you in January", bookingClosedMessage: "Closed over the break.", bookingTheme: "dark", portalName: "", creativeTeamName: "" });
    // A token that names nothing gets no message.
    expect(await services.portals.gate("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toMatchObject({ open: false, bookingClosedMessage: null });
  });

  it("asks for the password on every call, not just the landing page", async () => {
    const { portal } = await twoDepartments();
    await services.portals.setPassword(WS, "let me in");
    const current = (await services.repos.stakeholderPortals.getUnifiedPortal(WS))!;

    await expect(services.portals.resolve({ token: current.token, password: null })).rejects.toMatchObject({ reason: "password" });
    await expect(services.portals.resolve({ token: current.token, password: "wrong" })).rejects.toMatchObject({ reason: "password" });
    const resolved = await services.portals.resolve({ token: current.token, password: "let me in" });
    expect(resolved.portal.id).toBe(current.id);
    expect(current.token).toBe(portal.token); // setting a password does not move the link
  });

  it("kills an open tab's grant when the link is regenerated", async () => {
    const { portal } = await twoDepartments();
    const held = { token: portal.token, password: null, credentialVersion: portal.credentialVersion };
    expect(await services.portals.resolve(held)).toBeTruthy();

    const regenerated = await services.portals.regenerateLink(WS);
    expect(regenerated.token).not.toBe(portal.token);
    // The old address is gone, and so is the grant issued under it.
    await expect(services.portals.resolve(held)).rejects.toMatchObject({ reason: "unknown" });
    await expect(services.portals.resolve({ token: regenerated.token, password: null, credentialVersion: portal.credentialVersion })).rejects.toMatchObject({ reason: "revoked" });
    expect(await services.portals.resolve({ token: regenerated.token, password: null, credentialVersion: regenerated.credentialVersion })).toBeTruthy();
  });

  it("kills previous grants when the password changes", async () => {
    const { portal } = await twoDepartments();
    await services.portals.setPassword(WS, "first");
    const withPassword = (await services.repos.stakeholderPortals.getUnifiedPortal(WS))!;
    await services.portals.setPassword(WS, "second");

    await expect(
      services.portals.resolve({ token: portal.token, password: "first", credentialVersion: withPassword.credentialVersion }),
    ).rejects.toMatchObject({ reason: "revoked" });
  });

  // ---- isolation -------------------------------------------------------------

  it("shows one stakeholder only their own requests, and everybody's together", async () => {
    const { first, second, portal, itemA, itemB } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const a = await services.portals.tasks(resolved, { scope: forOne(first.id) });
    const b = await services.portals.tasks(resolved, { scope: forOne(second.id) });
    const all = await services.portals.tasks(resolved);

    expect(a.tasks.map((t) => t.id)).toEqual([itemA.id]);
    expect(b.tasks.map((t) => t.id)).toEqual([itemB.id]);
    expect(a.totals.requests).toBe(1);
    // The full creative team is both of them at once, which is what the portal
    // opens on before anybody narrows it.
    expect(all.tasks.map((t) => t.id).sort()).toEqual([itemA.id, itemB.id].sort());
  });

  it("offers the teams whose boards hold the work, and narrows to one of them", async () => {
    const { portal, itemA, itemB } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const board = await services.repos.boards.getById(BOARD);
    expect(board?.teamId).toBeTruthy();

    const context = await services.portals.context(resolved, null);
    const team = context.teams.find((row) => row.id === board!.teamId);
    expect(team).toBeTruthy();
    expect(team!.count).toBeGreaterThanOrEqual(2);
    expect(context.teamId).toBeNull();
    // Task Allocation's team (the admin team) is never one of them.
    const teams = await services.repos.teams.listByWorkspace(WS);
    const system = new Set(teams.filter((row) => row.system).map((row) => row.id));
    expect(context.teams.some((row) => system.has(row.id))).toBe(false);

    const mine = await services.portals.tasks(resolved, { scope: { stakeholderId: null, teamId: board!.teamId, range: EVERY_PORTAL_RANGE } });
    expect(mine.tasks.map((t) => t.id)).toEqual(expect.arrayContaining([itemA.id, itemB.id]));
    const other = teams.find((row) => !row.system && row.id !== board!.teamId);
    const none = await services.portals.tasks(resolved, { scope: { stakeholderId: null, teamId: other?.id ?? "no-such-team", range: EVERY_PORTAL_RANGE } });
    expect(none.tasks.map((t) => t.id)).not.toContain(itemA.id);
    // An unknown team narrows to nothing rather than widening.
    const unknown = await services.portals.tasks(resolved, { scope: { stakeholderId: null, teamId: "00000000-0000-4000-8000-00000000dead", range: EVERY_PORTAL_RANGE } });
    expect(unknown.tasks).toHaveLength(0);
  });

  it("names the stakeholder on every row, so one list of everybody reads", async () => {
    const { first, second, portal, itemA, itemB } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const page = await services.portals.tasks(resolved);
    const byId = new Map(page.tasks.map((task) => [task.id, task.stakeholder?.name ?? null]));
    expect(byId.get(itemA.id)).toBe(first.name);
    expect(byId.get(itemB.id)).toBe(second.name);
  });

  it("refuses an id that belongs to nothing the link may see", async () => {
    const { portal } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    await expect(services.portals.task(resolved, "00000000-0000-4000-8000-00000000ffff", null)).rejects.toBeInstanceOf(PortalAccessError);
  });

  it("never publishes an item that has no provenance, however public the board", async () => {
    const { portal } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const published = new Set((await services.portals.tasks(resolved)).tasks.map((t) => t.id));
    const everything = await services.repos.items.listByBoard(BOARD);
    const unpublished = everything.find((i) => i.parentItemId === null && !published.has(i.id))!;
    expect(unpublished).toBeTruthy();
    await expect(services.portals.task(resolved, unpublished.id, null)).rejects.toBeInstanceOf(PortalAccessError);
  });

  // ---- the payload ------------------------------------------------------------

  it("publishes the requester's brief and never the item's description", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    const item = (await services.repos.items.listByBoard(BOARD)).find((i) => i.parentItemId === null)!;
    // A description shaped like the booking writer's: brief plus contact details.
    await services.repos.items.update(item.id, { description: "The brief.\n\nRequest details\nEmail: someone@rmit.edu.vn" });
    await services.portals.associate({ workspaceId: WS, departmentId: departments[0]!.id, itemId: item.id, source: "PORTAL_BOOKING", publicBrief: "The brief." });
    const portal = await services.portals.setEnabled(WS, true);

    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const detail = await services.portals.task(resolved, item.id, null);
    expect(detail.brief).toBe("The brief.");
    const serialised = JSON.stringify(detail);
    expect(serialised).not.toContain("someone@rmit.edu.vn");
    expect(serialised).not.toContain("Request details");
  });

  it("hands a visitor no email addresses anywhere in the page payload", async () => {
    const { portal } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const page = await services.portals.tasks(resolved);
    expect(JSON.stringify(page)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  // ---- who may write -----------------------------------------------------------

  it("lets nobody write without a session, a membership and a seat on the board", async () => {
    const { portal, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });

    expect(await services.portals.canAct(resolved, itemA.id, null)).toBe(false);
    expect(await services.portals.canAct(resolved, itemA.id, OUTSIDER)).toBe(false);
    // A workspace admin who owns or edits the board may act on that concrete task.
    expect(await services.portals.canAct(resolved, itemA.id, MEMBER)).toBe(true);
  });

  it("does not let a valid link confer any write at all", async () => {
    const { portal, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const detail = await services.portals.task(resolved, itemA.id, null);
    expect(detail.canAct).toBe(false);
  });

  // ---- totals and paging ---------------------------------------------------------

  it("counts over the whole department, not the page in front of you", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    const department = departments[0]!;
    const items = (await services.repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === null).slice(0, 8);
    for (const item of items) {
      await services.portals.associate({ workspaceId: WS, departmentId: department.id, itemId: item.id, source: "IMPORT", publicBrief: null });
    }
    const portal = await services.portals.setEnabled(WS, true);
    const resolved = await services.portals.resolve({ token: portal.token, password: null });

    const page = await services.portals.tasks(resolved, { limit: 3 });
    expect(page.tasks).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
    // The figures describe all eight, not the three on screen.
    expect(page.totals.requests).toBe(items.length);

    const second = await services.portals.tasks(resolved, { limit: 3, cursor: page.nextCursor });
    expect(second.tasks).toHaveLength(3);
    expect(second.tasks.map((t) => t.id)).not.toEqual(page.tasks.map((t) => t.id));
    expect(second.totals.requests).toBe(items.length);
  });

  it("searches titles, briefs and booking codes, and nothing internal", async () => {
    const { first, portal, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const mine = { scope: forOne(first.id) };

    expect((await services.portals.tasks(resolved, { ...mine, search: itemA.name.slice(0, 6) })).tasks).toHaveLength(1);
    expect((await services.portals.tasks(resolved, { ...mine, search: "First brief" })).tasks).toHaveLength(1);
    expect((await services.portals.tasks(resolved, { ...mine, search: "certainly-not-present" })).tasks).toHaveLength(0);
    if (itemA.ticket) {
      expect((await services.portals.tasks(resolved, { ...mine, search: itemA.ticket })).tasks).toHaveLength(1);
    }
  });
});
