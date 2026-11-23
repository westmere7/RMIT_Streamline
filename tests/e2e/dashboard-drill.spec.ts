import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The dashboard's task lists (v0.158.2): a task clicked in a list opens on its
 * board in a new browser tab, and the dashboard, with the list still open on
 * it, stays exactly as it was.
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
});
