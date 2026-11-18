import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PORTAL_RANGE } from "@/domain";
import { HttpPortalTransport } from "@/data/supabase/portal-transport";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

/** What the page sent each time, and the answers the route gives in turn. */
let sent: Array<Record<string, unknown>> = [];
let replies: unknown[] = [];

const board = (name: string, revision: string) => ({ workspaceName: name, servedAt: "2026-11-18T08:00:00.000Z", context: { portalName: name }, revision });
const grant = { token: "a".repeat(32), password: null, credentialVersion: 1 };
const scope = { stakeholderId: null, range: DEFAULT_PORTAL_RANGE };

/**
 * The portal page refreshes every four seconds. Each refresh read the portal
 * whole on the server; it now sends the revision of the board it holds, and
 * the route answers "unchanged" while nothing has moved.
 */
describe("the portal board's refresh", () => {
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

  it("asks with nothing held, then with the revision of what it holds", async () => {
    const transport = new HttpPortalTransport();
    replies = [board("Creative", "r1"), { unchanged: true, revision: "r1", servedAt: "2026-11-18T08:00:04.000Z" }];

    const first = await transport.board(grant, scope);
    expect(sent[0]?.revision).toBeNull();
    expect(first.workspaceName).toBe("Creative");
    expect("revision" in first).toBe(false);

    const second = await transport.board(grant, scope);
    expect(sent[1]?.revision).toBe("r1");
    // The board it holds, said again to be true now.
    expect(second.workspaceName).toBe("Creative");
    expect(second.context).toEqual(first.context);
    expect(second.servedAt).toBe("2026-11-18T08:00:04.000Z");
  });

  it("takes a changed board and its new revision", async () => {
    const transport = new HttpPortalTransport();
    replies = [board("Creative", "r1"), board("Creative team", "r2"), { unchanged: true, revision: "r2", servedAt: "2026-11-18T08:00:08.000Z" }];
    await transport.board(grant, scope);
    expect((await transport.board(grant, scope)).workspaceName).toBe("Creative team");
    expect((await transport.board(grant, scope)).workspaceName).toBe("Creative team");
    expect(sent.map((body) => body.revision)).toEqual([null, "r1", "r2"]);
  });

  it("keeps each stakeholder and range apart", async () => {
    const transport = new HttpPortalTransport();
    const other = { stakeholderId: "11111111-1111-4111-8111-111111111111", range: DEFAULT_PORTAL_RANGE };
    replies = [board("All", "r1"), board("One", "r1-one"), { unchanged: true, revision: "r1", servedAt: "x" }];
    await transport.board(grant, scope);
    await transport.board(grant, other);
    expect((await transport.board(grant, scope)).workspaceName).toBe("All");
    expect(sent.map((body) => body.revision)).toEqual([null, null, "r1"]);
  });

  it("asks for the board itself if told unchanged with nothing held", async () => {
    const transport = new HttpPortalTransport();
    replies = [{ unchanged: true, revision: "r1", servedAt: "x" }, board("Creative", "r1")];
    expect((await transport.board(grant, scope)).workspaceName).toBe("Creative");
    expect(sent.map((body) => body.revision)).toEqual([null, null]);
  });

  it("holds nothing when the route cannot give a revision", async () => {
    const transport = new HttpPortalTransport();
    replies = [board("Creative", null as unknown as string), board("Creative", null as unknown as string)];
    await transport.board(grant, scope);
    await transport.board(grant, scope);
    expect(sent.map((body) => body.revision)).toEqual([null, null]);
  });
});
