import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { createServices } from "@/services";
import { loadSharedBoard, ShareAccessError, type ShareViewer } from "@/services/board-share-service";
import { loadSharedItem } from "@/services/item-share-service";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `item-share-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const BOARD = SEED_BOARD_IDS.rmitinerary;
const ADMIN = SEED_USER_IDS.danh;

const MEMBER: ShareViewer = { userId: ADMIN, isWorkspaceMember: true };
/** Somebody signed in to a different workspace: an account, but not this one's. */
const OUTSIDER: ShareViewer = { userId: "someone-else", isWorkspaceMember: false };

async function anItem(repos: Awaited<ReturnType<typeof freshServices>>["repos"]) {
  const items = await repos.items.listByBoard(BOARD);
  const parent = items.find((i) => i.parentItemId === null);
  if (!parent) throw new Error("The seed board has no items to share.");
  return parent;
}

describe("sharing one task", () => {
  it("creates one link, keeps its address across a switch off and on, and replaces it on request", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);

    const created = await services.itemShares.save(item.id, ADMIN, { enabled: true });
    expect(await services.itemShares.get(item.id)).toEqual(created);
    // A new link opens for the workspace until somebody says otherwise.
    expect(created.access).toBe("PRIVATE");

    const off = await services.itemShares.save(item.id, ADMIN, { enabled: false });
    expect(off.token).toBe(created.token);
    const on = await services.itemShares.save(item.id, ADMIN, { enabled: true });
    expect(on.token).toBe(created.token);

    const replaced = await services.itemShares.regenerate(item.id, ADMIN);
    expect(replaced.token).not.toBe(created.token);
    await expect(services.itemShares.load(created.token, null)).rejects.toThrow(ShareAccessError);

    await services.itemShares.remove(item.id);
    expect(await services.itemShares.get(item.id)).toBeNull();
  });

  it("serves that task and its subitems, and nothing else from the board", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);
    const share = await services.itemShares.save(item.id, ADMIN, { enabled: true });

    const payload = await services.itemShares.load(share.token, null);
    expect(payload.itemId).toBe(item.id);
    expect(payload.board.id).toBe(BOARD);
    expect(payload.columns.length).toBeGreaterThan(0);

    // Only the task and whatever hangs off it.
    const shown = new Set(payload.items.map((i) => i.id));
    expect(shown.has(item.id)).toBe(true);
    for (const one of payload.items) expect(one.id === item.id || one.parentItemId === item.id).toBe(true);
    const onBoard = await repos.items.listByBoard(BOARD);
    expect(payload.items.length).toBeLessThan(onBoard.length);

    // Values, assets and updates are trimmed to those same items.
    for (const value of payload.values) expect(shown.has(value.itemId)).toBe(true);
    for (const asset of payload.assets) expect(shown.has(asset.itemId)).toBe(true);
    for (const comment of payload.comments) expect(shown.has(comment.itemId)).toBe(true);
    // Nothing of the people travels that a card does not show.
    expect(payload.users.every((u) => u.email === "")).toBe(true);
    const everyone = await repos.users.list();
    expect(payload.users.length).toBeLessThan(everyone.length);
    // A link to a task elsewhere would name something the visitor cannot see.
    expect(payload.links).toEqual([]);
  });

  it("refuses a link that is off, expired, or asked a password that was not given", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);
    const share = await services.itemShares.save(item.id, ADMIN, { enabled: true, password: "open sesame" });

    expect(await services.itemShares.gate(share.token)).toEqual({ open: true, refusal: null, needsPassword: true, access: "PRIVATE" });
    await expect(services.itemShares.load(share.token, null)).rejects.toMatchObject({ reason: "password" });
    await expect(services.itemShares.load(share.token, "wrong")).rejects.toMatchObject({ reason: "password" });
    await expect(services.itemShares.load(share.token, "open sesame")).resolves.toMatchObject({ itemId: item.id });

    await services.itemShares.save(item.id, ADMIN, { enabled: false });
    await expect(services.itemShares.load(share.token, null)).rejects.toMatchObject({ reason: "off" });
    await services.itemShares.save(item.id, ADMIN, { enabled: true, expiresAt: "2020-01-01" });
    await expect(services.itemShares.load(share.token, null)).rejects.toMatchObject({ reason: "expired" });
  });

  it("says nothing about a token that opens nothing", async () => {
    const { services } = freshServices();
    expect(await services.itemShares.gate("notatokenatall")).toEqual({ open: false, refusal: "unknown", needsPassword: false, access: "PUBLIC" });
  });
});

describe("who a link opens for", () => {
  it("lets a private task link through only for a signed-in member of the workspace", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);
    const share = await services.itemShares.save(item.id, ADMIN, { enabled: true, access: "PRIVATE" });

    await expect(loadSharedItem(repos, share.token, null, null)).rejects.toMatchObject({ reason: "signin" });
    await expect(loadSharedItem(repos, share.token, null, OUTSIDER)).rejects.toMatchObject({ reason: "signin" });
    await expect(loadSharedItem(repos, share.token, null, MEMBER)).resolves.toMatchObject({ itemId: item.id });
  });

  it("lets a public task link through with no account at all", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);
    const share = await services.itemShares.save(item.id, ADMIN, { enabled: true, access: "PUBLIC" });

    await expect(loadSharedItem(repos, share.token, null, null)).resolves.toMatchObject({ itemId: item.id });
    expect(await services.itemShares.gate(share.token)).toMatchObject({ open: true, access: "PUBLIC" });
  });

  it("applies the same rule to a board link", async () => {
    const { repos, services } = freshServices();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true, access: "PRIVATE" });

    await expect(loadSharedBoard(repos, share.token, null, null)).rejects.toMatchObject({ reason: "signin" });
    await expect(loadSharedBoard(repos, share.token, null, MEMBER)).resolves.toMatchObject({ board: { id: BOARD } });

    const opened = await services.shares.save(BOARD, ADMIN, { access: "PUBLIC" });
    expect(opened.token).toBe(share.token);
    await expect(loadSharedBoard(repos, share.token, null, null)).resolves.toMatchObject({ board: { id: BOARD } });
  });

  it("keeps the access mode across a change to anything else", async () => {
    const { repos, services } = freshServices();
    const item = await anItem(repos);
    await services.itemShares.save(item.id, ADMIN, { enabled: true, access: "PUBLIC" });
    const later = await services.itemShares.save(item.id, ADMIN, { expiresAt: "2099-01-01" });
    expect(later.access).toBe("PUBLIC");
  });
});
