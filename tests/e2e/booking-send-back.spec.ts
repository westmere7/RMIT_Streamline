import { expect, test, type Page } from "@playwright/test";
import { clickRowButton, resetLocalData, row, signInAs } from "./helpers";

/**
 * Sending a booking back for missing information (v0.168.0), on the local demo:
 * the team sends it back with a note, the task is locked and says "Sent back"
 * (board and Guest portal), the requester's link opens their form filled in,
 * their answer lands on the same task, and the journey keeps every round.
 */

const TASK_ALLOCATION_URL = "/workspace/rmit/boards/task-allocation";
const TITLE = "Graduation banners";

async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

/** A stakeholder books on the public form, with no account. */
async function bookAsStakeholder(page: Page) {
  await page.goto("/rmit/booking");
  await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("booking-name").fill("Priya Nair");
  await page.getByTestId("booking-email").fill("priya.sendback@rmit.edu.au");
  await page.getByTestId("booking-department").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("booking-title").fill(TITLE);
  await page.getByTestId("booking-priority").click();
  await page.getByTestId("booking-priority-high").click();
  await page.getByTestId("booking-due").fill("2026-12-01");
  await page.getByTestId("booking-service-design").click();
  if (await page.getByTestId("booking-sub-print").count()) await page.getByTestId("booking-sub-print").click();
  await page.getByTestId("booking-next").click();
  await page.getByTestId("booking-answer-design-what").fill("Banners for graduation.");
  await page.getByTestId("booking-answer-design-specs").fill("Pull-up banners.");
  await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
  await page.getByTestId("booking-next").click();
  await expect(page.getByTestId("booking-step-assets")).toBeVisible();
  await page.getByTestId("booking-skip-assets").click();
  await page.getByTestId("booking-submit").click();
  await expect(page.getByTestId("booking-receipt")).toBeVisible({ timeout: 30_000 });
  return (await page.getByTestId("booking-ticket").innerText()).trim();
}

