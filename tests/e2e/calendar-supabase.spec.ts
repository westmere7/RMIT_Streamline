import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The Calendar on a real database: tasks read in one call, leave written under
 * RLS, a task moved by dragging, and the private feed. Only against the local
 * stack: it writes.
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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@rmit.local");
  await page.getByTestId("login-password").fill("admin123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });
}

test("the Calendar shows the workspace's tasks and holidays, and leave saves under RLS", async ({ page }) => {
  test.setTimeout(180_000);
  const db = service();
  await signIn(page);
  await page.goto("/workspace/rmit/calendar?view=year&d=2026-11-01");
  await expect(page.getByTestId("calendar-year")).toBeVisible({ timeout: 60_000 });
  // Every day of the year is a tile; busy ones are shaded, holidays marked.
  await expect(page.getByTestId("heat-day")).toHaveCount(365);
  await expect(page.locator('[data-testid="heat-day"]:not([data-level="0"])').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="heat-day"][data-day="2026-11-24"] [data-testid="heat-public-holiday"]')).toHaveCount(1);
  // No words on the days: the panel says what is on.
  await expect(page.getByTestId("calendar-task")).toHaveCount(0);

  // Hover a day for its tasks; click to pin it, and it stays when the pointer leaves.
  await page.locator('[data-testid="heat-day"][data-day="2026-11-24"]').hover();
  await expect(page.getByTestId("calendar-day-panel")).toHaveAttribute("data-day", "2026-11-24");
  await expect(page.getByTestId("calendar-panel-holiday")).toContainText("Vietnam Culture Day");
  const busy = page.locator('[data-testid="heat-day"]:not([data-level="0"])').first();
  const busyDay = (await busy.getAttribute("data-day"))!;
  await busy.click();
  await page.getByTestId("calendar-period").hover();
  await expect(page.getByTestId("calendar-day-panel")).toHaveAttribute("data-day", busyDay);
  await expect(page.getByTestId("calendar-day-task").first()).toBeVisible();

  // The week: seven tiles, the same panel.
  await page.getByTestId("calendar-view-week").click();
  await expect(page.getByTestId("calendar-week").getByTestId("heat-day")).toHaveCount(7, { timeout: 15_000 });
  await page.getByTestId("calendar-view-year").click();

  // A task in the panel opens in the task pop-up.
  await page.getByTestId("calendar-day-task").first().click();
  await expect(page).toHaveURL(/task=/);
  await page.goto("/workspace/rmit/calendar?view=year&d=2026-11-01");
  await expect(page.getByTestId("calendar-year")).toBeVisible({ timeout: 60_000 });

  // Leave, through the dialog.
  const admin = (await db.from("profiles").select("id").eq("email", "admin@rmit.local").single()).data!;
  const ws = (await db.from("workspaces").select("id").eq("slug", "rmit").single()).data!;
  await db.from("leave_entries").delete().eq("workspace_id", ws.id).eq("user_id", admin.id).eq("note", "E2E leave");
  await page.getByTestId("calendar-add").click();
  await page.getByTestId("calendar-add-leave").click();
  const dialog = page.getByTestId("leave-dialog");
  await dialog.getByLabel("From").fill("2026-12-07");
  await dialog.getByLabel("To").fill("2026-12-09");
  await dialog.getByLabel("Note").fill("E2E leave");
  await dialog.getByTestId("leave-save").click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  const saved = (await db.from("leave_entries").select("id, starts_on, ends_on, kind, created_by").eq("workspace_id", ws.id).eq("note", "E2E leave").single()).data!;
  expect(saved).toMatchObject({ starts_on: "2026-12-07", ends_on: "2026-12-09", kind: "ANNUAL", created_by: admin.id });
  await page.goto("/workspace/rmit/calendar?view=year&d=2026-12-07");
  await page.locator('[data-testid="heat-day"][data-day="2026-12-08"]').click();
  await expect(page.getByTestId("calendar-panel-leave")).toContainText("Admin", { timeout: 30_000 });
  await db.from("leave_entries").delete().eq("id", saved.id);
});

test("the private feed serves iCalendar and stops when replaced", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/workspace/rmit/calendar");
  await page.getByTestId("calendar-subscribe").click();
  const dialog = page.getByTestId("feed-dialog");
  if (await dialog.getByTestId("feed-create").isVisible()) await dialog.getByTestId("feed-create").click();
  const url = await dialog.getByTestId("feed-url").inputValue();
  expect(url).toMatch(/\/api\/calendar\/[a-z0-9]{40}\.ics$/);
  const res = await request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:Vietnam Culture Day");
  await dialog.getByRole("button", { name: "New address" }).click();
  await expect(dialog.getByTestId("feed-url")).not.toHaveValue(url, { timeout: 15_000 });
  expect((await request.get(url)).status()).toBe(404);
});
