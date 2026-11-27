import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Sending a booking back, on a real database (v0.168.0): the server routes,
 * who may call them, what each person's own session can read (policies/0040),
 * the requester's link answered without a session, two answers racing, recall,
 * and the board showing it. Only against the local stack: it writes.
 */
const PROVIDER = process.env.E2E_PROVIDER ?? process.env.PW_PROVIDER ?? "local";
test.skip(PROVIDER !== "supabase", "Supabase only");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^['"]|['"]$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (PROVIDER === "supabase" && !URL_.includes("127.0.0.1")) throw new Error("Refusing: this spec writes to the database and runs only against the local stack");

const RUN = Date.now().toString(36).slice(-5);
const TITLE = `E2E send back ${RUN}`;
const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = (): SupabaseClient => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

async function signedIn(email: string, password: string): Promise<{ client: SupabaseClient; jwt: string }> {
  const client = anon();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Could not sign in ${email}: ${error?.message}`);
  return { client, jwt: data.session.access_token };
}

const bookingRequest = (overrides: Record<string, unknown> = {}) => ({
  requesterName: "Priya Nair",
  requesterEmail: `priya.${RUN}@example.com`,
  department: null as string | null,
  title: TITLE,
  brief: "",
  assetTypes: [],
  assets: [{ name: "Pull-up banner", quantity: 2, spec: null, assetType: null }],
  serviceTypeId: "svc-design",
  subServices: [],
  teamId: null,
  dueDate: "2026-12-01",
  priority: "High",
  referenceUrl: null,
  answers: {
    "design-what": { kind: "text", text: "Banners for graduation." },
    "design-specs": { kind: "text", text: "Pull-up." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
  ...overrides,
});

const sendBack = (request: APIRequestContext, jwt: string | null, body: unknown) =>
  request.post("/api/booking-send-back", { data: body, headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });

test("send back over the real routes: who may, what each can read, answering once, recalling", async ({ page, request }) => {
  test.setTimeout(300_000);
  const db = service();
  const admin = await signedIn("admin@rmit.local", "admin123");
  // Somebody in the workspace who cannot see Task Allocation.
  const member = await signedIn("duc@rmit.local", "Password123!");
  let itemId = "";
  // The Contents portal, switched on for this test and put back as it was.
  const portal = (await db.from("department_portals").select("id, token, enabled").eq("workspace_id", (await db.from("workspaces").select("id").eq("slug", "contents").single()).data!.id).is("department_id", null).single()).data!;
  const portalBoard = (revision: string | null = null) => request.post(`/api/portal/${portal.token}/board`, { data: { range: "all", revision } });

  try {
    if (!portal.enabled) await db.from("department_portals").update({ enabled: true }).eq("id", portal.id);
    // A public booking, through the server, as the old link with the workspace's key. In the
    // Contents workspace: the one test data may go to.
    const workspace = (await db.from("workspaces").select("id, booking_key").eq("slug", "contents").single()).data!;
    const department = (await db.from("stakeholder_departments").select("name").eq("workspace_id", workspace.id).eq("status", "ACTIVE").limit(1).single()).data!.name as string;
    const booked = await request.post("/api/book/contents", { data: { key: workspace.booking_key, request: bookingRequest({ department }) } });
    expect(booked.status(), await booked.text()).toBe(201);
    itemId = (await booked.json()).itemId as string;
    const stored = (await db.from("booking_requests").select("request").eq("item_id", itemId).single()).data!;
    expect(stored.request.title).toBe(TITLE);

    // Who may send it back: nobody without a session, nobody who cannot edit the task.
    expect((await sendBack(request, null, { itemId, note: "Which campus?" })).status()).toBe(401);
    expect((await sendBack(request, member.jwt, { itemId, note: "Which campus?" })).status()).toBe(403);
    expect(await db.from("booking_sendbacks").select("id", { count: "exact", head: true }).eq("item_id", itemId).then((r) => r.count)).toBe(0);

    const sent = await sendBack(request, admin.jwt, { itemId, note: "Which campus, and how many?" });
    expect(sent.status(), await sent.text()).toBe(200);
    const first = await sent.json();
    expect(first.token).toMatch(/^[a-z0-9]{32}$/);
    // A second while it waits is refused.
    expect((await sendBack(request, admin.jwt, { itemId, note: "Again" })).status()).toBe(409);

    // Each person's own session: the editor reads it, token and all; the member does not; a visitor cannot ask.
    const asAdmin = await admin.client.from("booking_sendbacks").select("token").eq("item_id", itemId);
    expect(asAdmin.data?.map((r) => r.token)).toEqual([first.token]);
    const asMember = await member.client.from("booking_sendbacks").select("token").eq("item_id", itemId);
    expect(asMember.data ?? []).toEqual([]);
    expect((await anon().from("booking_sendbacks").select("token").eq("item_id", itemId)).error).not.toBeNull();
    expect((await admin.client.from("booking_requests").select("item_id").eq("item_id", itemId)).error).not.toBeNull();
    // And nobody's session can write it, not even the editor's.
    const forged = await admin.client.from("booking_sendbacks").update({ cancelled_at: new Date().toISOString() }).eq("item_id", itemId).select("id");
    expect(forged.error !== null || (forged.data ?? []).length === 0).toBe(true);

    // The task: Waiting, an update with the note, the journey's step.
    const status = async () => {
      const column = (await db.from("board_columns").select("id, settings").eq("board_id", (await db.from("items").select("board_id").eq("id", itemId).single()).data!.board_id).eq("type", "STATUS").limit(1).single()).data!;
      const value = (await db.from("item_column_values").select("value_json").eq("item_id", itemId).eq("column_id", column.id).maybeSingle()).data;
      return (value?.value_json as { labelId?: string } | undefined)?.labelId ?? null;
    };
    expect(await status()).toBe("waiting");
    const comments = async () => ((await db.from("comments").select("body").eq("item_id", itemId)).data ?? []).map((c) => c.body as string);
    expect((await comments()).some((b) => b.includes("Which campus, and how many?"))).toBe(true);
    const events = async () => ((await db.from("activities").select("event_type, created_at").eq("item_id", itemId).order("created_at")).data ?? []).map((a) => a.event_type as string).filter((t) => t.startsWith("BOOKING_"));
    expect(await events()).toEqual(["BOOKING_SENT_BACK"]);

    // The board shows it: Sent back, locked.
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@rmit.local");
    await page.getByTestId("login-password").fill("admin123");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });
    await page.goto("/workspace/contents/boards/task-allocation");
    const row = page.locator(`[data-item-name="${TITLE}"]`).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row.getByTestId("sent-back-chip")).toBeVisible({ timeout: 30_000 });

    // The Guest portal: the task listed as sent back, the link nowhere in what it sends.
    const waiting = await portalBoard();
    expect(waiting.status(), await waiting.text()).toBe(200);
    const waitingBody = await waiting.json();
    expect(waitingBody.sentBack?.ids).toContain(itemId);
    expect(JSON.stringify(waitingBody)).not.toContain(first.token);
    const heldRevision = waitingBody.revision as string;

    // The requester's link, with no session: the form, filled in.
    const opened = await request.get(`/api/booking-resubmit/${first.token}`);
    expect(opened.status(), await opened.text()).toBe(200);
    const form = await opened.json();
    expect(form.note).toBe("Which campus, and how many?");
    expect(form.prefill.title).toBe(TITLE);
    expect(form.prefill.requesterEmail).toBe(`priya.${RUN}@example.com`);
    expect((await request.get(`/api/booking-resubmit/${"x".repeat(32)}`)).status()).toBe(404);
    expect((await request.get("/api/booking-resubmit/not-a-token")).status()).toBe(404);

    // Answered: twice at once, and exactly one goes through.
    const answer = { ...form.prefill, dueDate: "2026-12-15", answers: { ...form.prefill.answers, "design-what": { kind: "text", text: "Four banners for Saigon South." } } };
    const [a, b] = await Promise.all([
      request.post(`/api/booking-resubmit/${first.token}`, { data: { request: answer, reply: "Saigon South." } }),
      request.post(`/api/booking-resubmit/${first.token}`, { data: { request: answer, reply: "Saigon South." } }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 410]);
    expect((await request.get(`/api/booking-resubmit/${first.token}`)).status()).toBe(410);
    expect(await status()).not.toBe("waiting");
    expect((await comments()).filter((c) => c.includes("again with more information")).length).toBe(1);
    expect(await events()).toEqual(["BOOKING_SENT_BACK", "BOOKING_RESUBMITTED"]);
    const after = (await db.from("booking_requests").select("request").eq("item_id", itemId).single()).data!;
    expect(after.request.dueDate).toBe("2026-12-15");
    expect((await db.from("booking_sendbacks").select("resubmitted_at").eq("token", first.token).single()).data!.resubmitted_at).not.toBeNull();
    await expect(row.getByTestId("sent-back-chip")).toHaveCount(0, { timeout: 30_000 });
    // The portal moved on too: the revision it held is stale, and the task is no longer sent back.
    const answered = await (await portalBoard(heldRevision)).json();
    expect(answered.unchanged).toBeFalsy();
    expect(answered.sentBack?.ids ?? []).not.toContain(itemId);

    // Recalled: a second round, then the team recalls it and the link stops.
    const second = await (await sendBack(request, admin.jwt, { itemId, note: "And the size?" })).json();
    expect((await request.post("/api/booking-send-back/cancel", { data: { itemId } })).status()).toBe(401);
    expect((await request.post("/api/booking-send-back/cancel", { data: { itemId }, headers: { Authorization: `Bearer ${member.jwt}` } })).status()).toBe(403);
    expect((await request.post("/api/booking-send-back/cancel", { data: { itemId }, headers: { Authorization: `Bearer ${admin.jwt}` } })).status()).toBe(200);
    expect((await request.get(`/api/booking-resubmit/${second.token}`)).status()).toBe(410);
    expect(await events()).toEqual(["BOOKING_SENT_BACK", "BOOKING_RESUBMITTED", "BOOKING_SENT_BACK", "BOOKING_SEND_BACK_CANCELLED"]);
    const rounds = (await db.from("booking_sendbacks").select("sent_at, resubmitted_at, cancelled_at").eq("item_id", itemId).order("sent_at")).data ?? [];
    expect(rounds.length).toBe(2);
    expect(rounds[0]!.resubmitted_at).not.toBeNull();
    expect(rounds[1]!.cancelled_at).not.toBeNull();
  } finally {
    if (!portal.enabled) await db.from("department_portals").update({ enabled: false }).eq("id", portal.id);
    if (itemId) await db.from("items").delete().eq("id", itemId);
    await db.from("items").delete().eq("name", TITLE);
  }
});

test("the same round trip through the app: the panel's Send back, and the requester's page with no session", async ({ page, browser, request }) => {
  test.setTimeout(300_000);
  const db = service();
  const title = `${TITLE} UI`;
  let itemId = "";
  try {
    const workspace = (await db.from("workspaces").select("id, booking_key").eq("slug", "contents").single()).data!;
    const department = (await db.from("stakeholder_departments").select("name").eq("workspace_id", workspace.id).eq("status", "ACTIVE").limit(1).single()).data!.name as string;
    const booked = await request.post("/api/book/contents", { data: { key: workspace.booking_key, request: bookingRequest({ department, title, requesterEmail: `priya.ui.${RUN}@example.com` }) } });
    expect(booked.status(), await booked.text()).toBe(201);
    itemId = (await booked.json()).itemId as string;

    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@rmit.local");
    await page.getByTestId("login-password").fill("admin123");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });
    await page.goto("/workspace/contents/boards/task-allocation");
    const row = page.locator(`[data-item-name="${title}"]`).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.hover();
    await row.getByRole("button", { name: new RegExp(`^Open ${title}`) }).first().click({ force: true });
    const panel = page.getByTestId("item-panel");
    await expect(panel.getByTestId("send-back-open")).toBeVisible({ timeout: 30_000 });
    await panel.getByTestId("send-back-open").click();
    const dialog = page.getByTestId("send-back-dialog");
    await dialog.getByTestId("send-back-note").fill("Which campus?");
    await dialog.getByTestId("send-back-submit").click();
    const link = await dialog.getByTestId("send-back-link").inputValue({ timeout: 30_000 });
    expect(link).toMatch(/\/contents\/booking\/r\/[a-z0-9]{32}$/);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(panel.getByTestId("send-back-waiting")).toContainText("Which campus?", { timeout: 30_000 });
    await expect(row.getByTestId("sent-back-chip")).toBeVisible({ timeout: 30_000 });

    // The requester, in a browser with nobody signed in.
    const outside = await browser.newContext();
    const requester = await outside.newPage();
    await requester.goto(new URL(link, "http://localhost:3300").href.replace(/^https?:\/\/[^/]+/, page.url().match(/^https?:\/\/[^/]+/)![0]));
    await expect(requester.getByTestId("resubmit-note")).toContainText("Which campus?", { timeout: 60_000 });
    await expect(requester.getByTestId("booking-title")).toHaveValue(title);
    await requester.getByTestId("resubmit-reply").fill("Saigon South.");
    await requester.getByTestId("booking-next").click();
    await requester.getByTestId("booking-answer-design-what").fill("Four banners for Saigon South.");
    await requester.getByTestId("booking-next").click();
    await requester.getByTestId("booking-skip-assets").click();
    await requester.getByTestId("booking-submit").click();
    await expect(requester.getByTestId("booking-receipt")).toContainText("Sent. Thank you.", { timeout: 60_000 });
    await outside.close();

    // Back on the board, without a reload: unlocked as the change arrives.
    await expect(row.getByTestId("sent-back-chip")).toHaveCount(0, { timeout: 60_000 });
    const events = ((await db.from("activities").select("event_type").eq("item_id", itemId).order("created_at")).data ?? []).map((a) => a.event_type as string).filter((t) => t.startsWith("BOOKING_"));
    expect(events).toEqual(["BOOKING_SENT_BACK", "BOOKING_RESUBMITTED"]);
    const comments = ((await db.from("comments").select("body").eq("item_id", itemId)).data ?? []).map((c) => c.body as string);
    expect(comments.some((c) => c.includes("Saigon South.") && c.includes("Changed: Brief.")), JSON.stringify(comments)).toBe(true);
  } finally {
    if (itemId) await db.from("items").delete().eq("id", itemId);
    await db.from("items").delete().eq("name", title);
  }
});
