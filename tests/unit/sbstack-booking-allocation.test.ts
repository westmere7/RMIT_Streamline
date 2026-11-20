// @vitest-environment happy-dom
// @vitest-environment-options {"url":"http://localhost:3300","settings":{"fetch":{"disableSameOriginPolicy":true}}}
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BookingFormTemplate, BookingRequest } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { createServices } from "@/services";

/**
 * Booking allocation, end to end on the disposable Supabase stack (never live):
 * the app's own services run as a signed-in admin and member under the real
 * row-level security, and the real API routes take public, member and portal
 * bookings and allocations. Skipped unless SBSTACK=1 and the database is local.
 *
 *   SBSTACK=1 npx vitest run tests/unit/sbstack-booking-allocation.test.ts
 *   (with `dev-disposable-supabase` serving on :3300)
 */

const env: Record<string, string> = (() => {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
})();
const enabled = process.env.SBSTACK === "1" && /127\.0\.0\.1|localhost/.test(env.SUPABASE_DB_URL ?? "");
const BASE = "http://localhost:3300";
const PASSWORD = "Password123!";

const WS_SLUG = "rmit";
const BRAND = "00000002-0000-4000-8000-000000000005";
const BRAND_BOARD = "00000003-0000-4000-8000-000000000009";
const DOOH = "00000003-0000-4000-8000-000000000004";
const OPEN_DAY = "00000003-0000-4000-8000-000000000007";
const CREATIVE = "00000003-0000-4000-8000-000000000005";
const TA = "000000e0-0000-4000-8000-000000000002";
const PORTAL_TOKEN = "auditportal1d69e8bd755d44779ad43";

