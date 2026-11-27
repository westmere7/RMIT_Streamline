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
  await page.goto("/workspace/rmit/calendar?view=month&d=2026-11-01");
  await expect(page.getByTestId("calendar-month")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("calendar-task").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-day="2026-11-24"] [data-testid="calendar-holiday"]')).toContainText("Vietnam Culture Day");

  // Each view draws.
  for (const view of ["week", "agenda", "roster", "year"] as const) {
    await page.getByTestId(`calendar-view-${view}`).click();
    await expect(page.getByTestId(`calendar-${view}`)).toBeVisible({ timeout: 15_000 });
  }

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
  await page.goto("/workspace/rmit/calendar?view=roster&d=2026-12-07");
  await expect(page.locator(`[data-user-id="${admin.id}"] [data-testid="roster-leave"]`)).toHaveCount(3, { timeout: 30_000 });
  await db.from("leave_entries").delete().eq("id", saved.id);
});

test("a task dragged to another day moves its deadline", async ({ page }) => {
  test.setTimeout(180_000);
  const db = service();
  await signIn(page);
  await page.goto("/workspace/rmit/calendar?view=month&d=2026-12-01");
  await expect(page.getByTestId("calendar-task").first()).toBeVisible({ timeout: 60_000 });

  // A task with a plain deadline, on a weekday with an empty weekday after it.
  const chip = page.locator('[data-testid="calendar-day"] [data-testid="calendar-task"][draggable="true"]').first();
  const itemId = (await chip.getAttribute("data-item-id"))!;
  const fromDay = (await chip.locator("xpath=ancestor::*[@data-testid='calendar-day']").getAttribute("data-day"))!;
  const rows = (await db.from("item_column_values").select("id, column_id, value_json").eq("item_id", itemId)).data!;
  const before = rows.find((r) => (r.value_json as { date?: string }).date === fromDay || (r.value_json as { end?: string }).end === fromDay)!;
  expect(before).toBeTruthy();
  const toDay = new Date(Date.parse(`${fromDay}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  try {
    await chip.dragTo(page.locator(`[data-testid="calendar-day"][data-day="${toDay}"]`));
    await expect
      .poll(async () => {
        const v = (await db.from("item_column_values").select("value_json").eq("id", before.id).single()).data!.value_json as { date?: string; end?: string };
        return v.date ?? v.end;
      }, { timeout: 20_000 })
      .toBe(toDay);
  } finally {
    await db.from("item_column_values").update({ value_json: before.value_json }).eq("id", before.id);
  }
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
