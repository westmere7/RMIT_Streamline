import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { routes } from "@/lib/routes";
import { createServices } from "@/services";
import { RESERVED_WORKSPACE_SLUGS } from "@/services/workspace-service";

async function setup() {
  const services = createServices(createLocalRepositories({ databaseName: `short-links-${Date.now()}-${Math.random()}` }));
  await services.repos.admin.resetToSeed();
  const workspace = (await services.repos.workspaces.getById(SEED_WORKSPACE_ID))!;
  return { services, workspace };
}

describe("the short portal and booking links", () => {
  it("are the workspace's address and nothing else", () => {
    expect(routes.workspacePortal("rmit")).toBe("/rmit/portal");
    expect(routes.workspacePortal("rmit", { task: "abc" })).toBe("/rmit/portal?task=abc");
    expect(routes.workspaceBooking("content-team")).toBe("/content-team/booking");
  });

  it("find the workspace's portal from its address, and an old token finds its way back", async () => {
    const { services, workspace } = await setup();
    const portal = await services.portals.ensurePortal(SEED_WORKSPACE_ID);
    expect(await services.portals.publicTokenForWorkspace(workspace.slug)).toBe(portal.token);
    expect(await services.portals.publicTokenForWorkspace(workspace.slug.toUpperCase())).toBe(portal.token);
    expect(await services.portals.publicTokenForWorkspace("no-such-workspace")).toBeNull();
    expect(await services.portals.publicWorkspaceForToken(portal.token)).toBe(workspace.slug);
    expect(await services.portals.publicWorkspaceForToken("not-a-token")).toBeNull();
  });

  it("give a workspace whose portal nobody has opened its booking form anyway: portal off, booking on", async () => {
    const { services, workspace } = await setup();
    expect(await services.repos.stakeholderPortals.getUnifiedPortal(SEED_WORKSPACE_ID)).toBeNull();
    const token = await services.portals.publicTokenForWorkspace(workspace.slug);
    const made = (await services.repos.stakeholderPortals.getUnifiedPortal(SEED_WORKSPACE_ID))!;
    expect(token).toBe(made.token);
    expect(made.enabled).toBe(false);
    expect(made.allowBooking).toBe(true);
    const gate = await services.portals.publicGate(token!);
    expect(gate.open).toBe(false);
    expect(gate.bookingOpen).toBe(true);
    // Asked again, the same one.
    expect(await services.portals.publicTokenForWorkspace(workspace.slug)).toBe(token);
  });

  it("leave a replaced link shut: only the current token moves to the short address", async () => {
    const { services, workspace } = await setup();
    const before = await services.portals.ensurePortal(SEED_WORKSPACE_ID);
    const after = await services.portals.regenerateLink(SEED_WORKSPACE_ID);
    expect(after.token).not.toBe(before.token);
    expect(await services.portals.publicWorkspaceForToken(before.token)).toBeNull();
    expect(await services.portals.publicWorkspaceForToken(after.token)).toBe(workspace.slug);
    // The short address follows the current link whatever happened to the old one.
    expect(await services.portals.publicTokenForWorkspace(workspace.slug)).toBe(after.token);
  });

  it("can never be taken by a workspace: the app's own paths are reserved", async () => {
    const { services } = await setup();
    for (const slug of ["login", "portal", "book", "api", "workspace", "share"]) expect(RESERVED_WORKSPACE_SLUGS.has(slug)).toBe(true);
    await expect(services.workspace.createWorkspace({ name: "Logins", slug: "login" }, SEED_USER_IDS.danh, SEED_WORKSPACE_ID)).rejects.toThrow(/app's own addresses/);
    // A name that would make a reserved address gets another one.
    const made = await services.workspace.createWorkspace({ name: "Portal" }, SEED_USER_IDS.danh, SEED_WORKSPACE_ID);
    expect(made.slug).not.toBe("portal");
  });
});
