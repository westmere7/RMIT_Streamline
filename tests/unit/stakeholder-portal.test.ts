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
    if (itemA.reference) {
      expect((await services.portals.tasks(resolved, { ...mine, search: itemA.reference })).tasks).toHaveLength(1);
    }
  });
});
