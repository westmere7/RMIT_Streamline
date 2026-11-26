import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * An automation, end to end, on a real database: built in the dialog, set off
 * by a task added on the board, carried out by the server (the app nudges the
 * runner after the write), and the scheduled runner answering its secret.
 * Only against the local stack: it writes.
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
const service = (): SupabaseClient => createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("an automation built in the dialog fires when a task is added, and the runner answers its secret", async ({ page, request }) => {
  test.setTimeout(180_000);
  const db = service();
  const ruleName = `E2E fire ${RUN}`;
  const taskName = `E2E automation task ${RUN}`;
  const marker = `Auto check ${RUN}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@rmit.local");
  await page.getByTestId("login-password").fill("admin123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/, { timeout: 60_000 });

  // Built in the dialog: when a task is added on RMITinerary 2026, post an update on it.
  await page.goto("/workspace/rmit/automations");
  await page.getByRole("button", { name: /New automation/ }).first().click({ timeout: 60_000 });
  const dialog = page.getByTestId("automation-rule-dialog");
  await expect(dialog.getByTestId("rule-step-when")).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("automation-board").click();
  await page.getByRole("option", { name: "RMITinerary 2026" }).click();
  await dialog.getByTestId("trigger-kind").click();
  await page.getByRole("option", { name: "a task is added" }).click();
  await dialog.getByTestId("action-kind").first().click();
  await page.getByRole("option", { name: "post an update" }).click();
  await dialog.getByRole("textbox", { name: "What the update says" }).fill(marker);
  await dialog.locator('[data-testid="insert-chip"][data-token="{item}"]').click();
  await expect(dialog.getByTestId("automation-summary")).toContainText(/task is added/i);
  await dialog.getByTestId("automation-name").fill(ruleName);
  await dialog.getByTestId("save-automation").click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  const rule = (await db.from("automation_rules").select("id, enabled, trigger_kind").eq("name", ruleName).single()).data!;
  expect(rule).toMatchObject({ enabled: true, trigger_kind: "item_created" });

  try {
    // Set off: a task added on the board.
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    const add = page.getByTestId("add-item-Design");
    await add.fill(taskName, { timeout: 60_000 });
    await add.press("Enter");

    // Carried out on the server: the update is on the task, the run is logged.
    let itemId = "";
    await expect
      .poll(async () => {
        const item = (await db.from("items").select("id").eq("name", taskName).maybeSingle()).data;
        itemId = item?.id ?? "";
        if (!itemId) return "";
        const comments = (await db.from("comments").select("body").eq("item_id", itemId)).data ?? [];
        return comments.map((c) => c.body).join(" | ");
      }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000] })
      .toContain(`${marker} ${taskName}`);
    const runs = (await db.from("automation_runs").select("status").eq("rule_id", rule.id)).data ?? [];
    expect(runs.map((r) => r.status)).toContain("ran");

    // The scheduled runner: refused without the secret, answered with it.
    const secret = env.AUTOMATION_SECRET || env.CRON_SECRET;
    expect((await request.post("/api/automations/run")).status()).toBeGreaterThanOrEqual(400);
    if (secret) {
      const reply = await request.post("/api/automations/run", { headers: { Authorization: `Bearer ${secret}` } });
      expect(reply.status()).toBe(200);
      const body = await reply.json();
      expect(body).toMatchObject({ ok: true });
      // Not the day's sweep window (19:00–19:14 UTC): no sweep on an ordinary tick.
      const now = new Date();
      if (!(now.getUTCHours() === 19 && now.getUTCMinutes() < 15)) expect(body.swept).toBe(0);
    }
  } finally {
    await db.from("automation_rules").delete().eq("id", rule.id);
    await db.from("items").delete().eq("name", taskName);
  }
});
