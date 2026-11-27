import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Ten people on one board at once, against the DISPOSABLE Supabase stack: the
 * same task added, edited, updated, ticked and moved by everyone in the same
 * moment, through the app's own pages. After each round the database must hold
 * every edit (nothing lost, nothing doubled), and every one of the ten screens
 * must come to show the same thing without a reload. Then the server routes are
 * raced: the same task sent back, and allocated, five times at once.
 *
 * Run from the stack's worktree, against a production build if you can:
 *   E2E_PROVIDER=supabase SKIP_DB_MIGRATE=1 npx playwright test -c <config at :3300> tests/e2e/stress-supabase.spec.ts
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
const TAG = `STRESS ${RUN}`;
/** Everyone who can edit DOOH Production on the stack. */
const PEOPLE: Array<[string, string]> = [
  ["admin@rmit.local", "admin123"],
  ["danh@rmit.local", "Password123!"],
  ["duc@rmit.local", "Password123!"],
  ["emily@rmit.local", "Password123!"],
  ["hil@rmit.local", "Password123!"],
  ["linh@rmit.local", "Password123!"],
  ["minh@rmit.local", "Password123!"],
  ["sarah@rmit.local", "Password123!"],
  ["thao@rmit.local", "Password123!"],
  ["tuyet@rmit.local", "Password123!"],
];
const CONVERGE = { timeout: 45_000 };

const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function signedIn(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 90_000 });
  return page;
}

async function jwtOf(email: string, password: string): Promise<string> {
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`${email}: ${error?.message}`);
  return data.session.access_token;
}

