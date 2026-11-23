import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The dashboard's task lists (v0.158.2): a task clicked in a list opens on its
 * board in a new browser tab, and the dashboard, with the list still open on
 * it, stays exactly as it was. Switched off "New tab" (v0.161), it opens here,
 * on its board.
 */
test.describe("dashboard task lists", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/dashboard");
  });

  test("a task opens in a new tab and the list stays open here", async ({ page, context }) => {
    const person = page.getByTestId("dashboard-workload-row").first();
    await person.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await person.click();
    const rows = page.getByTestId("dashboard-task-list-row");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const listed = await rows.count();

    const [tab] = await Promise.all([context.waitForEvent("page"), rows.first().click()]);
    await tab.waitForLoadState();
    await expect(tab).toHaveURL(/\/workspace\/rmit\/boards\/[^/?]+\?item=/, { timeout: 20_000 });
    await expect(tab.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    // Here nothing moved: still the dashboard, the same list open on it.
    await expect(page).toHaveURL(/\/workspace\/rmit\/dashboard$/);
    await expect(rows).toHaveCount(listed);

    // A second task from the same list opens a tab of its own too.
    const [second] = await Promise.all([context.waitForEvent("page"), rows.nth(1).click()]);
    await expect(second).toHaveURL(/\?item=/, { timeout: 20_000 });
    await expect(rows).toHaveCount(listed);
  });

  test("switched off New tab, a task opens here on its board, and the choice is remembered", async ({ page, context }) => {
    const person = page.getByTestId("dashboard-workload-row").first();
    await person.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await person.click();
    const rows = page.getByTestId("dashboard-task-list-row");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const toggle = page.getByTestId("dashboard-task-list-new-tab");
    // New tab is the default.
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    let opened = false;
    context.on("page", () => (opened = true));
    await rows.first().click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/boards\/[^/?]+\?item=/, { timeout: 20_000 });
    await expect(page.getByTestId("item-panel")).toBeVisible({ timeout: 30_000 });
    expect(opened).toBe(false);

    // Back on the dashboard, the list remembers where tasks open.
    await page.goto("/workspace/rmit/dashboard");
    const again = page.getByTestId("dashboard-workload-row").first();
    await again.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await again.click();
    await expect(page.getByTestId("dashboard-task-list-new-tab")).toHaveAttribute("aria-checked", "false");
  });

  test("the year's days: a day opens the tasks started on it, and a month on the chart lights its days", async ({ page }) => {
    const panel = page.getByTestId("dashboard-activity");
    await panel.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(panel.getByTestId("dashboard-activity-day").first()).toBeAttached();
    const busy = panel.locator('[data-testid="dashboard-activity-day"]:not([data-count="0"])').last();
    const count = Number(await busy.getAttribute("data-count"));
    expect(count).toBeGreaterThan(0);
    await busy.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`${count} ${count === 1 ? "task" : "tasks"} started`);
    await expect(dialog.getByTestId("dashboard-task-list-row")).toHaveCount(count);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // A month hovered on the chart above lights the same month here, in the same column.
    const chartMonth = page.getByTestId("year-month").nth(6);
    await chartMonth.hover();
    const july = panel.locator('[data-testid="dashboard-activity-month"][data-month="7"]');
    await expect(july).toHaveAttribute("data-lit", "true");
    await expect(panel.locator('[data-testid="dashboard-activity-month"][data-lit]')).toHaveCount(1);
    const [chartBox, heatBox] = await Promise.all([chartMonth.locator("rect").first().boundingBox(), july.locator("rect").first().boundingBox()]);
    expect(Math.abs(chartBox!.x - heatBox!.x)).toBeLessThan(1.5);
    expect(Math.abs(chartBox!.width - heatBox!.width)).toBeLessThan(1.5);
    await page.mouse.move(0, 0);

    // The days count started work only: no switch, and nothing about finished work.
    await expect(panel.getByRole("radiogroup")).toHaveCount(0);
    await expect(panel.getByTestId("dashboard-activity-total")).toContainText("started");
    await expect(panel).not.toContainText("finished");
  });
});
