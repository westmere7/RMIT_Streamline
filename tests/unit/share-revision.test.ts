import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { HttpItemShareTransport, HttpShareTransport } from "@/data/supabase/share-transport";
import { createServices } from "@/services";
import { loadSharedBoardIfChanged, ShareAccessError, type ShareRevisionCheck } from "@/services/board-share-service";
import { loadSharedItemIfChanged } from "@/services/item-share-service";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

/**
 * Shared board and task links refresh every four seconds. Each refresh read
 * the whole board; the page now sends the revision it holds and the route
 * answers "unchanged" while nothing has moved. The link is still checked in
 * full on every refresh, revision or not.
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
const ADMIN = SEED_USER_IDS.danh;
let counter = 0;

function setup() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `share-revision-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

/** A revision that only changes when told to. */
function revisions(known: string | null): ShareRevisionCheck & { now: string } {
  const check = { known, now: "r1", current: async () => check.now };
  return check;
}

describe("a shared link's refresh, on the server", () => {
  it("reads the board, then answers unchanged for the same revision, then reads again once it moves", async () => {
    const { repos, services } = setup();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true, access: "PUBLIC" });
    const check = revisions(null);

    const first = await loadSharedBoardIfChanged(repos, share.token, null, null, check);
    expect("unchanged" in first).toBe(false);
    expect(first.revision).toBe("r1");

    check.known = "r1";
    expect(await loadSharedBoardIfChanged(repos, share.token, null, null, check)).toEqual({ unchanged: true, revision: "r1" });

    check.now = "r2";
    const moved = await loadSharedBoardIfChanged(repos, share.token, null, null, check);
    expect("unchanged" in moved).toBe(false);
    expect(moved.revision).toBe("r2");
  });

  it("checks the link before the revision: a password, a link switched off", async () => {
    const { repos, services } = setup();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true, access: "PUBLIC", password: "open sesame" });
    const check = revisions("r1");
    await expect(loadSharedBoardIfChanged(repos, share.token, null, null, check)).rejects.toMatchObject({ reason: "password" });
    expect(await loadSharedBoardIfChanged(repos, share.token, "open sesame", null, check)).toEqual({ unchanged: true, revision: "r1" });

    await services.shares.save(BOARD, ADMIN, { enabled: false });
    await expect(loadSharedBoardIfChanged(repos, share.token, "open sesame", null, check)).rejects.toBeInstanceOf(ShareAccessError);
  });

  it("does the same for a task link, and refuses an archived task whatever the revision", async () => {
    const { repos, services } = setup();
    const [item] = (await repos.items.listByBoard(BOARD)).filter((i) => !i.parentItemId);
    const share = await services.itemShares.save(item!.id, ADMIN, { enabled: true, access: "PUBLIC" });
    const check = revisions("r1");
    expect(await loadSharedItemIfChanged(repos, share.token, null, null, check)).toEqual({ unchanged: true, revision: "r1" });

    await repos.items.update(item!.id, { archivedAt: new Date().toISOString() });
    await expect(loadSharedItemIfChanged(repos, share.token, null, null, check)).rejects.toBeInstanceOf(ShareAccessError);
  });

  it("reads in full when no revision can be worked out", async () => {
    const { repos, services } = setup();
    const share = await services.shares.save(BOARD, ADMIN, { enabled: true, access: "PUBLIC" });
    const answer = await loadSharedBoardIfChanged(repos, share.token, null, null, { known: null, current: async () => null });
    expect("unchanged" in answer).toBe(false);
  });
});

describe("a shared link's refresh, in the browser", () => {
  let sent: Array<Record<string, unknown>> = [];
  let replies: unknown[] = [];

  beforeEach(() => {
    sent = [];
    replies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(replies.shift()), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the revision it holds and hands back the very same board while unchanged", async () => {
    const transport = new HttpShareTransport();
    replies = [{ workspaceName: "Creative", revision: "r1" }, { unchanged: true, revision: "r1" }, { workspaceName: "Creative team", revision: "r2" }];
    const first = await transport.load("t".repeat(22), null);
    const second = await transport.load("t".repeat(22), null);
    expect(second).toBe(first);
    expect("revision" in first).toBe(false);
    expect((await transport.load("t".repeat(22), null)).workspaceName).toBe("Creative team");
    expect(sent.map((body) => body.revision)).toEqual([null, "r1", "r1"]);
  });

  it("keeps a task link apart from another, and a wrong password apart from a right one", async () => {
    const transport = new HttpItemShareTransport();
    replies = [{ itemId: "a", revision: "r1" }, { itemId: "a", revision: "r1" }, { unchanged: true, revision: "r1" }];
    await transport.load("a".repeat(22), "one");
    await transport.load("a".repeat(22), "two");
    await transport.load("a".repeat(22), "one");
    expect(sent.map((body) => body.revision)).toEqual([null, null, "r1"]);
  });

  it("asks for the payload itself if told unchanged with nothing held", async () => {
    const transport = new HttpShareTransport();
    replies = [{ unchanged: true, revision: "r1" }, { workspaceName: "Creative", revision: "r1" }];
    expect((await transport.load("t".repeat(22), null)).workspaceName).toBe("Creative");
    expect(sent.map((body) => body.revision)).toEqual([null, null]);
  });
});