describe.skipIf(!enabled)("booking allocation on the disposable stack", { timeout: 60_000 }, () => {
  const require = createRequire(process.cwd() + "/package.json");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require("postgres");
  const sql = enabled ? postgres(env.SUPABASE_DB_URL, { max: 1 }) : null;
  let wsId = "";
  let key0 = "";
  let joanne = { id: "", token: "", client: null as unknown as SupabaseClient };
  let jun = { id: "", token: "", client: null as unknown as SupabaseClient };
  let builtIn: BookingFormTemplate;
  let department = "";
  let priority: string | null = null;

  const signIn = async (email: string) => {
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message}`);
    return { id: data.user.id, token: data.session.access_token, client };
  };
  /** The app's services, as this person, through their own session. */
  const servicesAs = (person: { client: SupabaseClient }) => {
    routeRepositoriesThrough(person.client);
    return createServices(createSupabaseRepositories());
  };
  const boardOf = async (itemId: string) => (await sql`select board_id from public.items where id = ${itemId}`)[0]?.board_id as string;

  const routedTemplate = (otherwise: "team" | "allocation"): BookingFormTemplate => {
    const t = structuredClone(builtIn);
    const design = t.services.find((s) => s.id === "svc-design")!;
    design.teamId = BRAND;
    design.subServices = [
      { name: "Print", color: "orange" },
      { name: "Key Visual", color: "pink" },
      { name: "Publication", color: "amber" },
    ];
    design.routing = {
      enabled: true,
      rules: [
        { id: "exact-pair", workTypes: ["Print", "Key Visual"], boardId: OPEN_DAY, match: "exact" },
        { id: "any-print", workTypes: ["Print"], boardId: DOOH },
      ],
      otherwise: { kind: otherwise },
    };
    return t;
  };

  const request = (title: string, subServices: string[], extra: Partial<BookingRequest> = {}): BookingRequest => {
    const design = builtIn.services.find((s) => s.id === "svc-design")!;
    const answers: BookingRequest["answers"] = {};
    for (const block of design.blocks) {
      if (!("required" in block) || !block.required) continue;
      if (block.kind === "short" || block.kind === "long") answers[block.id] = { kind: "text", text: "Stack test answer" };
      if ((block.kind === "single" || block.kind === "multi") && block.options[0]) answers[block.id] = { kind: "choice", values: [block.options[0].name] };
    }
    return {
      requesterName: "Stack Tester",
      requesterEmail: "stack.tester@example.com",
      department,
      title,
      brief: "",
      assetTypes: [],
      assets: [{ name: "A1 poster", quantity: 2, spec: "CMYK", assetType: null }],
      serviceTypeId: "svc-design",
      subServices,
      teamId: null,
      dueDate: "2026-12-20",
      priority,
      referenceUrl: null,
      answers,
      ...extra,
    };
  };
  const bookPublic = async (title: string, picks: string[], key: string | null = key0, bearer?: string) => {
    const res = await fetch(`${BASE}/api/book/${WS_SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ key, request: request(title, picks) }),
    });
    return { status: res.status, body: (await res.json()) as { itemId: string; boardId: string; boardName: string; teamName: string | null; error?: string } };
  };
  const allocate = async (bearer: string, itemId: string, boardId: string) => {
    const res = await fetch(`${BASE}/api/allocate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` }, body: JSON.stringify({ itemId, boardId }) });
    return { status: res.status, body: (await res.json()) as { item?: { boardId: string }; error?: string } };
  };
  /** The item is whole on its board: every value in that board's columns, every asset on it. */
  const landedWhole = async (itemId: string, boardId: string) => {
    const stray = await sql`select count(*)::int n from public.item_column_values v join public.board_columns c on c.id = v.column_id where v.item_id = ${itemId} and c.board_id <> ${boardId}`;
    const assets = await sql`select count(*)::int n from public.item_assets where item_id = ${itemId} and board_id <> ${boardId}`;
    return stray[0].n === 0 && assets[0].n === 0;
  };

  beforeAll(async () => {
    const [ws] = await sql`select id, booking_key from public.workspaces where slug = ${WS_SLUG}`;
    wsId = ws.id;
    key0 = ws.booking_key;
    // A clean start: the built-in form live, Brand's own board nominated, Jun not on Task Allocation.
    await sql`update public.workspaces set booking_form = null, booking_form_draft = null where id = ${wsId}`;
    await sql`update public.teams set booking_board_id = ${BRAND_BOARD} where id = ${BRAND}`;
    await sql`update public.boards set archived_at = null where id in (${DOOH}, ${OPEN_DAY}, ${CREATIVE})`;
    await sql`delete from public.board_members where board_id = ${TA} and user_id = (select id from auth.users where email = 'jun@rmit.local')`;
    department = (await sql`select name from public.stakeholder_departments where workspace_id = ${wsId} and status = 'ACTIVE' order by position limit 1`)[0]?.name ?? "";
    joanne = await signIn("joanne@rmit.local");
    jun = await signIn("jun@rmit.local");
    const form = await (await fetch(`${BASE}/api/book/${WS_SLUG}?key=${key0}`)).json();
    builtIn = form.template;
    priority = form.priorities?.[0]?.name ?? null;
  });

  afterAll(async () => {
    routeRepositoriesThrough(null);
    await sql?.end();
  });

  it("1. an admin publishes a routed form through the app: the link's key stays, the history records it", async () => {
    const before = (await sql`select count(*)::int n from public.booking_form_publications where workspace_id = ${wsId}`)[0].n;
    await servicesAs(joanne).booking.publishForm(wsId, routedTemplate("team"), "Stack test 1", { publishedBy: joanne.id });
    const [ws] = await sql`select booking_key, booking_form_published_by, booking_form_name from public.workspaces where id = ${wsId}`;
    expect(ws.booking_key).toBe(key0);
    expect(ws.booking_form_published_by).toBe(joanne.id);
    expect(ws.booking_form_name).toBe("Stack test 1");
    const after = await sql`select name, published_by from public.booking_form_publications where workspace_id = ${wsId} order by published_at desc`;
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({ name: "Stack test 1", published_by: joanne.id });
    // The public form names the boards its rules use, and only those.
    const form = await (await fetch(`${BASE}/api/book/${WS_SLUG}?key=${key0}`)).json();
    expect((form.boards as Array<{ name: string }>).map((b) => b.name).sort()).toEqual(["DOOH Production", "Open Day 2026"]);
  });

  it("2. public bookings through the link land where the rules say, whole", async () => {
    const cases: Array<[string, string[], string]> = [
      ["exact pair", ["Print", "Key Visual"], OPEN_DAY],
      ["exact pair, other order", ["Key Visual", "Print"], OPEN_DAY],
      ["print alone", ["Print"], DOOH],
      ["print and more", ["Print", "Publication"], DOOH],
      ["pair plus more is not exact", ["Print", "Key Visual", "Publication"], DOOH],
      ["no rule: the team's board", ["Publication"], BRAND_BOARD],
      ["key visual alone: the team's board", ["Key Visual"], BRAND_BOARD],
    ];
    for (const [label, picks, board] of cases) {
      const { status, body } = await bookPublic(`Stack: ${label}`, picks);
      expect(status, label).toBe(201);
      expect(await boardOf(body.itemId), label).toBe(board);
      expect(body.boardId, label).toBe(board);
      expect(await landedWhole(body.itemId, board), label).toBe(true);
    }
  });

  it("3. refused before routing: no work type, an invented one, the wrong key", async () => {
    expect((await bookPublic("Stack: none", [])).status).toBe(400);
    expect((await bookPublic("Stack: invented", ["Invented"])).status).toBe(400);
    expect((await bookPublic("Stack: wrong key", ["Print"], "notthekey000000000000000")).status).toBe(403);
  });

  it("4. a signed-in member, without the key, routes the same", async () => {
    const { status, body } = await bookPublic("Stack: member", ["Print"], null, jun.token);
    expect(status).toBe(201);
    expect(await boardOf(body.itemId)).toBe(DOOH);
  });

  it("5. the stakeholder portal routes the same", async () => {
    const res = await fetch(`${BASE}/api/portal/${PORTAL_TOKEN}/book`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionKey: `stack-${Date.now()}`, request: request("Stack: portal", ["Key Visual", "Print"]) }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBeLessThan(300);
    const itemId = body.itemId ?? body.receipt?.itemId;
    expect(await boardOf(itemId)).toBe(OPEN_DAY);
  });

  let queued: string[] = [];
  it("6. with Otherwise set to the queue, unmatched bookings wait on Task Allocation", async () => {
    await servicesAs(joanne).booking.publishForm(wsId, routedTemplate("allocation"), "Stack test 2", { publishedBy: joanne.id });
    for (let i = 0; i < 4; i++) {
      const { status, body } = await bookPublic(`Stack: queued ${i}`, ["Publication"]);
      expect(status).toBe(201);
      expect(await boardOf(body.itemId)).toBe(TA);
      queued.push(body.itemId);
    }
    expect((await sql`select booking_key from public.workspaces where id = ${wsId}`)[0].booking_key).toBe(key0);
  });

  it("7. allocating: refused unseated, then a seated member allocates to a board they only view, never to one they cannot see", async () => {
    // Not on Task Allocation: refused.
    expect((await allocate(jun.token, queued[0]!, OPEN_DAY)).status).toBe(403);

    // An admin seats Jun as an editor, through the app; Jun now follows the whole board.
    await servicesAs(joanne).boards.setMember(TA, jun.id, "EDITOR", joanne.id, "Jun");
    const follow = await sql`select events from public.subscriptions where user_id = ${jun.id} and board_id = ${TA} and item_id is null`;
    expect(follow[0]?.events).toEqual(["status", "fields", "updates", "assets", "tasks"]);

    // To a board Jun only views: allowed, and it arrives whole, moved by Jun.
    const moved = await allocate(jun.token, queued[0]!, OPEN_DAY);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await boardOf(queued[0]!)).toBe(OPEN_DAY);
    expect(await landedWhole(queued[0]!, OPEN_DAY)).toBe(true);
    const act = await sql`select a.event_type, a.actor_id from public.activities a where a.item_id = ${queued[0]!} order by a.created_at desc limit 1`;
    expect(act[0]).toMatchObject({ event_type: "ITEM_MOVED", actor_id: jun.id });

    // A board Jun cannot see: refused, and the request stays queued.
    const prev = (await sql`select visibility, follows_team from public.boards where id = ${CREATIVE}`)[0];
    await sql`update public.boards set visibility = 'PRIVATE', follows_team = false where id = ${CREATIVE}`;
    try {
      expect((await allocate(jun.token, queued[1]!, CREATIVE)).status).toBe(403);
      expect(await boardOf(queued[1]!)).toBe(TA);
    } finally {
      await sql`update public.boards set visibility = ${prev.visibility}, follows_team = ${prev.follows_team} where id = ${CREATIVE}`;
    }

    // Something not on Task Allocation cannot be allocated.
    expect((await allocate(jun.token, queued[0]!, DOOH)).status).toBe(400);

    // An admin allocates too.
    expect((await allocate(joanne.token, queued[2]!, DOOH)).status).toBe(200);
    expect(await boardOf(queued[2]!)).toBe(DOOH);

    // Off the board again: the follow goes, and allocating is refused.
    await servicesAs(joanne).boards.removeMember(TA, jun.id, joanne.id, "Jun");
    expect((await sql`select count(*)::int n from public.subscriptions where user_id = ${jun.id} and board_id = ${TA} and item_id is null`)[0].n).toBe(0);
    expect((await allocate(jun.token, queued[3]!, DOOH)).status).toBe(403);
  });

  it("8. a rule's board archived falls back to the team's board, then the queue; re-publishing a past form brings its routing back", async () => {
    // Back to the first form, from the history, through the app.
    const services = servicesAs(joanne);
    const past = await services.booking.listPublications(wsId);
    const first = past.find((p) => p.name === "Stack test 1")!;
    await services.booking.republish(wsId, first.id, joanne.id);
    expect((await bookPublic("Stack: back to first", ["Publication"])).body.boardId).toBe(BRAND_BOARD);

    await sql`update public.boards set archived_at = now() where id = ${DOOH}`;
    try {
      const fellBack = await bookPublic("Stack: DOOH archived", ["Print"]);
      expect(await boardOf(fellBack.body.itemId)).toBe(BRAND_BOARD);
      await sql`update public.teams set booking_board_id = null where id = ${BRAND}`;
      const queuedNow = await bookPublic("Stack: no team board either", ["Print"]);
      expect(await boardOf(queuedNow.body.itemId)).toBe(TA);
    } finally {
      await sql`update public.boards set archived_at = null where id = ${DOOH}`;
      await sql`update public.teams set booking_board_id = ${BRAND_BOARD} where id = ${BRAND}`;
    }
  });

  it("9. the link's key changed by nothing above; only regenerating it shuts the old link", async () => {
    expect((await sql`select booking_key from public.workspaces where id = ${wsId}`)[0].booking_key).toBe(key0);
    await servicesAs(joanne).workspace.regenerateBookingKey(wsId);
    try {
      expect((await bookPublic("Stack: old key after regenerating", ["Print"])).status).toBe(403);
    } finally {
      await sql`update public.workspaces set booking_key = ${key0} where id = ${wsId}`;
    }
    expect((await bookPublic("Stack: key restored", ["Print"])).status).toBe(201);
  });
});
