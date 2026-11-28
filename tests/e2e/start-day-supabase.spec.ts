import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { row } from "./helpers";

/**
 * Start day on a real database: Start day and Due date fill an empty
 * timeline, a change that would overwrite another date asks first (Update and
 * Keep), the first move into progress sets an empty Start day, and the
 * dashboard and calendar read it. Only against the local stack: it writes.
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
const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const BOARD = "/workspace/rmit/boards/rmitinerary-2026";
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = local(new Date());
const TOMORROW = local(new Date(Date.now() + 86_400_000));

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@rmit.local");
  await page.getByTestId("login-password").fill("admin123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });
}

async function boardColumns(db: SupabaseClient) {
  const board = (await db.from("boards").select("id").eq("slug", "rmitinerary-2026").single()).data!;
  const cols = (await db.from("board_columns").select("id, type, name, role, removed").eq("board_id", board.id)).data!;
  const of = (type: string) => cols.find((c) => c.type === type && !c.removed)!;
  return { boardId: board.id as string, start: of("START_DATE"), due: of("DATE"), timeline: of("TIMELINE"), status: of("STATUS") };
}

async function valuesOf(db: SupabaseClient, itemId: string, ids: { start: { id: string }; due: { id: string }; timeline: { id: string } }) {
  const rows = (await db.from("item_column_values").select("column_id, value_json").eq("item_id", itemId)).data!;
  const v = (id: string) => rows.find((r) => r.column_id === id)?.value_json as Record<string, string | null> | undefined;
  return { start: v(ids.start.id)?.date ?? null, due: v(ids.due.id)?.date ?? null, timeline: v(ids.timeline.id) ? `${v(ids.timeline.id)!.start ?? ""}|${v(ids.timeline.id)!.end ?? ""}` : null };
}

async function pick(page: Page, itemName: string, testId: string, button: "Today" | "Tomorrow") {
  await row(page, itemName).getByTestId(testId).click();
  // The picker closes itself on a pick, as it does for a person; an Escape here would answer the date question "Keep".
  await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: button, exact: true }).click();
  await expect(page.locator("[data-radix-popper-content-wrapper]")).toHaveCount(0);
}

test("Start day and Due date keep the Timeline in step, asking before they overwrite", async ({ page }) => {
  test.setTimeout(240_000);
  const db = service();
  const cols = await boardColumns(db);
  const items = (await db.from("items").select("id, name").eq("board_id", cols.boardId).is("parent_item_id", null).is("archived_at", null).order("position").limit(2)).data!;
  const [task] = items;
  const clear = async (id: string) => db.from("item_column_values").delete().eq("item_id", id).in("column_id", [cols.start.id, cols.due.id, cols.timeline.id]);
  const before = (await db.from("item_column_values").select("*").eq("item_id", task!.id).in("column_id", [cols.start.id, cols.due.id, cols.timeline.id])).data!;
  await clear(task!.id);
  try {
    await signIn(page);
    await page.goto(BOARD);
    await expect(row(page, task!.name)).toBeVisible({ timeout: 60_000 });
    await expect(row(page, task!.name).getByTestId("start-date-cell")).toBeVisible();

    // Both ends set: filling the empty timeline is offered, not done unasked.
    await pick(page, task!.name, "start-date-cell", "Today");
    await pick(page, task!.name, "date-cell", "Tomorrow");
    await expect(page.getByTestId("date-sync-confirm")).toContainText("empty", { timeout: 10_000 });
    await page.getByRole("button", { name: "Leave empty" }).click();
    await expect.poll(async () => (await valuesOf(db, task!.id, cols)).due, { timeout: 20_000 }).toBe(TOMORROW);
    expect((await valuesOf(db, task!.id, cols)).timeline).toBeNull();
    // The Timeline picker then offers the two dates, and the question comes again from a new start.
    await row(page, task!.name).locator('[aria-label^="Timeline"]').first().click();
    await expect(page.getByTestId("timeline-picker").getByTestId("date-suggestion")).toContainText("Start day → Due date");
    await page.getByTestId("timeline-picker").getByTestId("date-suggestion").click();
    await expect.poll(async () => (await valuesOf(db, task!.id, cols)).timeline, { timeout: 20_000 }).toBe(`${TODAY}|${TOMORROW}`);
    await expect(page.getByTestId("date-sync-confirm")).toHaveCount(0);

    // A new start that disagrees with the timeline asks. Keep leaves the timeline.
    await pick(page, task!.name, "start-date-cell", "Tomorrow");
    await expect(page.getByTestId("date-sync-confirm")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("date-sync-confirm")).toContainText("Timeline");
    await page.getByRole("button", { name: "Keep" }).click();
    await expect.poll(async () => (await valuesOf(db, task!.id, cols)).start, { timeout: 20_000 }).toBe(TOMORROW);
    expect((await valuesOf(db, task!.id, cols)).timeline).toBe(`${TODAY}|${TOMORROW}`);

    // Asked again, Update brings the timeline in line.
    await pick(page, task!.name, "start-date-cell", "Today");
    await expect(page.getByTestId("date-sync-confirm")).toHaveCount(0);
    await pick(page, task!.name, "start-date-cell", "Tomorrow");
    await expect(page.getByTestId("date-sync-confirm")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Update" }).click();
    await expect.poll(async () => (await valuesOf(db, task!.id, cols)).timeline, { timeout: 20_000 }).toBe(`${TOMORROW}|${TOMORROW}`);
  } finally {
    await clear(task!.id);
    if (before.length) await db.from("item_column_values").insert(before.map(({ id: _id, ...rest }) => rest));
  }
});

test("the first move into progress sets an empty Start day, and the dashboard and calendar read it", async ({ page }) => {
  test.setTimeout(240_000);
  const db = service();
  const cols = await boardColumns(db);
  const task = (await db.from("items").select("id, name").eq("board_id", cols.boardId).is("parent_item_id", null).is("archived_at", null).order("position").range(2, 2).single()).data!;
  const kept = (await db.from("item_column_values").select("*").eq("item_id", task.id).in("column_id", [cols.start.id, cols.status.id, cols.timeline.id, cols.due.id])).data!;
  await db.from("item_column_values").delete().eq("item_id", task.id).in("column_id", [cols.start.id, cols.status.id, cols.timeline.id]);
  try {
    await signIn(page);
    await page.goto(BOARD);
    await expect(row(page, task.name)).toBeVisible({ timeout: 60_000 });
    await row(page, task.name).getByTestId("status-cell").click();
    await page.getByRole("option", { name: "In Progress" }).click();
    // With a deadline already set, the timeline that would follow is offered; left empty here.
    const offer = page.getByRole("button", { name: "Leave empty" });
    await offer.click({ timeout: 10_000 }).catch(() => undefined);
    await expect.poll(async () => (await valuesOf(db, task.id, cols)).start, { timeout: 30_000 }).not.toBeNull();
    const start = (await valuesOf(db, task.id, cols)).start!;
    const vietnam = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect(start).toBe(vietnam);
    // The board shows it once realtime has brought it.
    await expect(row(page, task.name).getByTestId("start-date-cell")).not.toHaveAttribute("aria-label", /not set/, { timeout: 30_000 });

    await page.goto("/workspace/rmit/dashboard");
    await expect(page.getByTestId("dashboard-production")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("dashboard-waiting")).toBeVisible();

    // A start and a later deadline with no timeline: the calendar runs the task from one to the other.
    await db.from("item_column_values").delete().eq("item_id", task.id).eq("column_id", cols.timeline.id);
    const due = new Date(Date.parse(`${start}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    await db.from("item_column_values").upsert({ item_id: task.id, column_id: cols.due.id, board_id: cols.boardId, value_json: { type: "DATE", date: due } }, { onConflict: "item_id,column_id" });
    await page.goto(`/workspace/rmit/calendar?view=year&d=${start}`);
    // Active on every day from its start to its deadline: in the panel of a day in between.
    const middle = new Date(Date.parse(`${start}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
    await page.locator(`[data-testid="heat-day"][data-day="${middle}"]`).click();
    const panelRow = page.locator(`[data-testid="calendar-day-task"][data-item-id="${task.id}"]`);
    await expect(panelRow).toBeVisible({ timeout: 30_000 });
    await expect(panelRow).toContainText("4 days");
  } finally {
    await db.from("item_column_values").delete().eq("item_id", task.id).in("column_id", [cols.start.id, cols.status.id, cols.timeline.id, cols.due.id]);
    if (kept.length) await db.from("item_column_values").insert(kept.map(({ id: _id, ...rest }) => rest));
  }
});
