import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { refuseDashboardShare, type DashboardShare } from "@/domain";
import { createServices } from "@/services";
import { ShareAccessError } from "@/services/board-share-service";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `dashboard-share-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const ADMIN = SEED_USER_IDS.danh;

function shareAt(patch: Partial<DashboardShare>): DashboardShare {
  return { id: "s1", workspaceId: SEED_WORKSPACE_ID, token: "abcdefghijkmnpqrstuvwx", enabled: true, expiresAt: null, passwordHash: null, createdBy: ADMIN, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...patch };
}

describe("what a dashboard link refuses", () => {
  it("serves a live link and refuses one that is unknown, off or past its day", () => {
    expect(refuseDashboardShare(shareAt({}), "2026-09-08")).toBeNull();
    expect(refuseDashboardShare(null, "2026-09-08")).toBe("unknown");
    expect(refuseDashboardShare(shareAt({ enabled: false }), "2026-09-08")).toBe("off");
    expect(refuseDashboardShare(shareAt({ expiresAt: "2026-09-07" }), "2026-09-08")).toBe("expired");
    expect(refuseDashboardShare(shareAt({ expiresAt: "2026-09-08" }), "2026-09-08")).toBeNull();
  });
});

describe("DashboardService", () => {
  it("reads one snapshot across the workspace's boards", async () => {
    const { repos, services } = freshServices();
    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const snapshot = await services.dashboard.loadSnapshot(SEED_WORKSPACE_ID, boards);
    expect(snapshot.boards.every((b) => b.archivedAt === null)).toBe(true);
    expect(snapshot.boards.length).toBeGreaterThan(5);
    expect(snapshot.items.length).toBeGreaterThan(50);
    expect(snapshot.assets.length).toBeGreaterThan(0);
    expect(snapshot.teams.some((t) => t.system === "ADMIN")).toBe(true);
    // Only people the boards name travel; every one of them is referenced somewhere.
    const named = new Set([...snapshot.items.map((i) => i.createdBy), ...snapshot.boards.map((b) => b.ownerId), ...snapshot.values.flatMap((v) => (v.value.type === "PERSON" ? v.value.userIds : [])), ...snapshot.assets.flatMap((a) => a.assigneeIds)]);
    expect(snapshot.users.every((u) => named.has(u.id))).toBe(true);
  });

  it("creates one link per workspace, keeps it through on/off, and retires it with a new token", async () => {
    const { services } = freshServices();
    expect(await services.dashboard.getShare(SEED_WORKSPACE_ID)).toBeNull();
    const created = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true });
    expect(created.token).toMatch(/^[a-z2-9]{22}$/);
    const off = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: false });
    expect(off.id).toBe(created.id);
    expect(off.token).toBe(created.token);
    expect(off.enabled).toBe(false);
    expect(await services.dashboard.gate(created.token)).toEqual({ open: false, refusal: "off", needsPassword: false, access: "PUBLIC" });
    await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true });
    const renewed = await services.dashboard.regenerateShare(SEED_WORKSPACE_ID, ADMIN);
    expect(renewed.token).not.toBe(created.token);
    expect(await services.dashboard.gate(created.token)).toMatchObject({ open: false, refusal: "unknown" });
    expect(await services.dashboard.gate(renewed.token)).toEqual({ open: true, refusal: null, needsPassword: false, access: "PUBLIC" });
    await services.dashboard.removeShare(SEED_WORKSPACE_ID);
    expect(await services.dashboard.getShare(SEED_WORKSPACE_ID)).toBeNull();
  });

  it("serves a trimmed snapshot behind the token, and asks for the password when one is set", async () => {
    const { services } = freshServices();
    const share = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true, password: "open-sesame" });
    expect(await services.dashboard.gate(share.token)).toEqual({ open: true, refusal: null, needsPassword: true, access: "PUBLIC" });
    await expect(services.dashboard.loadPublic(share.token, null)).rejects.toBeInstanceOf(ShareAccessError);
    await expect(services.dashboard.loadPublic(share.token, "wrong")).rejects.toMatchObject({ reason: "password" });
    const payload = await services.dashboard.loadPublic(share.token, "open-sesame");
    expect(payload.expiresAt).toBeNull();
    expect(payload.snapshot.items.every((i) => i.description === null)).toBe(true);
    expect(payload.snapshot.users.every((u) => u.email === "")).toBe(true);
    expect(payload.snapshot.values.some((v) => v.value.type === "LONG_TEXT")).toBe(false);
    await expect(services.dashboard.loadPublic("not-a-real-token-0000", null)).rejects.toMatchObject({ reason: "unknown" });
  });
});
