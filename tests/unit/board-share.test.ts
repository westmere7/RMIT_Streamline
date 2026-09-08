import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { createMemoryRepositories } from "@/data/memory";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { generateShareToken, isPlausibleShareToken, refuseShare, type BoardShare } from "@/domain";
import { createServices } from "@/services";
import { ShareAccessError } from "@/services/board-share-service";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `share-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const BOARD = SEED_BOARD_IDS.rmitinerary;
const ADMIN = SEED_USER_IDS.danh;

function shareAt(patch: Partial<BoardShare>): BoardShare {
  return {
    id: "s1",
    boardId: BOARD,
    token: generateShareToken(),
    enabled: true,
    expiresAt: null,
    passwordHash: null,
    createdBy: ADMIN,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("share tokens", () => {
  it("are long, unguessable and free of look-alike characters", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateShareToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[a-z2-9]{22}$/);
      expect(token).not.toMatch(/[lo01]/);
      expect(isPlausibleShareToken(token)).toBe(true);
    }
  });

  it("rejects anything that is not shaped like one, so a stray path never reaches the database", () => {
    for (const bad of ["", "short", "../../etc/passwd", "TOKENWITHCAPS1234567890", "a".repeat(65)]) {
      expect(isPlausibleShareToken(bad)).toBe(false);
    }
  });
});

describe("what a link refuses", () => {
  it("serves a live link and refuses one that is unknown, switched off or past its day", () => {
    expect(refuseShare(shareAt({}), "2026-09-08")).toBeNull();
    expect(refuseShare(null, "2026-09-08")).toBe("unknown");
    expect(refuseShare(shareAt({ enabled: false }), "2026-09-08")).toBe("off");
    expect(refuseShare(shareAt({ expiresAt: "2026-09-07" }), "2026-09-08")).toBe("expired");
  });

  it("still serves on the last day, so an expiry means the end of that day", () => {
    expect(refuseShare(shareAt({ expiresAt: "2026-09-08" }), "2026-09-08")).toBeNull();
  });
});

describe("sharing a board", () => {
  it("creates one link, keeps its address across a switch off and on, and replaces it on request", async () => {
    const { services } = freshServices();
    const created = await services.shares.save(BOARD, ADMIN, { enabled: true });
    expect(await services.shares.get(BOARD)).toEqual(created);

    const off = await services.shares.save(BOARD, ADMIN, { enabled: false });
    expect(off.token).toBe(created.token);
    const on = await services.shares.save(BOARD, ADMIN, { enabled: true });
    expect(on.token).toBe(created.token);

    const replaced = await services.shares.regenerate(BOARD, ADMIN);
    expect(replaced.token).not.toBe(created.token);
    await expect(services.shares.load(created.token, null)).rejects.toThrow(ShareAccessError);
  });

  it("opens the board behind a live link and refuses one that is off or expired", async () => {
    const { services } = freshServices();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true });

    const payload = await services.shares.load(share.token, null);
    expect(payload.board.id).toBe(BOARD);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.columns.length).toBeGreaterThan(0);
    // Nothing of the people travels that a card does not show, and only the
    // people this board names travel at all.
    expect(payload.users.every((u) => u.email === "")).toBe(true);
    const everyone = await services.repos.users.list();
    expect(payload.users.length).toBeGreaterThan(0);
    expect(payload.users.length).toBeLessThan(everyone.length);
    const named = new Set(payload.users.map((u) => u.id));
    for (const value of payload.values) {
      if (value.value.type === "PERSON") for (const id of value.value.userIds) expect(named.has(id)).toBe(true);
    }
    // Only links that stay on this board, so nothing names an item elsewhere.
    const onBoard = new Set(payload.items.map((i) => i.id));
    expect(payload.links.every((l) => onBoard.has(l.itemAId) && onBoard.has(l.itemBId))).toBe(true);

    await services.shares.save(BOARD, ADMIN, { enabled: false });
    await expect(services.shares.load(share.token, null)).rejects.toMatchObject({ reason: "off" });

    await services.shares.save(BOARD, ADMIN, { enabled: true, expiresAt: "2020-01-01" });
    await expect(services.shares.load(share.token, null)).rejects.toMatchObject({ reason: "expired" });
  });

  it("asks for the password it was given, and says so before the board is fetched", async () => {
    const { services } = freshServices();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true, password: "open sesame" });
    expect(share.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

    const gate = await services.shares.gate(share.token);
    expect(gate).toEqual({ open: true, refusal: null, needsPassword: true });

    await expect(services.shares.load(share.token, null)).rejects.toMatchObject({ reason: "password" });
    await expect(services.shares.load(share.token, "wrong")).rejects.toMatchObject({ reason: "password" });
    await expect(services.shares.load(share.token, "open sesame")).resolves.toMatchObject({ board: { id: BOARD } });

    // Removing it lets the link through again; the settings around it are untouched.
    const cleared = await services.shares.save(BOARD, ADMIN, { password: null });
    expect(cleared.passwordHash).toBeNull();
    expect(cleared.enabled).toBe(true);
    await expect(services.shares.load(share.token, null)).resolves.toMatchObject({ board: { id: BOARD } });
  });

  it("tells a visitor nothing about a token that opens nothing", async () => {
    const { services } = freshServices();
    expect(await services.shares.gate("notatokenatall")).toEqual({ open: false, refusal: "unknown", needsPassword: false });
    expect(await services.shares.gate(generateShareToken())).toEqual({ open: false, refusal: "unknown", needsPassword: false });
  });

  it("forgets the link when sharing stops", async () => {
    const { services } = freshServices();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true });
    await services.shares.remove(BOARD);
    expect(await services.shares.get(BOARD)).toBeNull();
    await expect(services.shares.load(share.token, null)).rejects.toMatchObject({ reason: "unknown" });
  });
});

describe("the repositories a visitor reads through", () => {
  it("serve the board they were given and refuse every write", async () => {
    const { services } = freshServices();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true });
    const payload = await services.shares.load(share.token, null);
    const repos = createMemoryRepositories(payload);

    const snapshot = await createServices(repos).items.loadBoardSnapshot(BOARD);
    expect(snapshot.items.length).toBe(payload.items.length);
    expect(snapshot.columns.length).toBe(payload.columns.length);

    // Nothing outside the payload is reachable, and no write goes through.
    expect(await repos.boards.getById("some-other-board")).toBeNull();
    expect(await repos.teams.listByWorkspace(payload.board.workspaceId)).toEqual([]);
    expect(await repos.boardShares.getByToken(share.token)).toBeNull();
    await expect(repos.items.update(payload.items[0]!.id, { name: "hijacked" })).rejects.toThrow(/read-only/i);
    await expect(repos.comments.create({} as never)).rejects.toThrow(/read-only/i);
    await expect(repos.boards.deleteGroup(payload.groups[0]!.id)).rejects.toThrow(/read-only/i);

    // The two the app does by itself when a page opens are simply dropped.
    await expect(repos.itemReads.markSeen("guest", payload.items[0]!.id, "2026-09-08T00:00:00.000Z")).resolves.toBeUndefined();
    await expect(repos.admin.recordBoardVisit("guest", BOARD)).resolves.toBeUndefined();
  });
});