const row = (page: Page, name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`).first();

test("ten people at once: nothing lost, nothing doubled, every screen agrees", async ({ browser, request }) => {
  test.setTimeout(30 * 60_000);
  const db = service();
  const workspace = (await db.from("workspaces").select("id").eq("slug", "rmit").single()).data!;
  const board = (await db.from("boards").select("id, slug").eq("workspace_id", workspace.id).eq("slug", "dooh-production").single()).data!;
  const groups = (await db.from("board_groups").select("id, name, position").eq("board_id", board.id).order("position")).data!;
  const [home, away] = [groups[0]!, groups[1]!];
  const status = (await db.from("board_columns").select("id, settings").eq("board_id", board.id).eq("type", "STATUS").order("position").limit(1).single()).data!;
  const labels = (status.settings as { labels: Array<{ id: string; name: string }> }).labels;
  const names = PEOPLE.map((_, i) => `${TAG} A${i}`);
  const pages: Page[] = [];
  const timings: Record<string, number> = {};
  const clock = async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      timings[label] = Date.now() - t;
    }
  };

  try {
    // Everyone signed in and on the board.
    for (const [email, password] of PEOPLE) pages.push(await signedIn(browser, email, password));
    await Promise.all(pages.map(async (page) => {
      await page.goto(`/workspace/rmit/boards/${board.slug}`);
      await expect(page.getByTestId(`add-item-${home.name}`)).toBeVisible({ timeout: 90_000 });
    }));

    // 1. Ten tasks added to the same group in the same moment.
    await clock("1 add", () => Promise.all(pages.map(async (page, i) => {
      const add = page.getByTestId(`add-item-${home.name}`);
      await add.fill(names[i]!);
      await add.press("Enter");
    })));
    await expect.poll(async () => ((await db.from("items").select("id").like("name", `${TAG} A%`)).data ?? []).length, CONVERGE).toBe(10);
    const added = (await db.from("items").select("id, name, group_id, position").like("name", `${TAG} A%`)).data!;
    expect(new Set(added.map((i) => i.name)).size).toBe(10);
    expect(added.every((i) => i.group_id === home.id)).toBe(true);
    await clock("1 converge", () => Promise.all(pages.map((page) => Promise.all(names.map((name) => expect(row(page, name)).toBeVisible(CONVERGE))))));
    const idOf = Object.fromEntries(added.map((i) => [i.name, i.id as string]));

    // 2. Everyone sets a different status on the same task at once: one wins, everyone shows it.
    const contested = names[0]!;
    await clock("2 contested", () => Promise.all(pages.map(async (page, i) => {
      const cell = row(page, contested).locator('button[data-testid="status-cell"]');
      await cell.click();
      await page.getByRole("option", { name: labels[i % labels.length]!.name, exact: true }).click();
    })));
    await expect.poll(async () => ((await db.from("item_column_values").select("value_json").eq("item_id", idOf[contested]!).eq("column_id", status.id)).data ?? []).length, CONVERGE).toBe(1);
    const winner = async () => (((await db.from("item_column_values").select("value_json").eq("item_id", idOf[contested]!).eq("column_id", status.id).single()).data!.value_json as { labelId: string }).labelId);
    // Settled: the same for a few seconds running.
    let settled = await winner();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const now = await winner();
      if (now !== settled) {
        settled = now;
        i = -1;
      }
    }
    const winningName = labels.find((l) => l.id === settled)!.name;
    await clock("2 converge", () => Promise.all(pages.map((page) => expect(row(page, contested).getByTestId("status-cell")).toHaveAttribute("aria-label", new RegExp(`: ${winningName} for `), CONVERGE))));

    // 3. Everyone sets the status of their own task at once: every one of them lands.
    const own = (i: number) => labels[(i + 1) % labels.length]!;
    await clock("3 own", () => Promise.all(pages.map(async (page, i) => {
      if (i === 0) return; // task 0 is the contested one
      const cell = row(page, names[i]!).locator('button[data-testid="status-cell"]');
      await cell.click();
      await page.getByRole("option", { name: own(i).name, exact: true }).click();
    })));
    for (let i = 1; i < 10; i++) {
      await expect.poll(async () => ((await db.from("item_column_values").select("value_json").eq("item_id", idOf[names[i]!]!).eq("column_id", status.id).maybeSingle()).data?.value_json as { labelId?: string } | undefined)?.labelId, CONVERGE).toBe(own(i).id);
    }
    await clock("3 converge", () => Promise.all(pages.map((page) => Promise.all(names.slice(1).map((name, k) => expect(row(page, name).getByTestId("status-cell")).toHaveAttribute("aria-label", new RegExp(`: ${own(k + 1).name} for `), CONVERGE))))));

    // 4. Ten updates on one task at once.
    const talked = names[1]!;
    await clock("4 updates", () => Promise.all(pages.map(async (page, i) => {
      await row(page, talked).hover();
      await row(page, talked).getByRole("button", { name: `Open ${talked}` }).click();
      const panel = page.getByTestId("item-panel");
      await panel.getByRole("tab", { name: /Updates/ }).click();
      await panel.getByTestId("comment-composer").click();
      await page.keyboard.type(`${TAG} update from person ${i}`);
      await panel.getByTestId("comment-submit").click();
    })));
    await expect.poll(async () => ((await db.from("comments").select("id").eq("item_id", idOf[talked]!).like("body", `${TAG} update%`)).data ?? []).length, CONVERGE).toBe(10);
    await clock("4 converge", () => Promise.all(pages.map((page) => expect(page.getByTestId("item-panel").getByText(new RegExp(`${TAG} update from person`))).toHaveCount(10, CONVERGE))));
    await Promise.all(pages.map((page) => page.getByTestId("close-panel").click()));

    // 5. Ten asset lines on one task, each ticked by a different person at once.
    const ticked = names[2]!;
    const lines = Array.from({ length: 10 }, (_, i) => ({ item_id: idOf[ticked]!, board_id: board.id, name: `${TAG} line ${i}`, quantity: 1, position: i }));
    const creator = (await db.from("profiles").select("id").eq("email", "admin@rmit.local").single()).data!.id;
    const inserted = await db.from("item_assets").insert(lines.map((l) => ({ ...l, created_by: creator }))).select("id, name");
    if (inserted.error) throw new Error(inserted.error.message);
    await clock("5 ticks", () => Promise.all(pages.map(async (page, i) => {
      await row(page, ticked).hover();
      await row(page, ticked).getByRole("button", { name: `Open ${ticked}` }).click();
      const panel = page.getByTestId("item-panel");
      await panel.getByTestId("tab-assets").click();
      await panel.getByRole("checkbox", { name: `Mark ${TAG} line ${i} as done` }).click();
    })));
    await expect.poll(async () => ((await db.from("item_assets").select("id").eq("item_id", idOf[ticked]!).not("completed_at", "is", null)).data ?? []).length, CONVERGE).toBe(10);
    await clock("5 converge", () => Promise.all(pages.map((page) => expect(page.getByTestId("item-panel").getByRole("checkbox", { name: /as not done$/ })).toHaveCount(10, CONVERGE))));
    await Promise.all(pages.map((page) => page.getByTestId("close-panel").click()));

    // 6. Everyone moves their own task to the next group at once.
    await clock("6 moves", () => Promise.all(pages.map(async (page, i) => {
      await row(page, names[i]!).hover();
      await row(page, names[i]!).getByRole("button", { name: `More actions for ${names[i]}` }).click();
      await page.getByRole("menuitem", { name: "Move to group" }).click();
      await page.getByRole("menuitem", { name: away.name, exact: true }).click();
    })));
    await expect.poll(async () => ((await db.from("items").select("id").like("name", `${TAG} A%`).eq("group_id", away.id)).data ?? []).length, CONVERGE).toBe(10);
    expect(((await db.from("items").select("id").like("name", `${TAG} A%`)).data ?? []).length).toBe(10);
    const positions = ((await db.from("items").select("position").eq("group_id", away.id)).data ?? []).map((r) => r.position);
    expect(new Set(positions).size, "two tasks share a position in the group they were moved to").toBe(positions.length);
  } finally {
    console.log("TIMINGS (ms)", JSON.stringify(timings));
    await Promise.all(pages.map((page) => page.context().close().catch(() => undefined)));
    await db.from("items").delete().like("name", `${TAG}%`);
  }

  // 7. The server routes, raced: the same task sent back five times at once, and allocated five times at once.
  const contents = (await db.from("workspaces").select("id, booking_key").eq("slug", "contents").single()).data!;
  const department = (await db.from("stakeholder_departments").select("name").eq("workspace_id", contents.id).eq("status", "ACTIVE").limit(1).single()).data!.name as string;
  const jwt = await jwtOf("admin@rmit.local", "admin123");
  const book = async (title: string) => {
    const r = await request.post("/api/book/contents", {
      data: {
        key: contents.booking_key,
        request: {
          requesterName: "Stress", requesterEmail: `stress.${RUN}@example.com`, department, title, brief: "", assetTypes: [], assets: [],
          serviceTypeId: "svc-design", subServices: [], teamId: null, dueDate: "2026-12-01", priority: "High", referenceUrl: null,
          answers: { "design-what": { kind: "text", text: "x" }, "design-specs": { kind: "text", text: "x" }, "design-copy": { kind: "choice", values: ["Yes, final and approved"] } },
        },
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).itemId as string;
  };
  const raced: string[] = [];
  try {
    const target = await book(`${TAG} send-back race`);
    raced.push(target);
    const sends = await Promise.all(Array.from({ length: 5 }, (_, i) => request.post("/api/booking-send-back", { data: { itemId: target, note: `race ${i}` }, headers: { Authorization: `Bearer ${jwt}` } })));
    const codes = sends.map((r) => r.status()).sort();
    console.log("send-back race:", codes.join(","));
    expect(codes.filter((c) => c === 200).length, "exactly one send-back goes through").toBe(1);
    expect(codes.filter((c) => c >= 500).length, "a lost race is refused cleanly, not a server error").toBe(0);
    expect(((await db.from("booking_sendbacks").select("id").eq("item_id", target).is("resubmitted_at", null).is("cancelled_at", null)).data ?? []).length).toBe(1);
    expect(((await db.from("comments").select("id").eq("item_id", target).like("body", "Sent back%")).data ?? []).length, "one update for one send-back").toBe(1);

    const allocated = await book(`${TAG} allocation race`);
    raced.push(allocated);
    const teamBoards = ((await db.from("boards").select("id, name").eq("workspace_id", contents.id).is("system", null).is("archived_at", null).limit(5)).data ?? []);
    const allocs = await Promise.all(teamBoards.map((b) => request.post("/api/allocate", { data: { itemId: allocated, boardId: b.id }, headers: { Authorization: `Bearer ${jwt}` } })));
    const allocCodes = allocs.map((r) => r.status()).sort();
    console.log("allocation race:", allocCodes.join(","));
    const after = (await db.from("items").select("id, board_id").eq("id", allocated)).data ?? [];
    expect(after.length, "the task exists exactly once").toBe(1);
    expect(teamBoards.map((b) => b.id)).toContain(after[0]!.board_id);
    expect(allocCodes.filter((c) => c >= 500).length, "a lost race is refused cleanly, not a server error").toBe(0);
    const moves = ((await db.from("activities").select("id").eq("item_id", allocated).eq("event_type", "ITEM_MOVED")).data ?? []).length;
    console.log("allocation moves logged:", moves);
  } finally {
    for (const id of raced) await db.from("items").delete().eq("id", id);
  }
});
