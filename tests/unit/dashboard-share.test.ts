import { describe, expect, it, vi } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { refuseDashboardShare, type DashboardShare, type PublicDashboardResponse } from "@/domain";
import { createServices } from "@/services";
import { ShareAccessError } from "@/services/board-share-service";
import { DashboardService, loadSharedDashboard, type PublicDashboardTransport } from "@/services/dashboard-service";

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

describe("a dashboard link that already holds the current revision", () => {
  it("answers unchanged without reading the workspace, and reads it all when the revision moved", async () => {
    const { repos, services } = freshServices();
    const share = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true });
    const listBoards = vi.spyOn(repos.boards, "listByWorkspace");

    const first = await loadSharedDashboard(repos, share.token, null, { known: null, current: async () => "7:2026-10-21T00:00:00Z" });
    expect(first).toMatchObject({ revision: "7:2026-10-21T00:00:00Z" });
    expect("snapshot" in first && first.snapshot.items.length).toBeGreaterThan(50);
    expect(listBoards).toHaveBeenCalledTimes(1);

    const same = await loadSharedDashboard(repos, share.token, null, { known: "7:2026-10-21T00:00:00Z", current: async () => "7:2026-10-21T00:00:00Z" });
    expect(same).toEqual({ unchanged: true, revision: "7:2026-10-21T00:00:00Z", expiresAt: null });
    expect(listBoards).toHaveBeenCalledTimes(1);

    const moved = await loadSharedDashboard(repos, share.token, null, { known: "7:2026-10-21T00:00:00Z", current: async () => "8:2026-10-21T00:01:00Z" });
    expect(moved).toMatchObject({ revision: "8:2026-10-21T00:01:00Z" });
    expect(listBoards).toHaveBeenCalledTimes(2);
  });

  it("reads everything when the revision cannot be read, and still checks the link and password first", async () => {
    const { repos, services } = freshServices();
    const share = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true, password: "open-sesame" });
    const unreadable = await loadSharedDashboard(repos, share.token, "open-sesame", { known: null, current: async () => null });
    expect(unreadable).toMatchObject({ revision: null });
    expect("snapshot" in unreadable).toBe(true);
    // Holding the right revision is no way round the password, nor round a link switched off.
    await expect(loadSharedDashboard(repos, share.token, "wrong", { known: "3", current: async () => "3" })).rejects.toMatchObject({ reason: "password" });
    await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: false });
    await expect(loadSharedDashboard(repos, share.token, "open-sesame", { known: "3", current: async () => "3" })).rejects.toMatchObject({ reason: "off" });
  });

  it("keeps the page's copy on an unchanged answer, with a new snapshot object and the link's latest expiry", async () => {
    const { repos, services } = freshServices();
    const share = await services.dashboard.saveShare(SEED_WORKSPACE_ID, ADMIN, { enabled: true });
    const full = await services.dashboard.loadPublic(share.token, null);
    const previous = { ...full, revision: "4:t" };
    const answers: PublicDashboardResponse[] = [{ unchanged: true, revision: "4:t", expiresAt: "2026-12-31" }];
    const sent: Array<string | null> = [];
    const transport: PublicDashboardTransport = {
      gate: async () => ({ open: true, refusal: null, needsPassword: false, access: "PUBLIC" }),
      load: async (_token, _password, revision) => {
        sent.push(revision);
        return answers.shift()!;
      },
      loadWorkspace: async () => full.snapshot,
    };
    const remote = new DashboardService(repos, transport);
    const kept = await remote.loadPublic(share.token, null, previous);
    expect(sent).toEqual(["4:t"]);
    expect(kept.expiresAt).toBe("2026-12-31");
    expect(kept.revision).toBe("4:t");
    expect(kept.snapshot.items).toBe(previous.snapshot.items);
    expect(kept.snapshot).not.toBe(previous.snapshot);
    // An unchanged answer to a page with nothing on screen is the server's mistake, not a blank dashboard.
    answers.push({ unchanged: true, revision: "4:t", expiresAt: null });
    await expect(remote.loadPublic(share.token, null, null)).rejects.toThrow(/unchanged/);
  });
});