async function openTask(page: Page) {
  await page.goto(TASK_ALLOCATION_URL);
  const request = row(page, TITLE);
  await expect(request).toBeVisible({ timeout: 30_000 });
  await clickRowButton(request, `Open ${TITLE}`);
  const panel = page.getByTestId("item-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  return { request, panel };
}

test.describe("sending a booking back", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("sent back, locked and shown as Sent back; answered through the link; every round on the journey", async ({ page }) => {
    // The Guest portal on, so its chip can be checked too.
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/book");
    const card = page.getByTestId("portal-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    if ((await card.getByTestId("portal-toggle").getAttribute("aria-checked")) !== "true") await card.getByTestId("portal-toggle").click();
    await expect(card.getByTestId("portal-toggle")).toHaveAttribute("aria-checked", "true");
    await signOut(page);

    const ticket = await bookAsStakeholder(page);
    expect(ticket).toMatch(/^CP_\d{3,}$/);

    // The team: the task offers Send back, and a note is required.
    await signInAs(page, "Danh");
    let { request, panel } = await openTask(page);
    await panel.getByTestId("send-back-open").click();
    const dialog = page.getByTestId("send-back-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("send-back-submit")).toBeDisabled();
    await dialog.getByTestId("send-back-note").fill("Which campus, and how many banners?");
    await dialog.getByTestId("send-back-submit").click();
    const link = await dialog.getByTestId("send-back-link").inputValue();
    expect(link).toMatch(/\/rmit\/booking\/r\/[a-z0-9]{32}$/);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    // Waiting: the note and the link on the panel, the row says Sent back, and the task is locked.
    await expect(panel.getByTestId("send-back-waiting")).toContainText("Which campus, and how many banners?", { timeout: 20_000 });
    await expect(request.locator('[data-sent-back="true"]')).toBeVisible({ timeout: 20_000 });
    await expect(request.getByTestId("sent-back-chip")).toHaveText(/Sent back/);
    // Locked: no status picker on the row, Allocate gone, but updates can still be posted.
    await expect(request.locator('button[data-testid="status-cell"]')).toHaveCount(0);
    await expect(panel.getByTestId("allocation-section")).toHaveCount(0);
    await panel.getByRole("tab", { name: /Updates/ }).click();
    await expect(panel.getByTestId("comment-composer")).toBeVisible();
    // The update says what was asked; the journey has it.
    await expect(page.getByText("Sent back to Priya Nair for more information:").first()).toBeVisible({ timeout: 20_000 });

    // The Guest portal shows it as Sent back, and never the link.
    await signOut(page);
    await page.goto("/rmit/portal");
    const portalRow = page.locator(`[data-item-name="${TITLE}"]`).first();
    await expect(portalRow).toBeVisible({ timeout: 30_000 });
    await expect(portalRow.getByTestId("sent-back-chip")).toBeVisible();
    expect(await page.content()).not.toContain(link.split("/r/")[1]!);

    // The requester: their form, filled in, with the note at the top.
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("resubmit-note")).toContainText("Which campus, and how many banners?", { timeout: 30_000 });
    await expect(page.getByTestId("booking-title")).toHaveValue(TITLE);
    await expect(page.getByTestId("resubmit-identity")).toContainText("Priya Nair");
    await page.getByTestId("resubmit-reply").fill("Saigon South, four banners.");
    await page.getByTestId("booking-next").click();
    await expect(page.getByTestId("booking-answer-design-what")).toHaveValue("Banners for graduation.");
    await page.getByTestId("booking-answer-design-what").fill("Four pull-up banners for graduation at Saigon South.");
    await page.getByTestId("booking-next").click();
    await expect(page.getByTestId("booking-step-assets")).toBeVisible();
    await page.getByTestId("booking-skip-assets").click();
    await expect(page.getByTestId("booking-submit")).toHaveText(/Send again/);
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-receipt")).toContainText("Sent. Thank you.", { timeout: 30_000 });
    await expect(page.getByTestId("booking-ticket")).toHaveText(ticket);
    await expect(page.getByTestId("booking-another")).toHaveCount(0);

    // The link has done its job.
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("resubmit-unavailable")).toContainText("already sent", { timeout: 30_000 });

    // Back with the team: unlocked, the answer on the task, and both rounds of history.
    await signInAs(page, "Danh");
    ({ request, panel } = await openTask(page));
    await expect(request.locator('[data-sent-back="true"]')).toHaveCount(0, { timeout: 20_000 });
    await expect(panel.getByTestId("send-back-open")).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("tab", { name: /Updates/ }).click();
    await expect(panel.getByText("Saigon South, four banners.").first()).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/Changed: Brief\./).first()).toBeVisible();
    await panel.getByRole("tab", { name: /Overview/ }).click();

    // From the row's menu too: Send back sits under Allocate to, and Recall takes its place while it waits.
    await clickRowButton(request, `More actions for ${TITLE}`);
    await page.getByTestId("menu-send-back").click();
    const fromMenu = page.getByTestId("send-back-dialog");
    await fromMenu.getByTestId("send-back-note").fill("From the menu: which size?");
    await fromMenu.getByTestId("send-back-submit").click();
    await expect(fromMenu.getByTestId("send-back-link")).toBeVisible({ timeout: 20_000 });
    await fromMenu.getByRole("button", { name: "Done" }).click();
    await expect(request.getByTestId("sent-back-chip")).toBeVisible({ timeout: 20_000 });
    await clickRowButton(request, `More actions for ${TITLE}`);
    await expect(page.getByTestId("menu-send-back")).toHaveCount(0);
    await page.getByTestId("menu-recall-send-back").click();
    await expect(request.getByTestId("sent-back-chip")).toHaveCount(0, { timeout: 20_000 });

    // A second round, recalled this time.
    await panel.getByTestId("send-back-open").click();
    await page.getByTestId("send-back-note").fill("And the size?");
    await page.getByTestId("send-back-submit").click();
    await expect(page.getByTestId("send-back-link")).toBeVisible();
    await page.getByTestId("send-back-dialog").getByRole("button", { name: "Done" }).click();
    await panel.getByTestId("send-back-cancel").click();
    await expect(panel.getByTestId("send-back-open")).toBeVisible({ timeout: 20_000 });

    await panel.getByTestId("panel-menu").click();
    await page.getByTestId("open-task-journey").click();
    const journey = page.getByTestId("task-journey");
    await expect(journey).toContainText("Sent back to Priya Nair", { timeout: 20_000 });
    await expect(journey).toContainText("Sent again by Priya Nair");
    await expect(journey).toContainText("Sent back to Priya Nair (2nd time)");
    await expect(journey).toContainText("Sent back to Priya Nair (3rd time)");
    await expect(journey).toContainText("Send back recalled");
  });
});
