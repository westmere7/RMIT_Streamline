import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
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

  /** Two departments, each with a live portal and one request of its own. */
  async function twoDepartments() {
    const departments = await services.portals.ensureDepartments(WS);
    const [first, second] = departments;
    expect(first && second).toBeTruthy();

    const items = (await services.repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === null);
    const [itemA, itemB] = items;
    expect(itemA && itemB).toBeTruthy();

    await services.portals.associate({ workspaceId: WS, departmentId: first!.id, itemId: itemA!.id, source: "PORTAL_BOOKING", publicBrief: "First brief" });
    await services.portals.associate({ workspaceId: WS, departmentId: second!.id, itemId: itemB!.id, source: "PORTAL_BOOKING", publicBrief: "Second brief" });

    const portalA = await services.portals.setEnabled(WS, first!.id, true);
    const portalB = await services.portals.setEnabled(WS, second!.id, true);
    return { first: first!, second: second!, portalA, portalB, itemA: itemA!, itemB: itemB! };
  }

  // ---- identity ------------------------------------------------------------

  it("materialises a department for each stakeholder group, with no portal until asked", async () => {
    const departments = await services.portals.ensureDepartments(WS);
    expect(departments.length).toBeGreaterThan(0);
    expect(departments.map((d) => d.name)).toContain("Comm.");
    const overview = await services.portals.overview(WS);
    // A department exists; a link does not, and nothing is published.
    expect(overview.every((row) => row.portal === null || row.portal.enabled === false)).toBe(true);
    expect(overview.every((row) => row.requestCount === 0)).toBe(true);
  });

  it("keeps a portal and its requests through a rename, and the link still opens", async () => {
    const { first, portalA } = await twoDepartments();
    const lists = await services.lists.lists(WS);
    const renamed = lists.STAKEHOLDER_GROUPS.map((o) => (o.name === first.name ? { ...o, name: "Communications" } : o));
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", renamed, { [first.name]: "Communications" });

    const after = await services.repos.stakeholderPortals.getDepartment(first.id);
    expect(after?.name).toBe("Communications");
    expect(after?.status).toBe("ACTIVE");
    const gate = await services.portals.gate(portalA.token);
    expect(gate.open).toBe(true);
    expect(gate.departmentName).toBe("Communications");
    expect(await services.repos.stakeholderPortals.countRequests(first.id)).toBe(1);
  });

  it("closes a portal when its group leaves the list, without losing the requests", async () => {
    const { first, portalA } = await twoDepartments();
    const lists = await services.lists.lists(WS);
    await services.lists.save(WS, "STAKEHOLDER_GROUPS", lists.STAKEHOLDER_GROUPS.filter((o) => o.name !== first.name));

    const after = await services.repos.stakeholderPortals.getDepartment(first.id);
    expect(after?.status).toBe("DISABLED");
    expect(await services.repos.stakeholderPortals.countRequests(first.id)).toBe(1);
    expect((await services.portals.gate(portalA.token)).open).toBe(false);
    await expect(services.portals.resolve({ token: portalA.token, password: null })).rejects.toBeInstanceOf(PortalAccessError);
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
    const { first, portalA } = await twoDepartments();
    await services.portals.setEnabled(WS, first.id, false);

    const closed = await services.portals.gate(portalA.token);
    const nonsense = await services.portals.gate("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    // Neither reply names a department, so the shape cannot be used to discover one.
    expect(closed.open).toBe(false);
    expect(nonsense.open).toBe(false);
    expect(closed.departmentName).toBe("");
    expect(nonsense.departmentName).toBe("");
  });

  it("asks for the password on every call, not just the landing page", async () => {
    const { first, portalA } = await twoDepartments();
    await services.portals.setPassword(WS, first.id, "let me in");
    const current = (await services.repos.stakeholderPortals.getPortalByDepartment(first.id))!;

    await expect(services.portals.resolve({ token: current.token, password: null })).rejects.toMatchObject({ reason: "password" });
    await expect(services.portals.resolve({ token: current.token, password: "wrong" })).rejects.toMatchObject({ reason: "password" });
    const resolved = await services.portals.resolve({ token: current.token, password: "let me in" });
    expect(resolved.department.id).toBe(first.id);
    expect(current.token).toBe(portalA.token); // setting a password does not move the link
  });

  it("kills an open tab's grant when the link is regenerated", async () => {
    const { first, portalA } = await twoDepartments();
    const held = { token: portalA.token, password: null, credentialVersion: portalA.credentialVersion };
    expect(await services.portals.resolve(held)).toBeTruthy();

    const regenerated = await services.portals.regenerateLink(WS, first.id);
    expect(regenerated.token).not.toBe(portalA.token);
    // The old address is gone, and so is the grant issued under it.
    await expect(services.portals.resolve(held)).rejects.toMatchObject({ reason: "unknown" });
    await expect(services.portals.resolve({ token: regenerated.token, password: null, credentialVersion: portalA.credentialVersion })).rejects.toMatchObject({ reason: "revoked" });
    expect(await services.portals.resolve({ token: regenerated.token, password: null, credentialVersion: regenerated.credentialVersion })).toBeTruthy();
  });

  it("kills previous grants when the password changes", async () => {
    const { first, portalA } = await twoDepartments();
    await services.portals.setPassword(WS, first.id, "first");
    const withPassword = (await services.repos.stakeholderPortals.getPortalByDepartment(first.id))!;
    await services.portals.setPassword(WS, first.id, "second");

    await expect(
      services.portals.resolve({ token: portalA.token, password: "first", credentialVersion: withPassword.credentialVersion }),
    ).rejects.toMatchObject({ reason: "revoked" });
  });

  // ---- isolation -------------------------------------------------------------

  it("shows a department only its own requests", async () => {
    const { portalA, portalB, itemA, itemB } = await twoDepartments();
    const a = await services.portals.tasks(await services.portals.resolve({ token: portalA.token, password: null }));
    const b = await services.portals.tasks(await services.portals.resolve({ token: portalB.token, password: null }));

    expect(a.tasks.map((t) => t.id)).toEqual([itemA.id]);
    expect(b.tasks.map((t) => t.id)).toEqual([itemB.id]);
    expect(a.totals.requests).toBe(1);
  });

  it("refuses another department's task id, and says nothing about it", async () => {
    const { portalA, itemB } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });
    await expect(services.portals.task(resolved, itemB.id, null)).rejects.toBeInstanceOf(PortalAccessError);
    // And an id belonging to nothing at all fails the same way.
    await expect(services.portals.task(resolved, "00000000-0000-4000-8000-00000000ffff", null)).rejects.toBeInstanceOf(PortalAccessError);
  });

  it("never publishes an item that has no provenance, however public the board", async () => {
    const { portalA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });
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
    const portal = await services.portals.setEnabled(WS, departments[0]!.id, true);

    const resolved = await services.portals.resolve({ token: portal.token, password: null });
    const detail = await services.portals.task(resolved, item.id, null);
    expect(detail.brief).toBe("The brief.");
    const serialised = JSON.stringify(detail);
    expect(serialised).not.toContain("someone@rmit.edu.vn");
    expect(serialised).not.toContain("Request details");
  });

  it("hands a visitor no email addresses anywhere in the page payload", async () => {
    const { portalA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });
    const page = await services.portals.tasks(resolved);
    expect(JSON.stringify(page)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  // ---- who may write -----------------------------------------------------------

  it("lets nobody write without a session, a membership and a seat on the board", async () => {
    const { portalA, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });

    expect(await services.portals.canAct(resolved, itemA.id, null)).toBe(false);
    expect(await services.portals.canAct(resolved, itemA.id, OUTSIDER)).toBe(false);
    // A workspace admin who owns or edits the board may act on that concrete task.
    expect(await services.portals.canAct(resolved, itemA.id, MEMBER)).toBe(true);
  });

  it("does not let a valid link confer any write at all", async () => {
    const { portalA, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });
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
    const portal = await services.portals.setEnabled(WS, department.id, true);
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
    const { portalA, itemA } = await twoDepartments();
    const resolved = await services.portals.resolve({ token: portalA.token, password: null });

    expect((await services.portals.tasks(resolved, { search: itemA.name.slice(0, 6) })).tasks).toHaveLength(1);
    expect((await services.portals.tasks(resolved, { search: "First brief" })).tasks).toHaveLength(1);
    expect((await services.portals.tasks(resolved, { search: "certainly-not-present" })).tasks).toHaveLength(0);
    if (itemA.reference) {
      expect((await services.portals.tasks(resolved, { search: itemA.reference })).tasks).toHaveLength(1);
    }
  });
});
