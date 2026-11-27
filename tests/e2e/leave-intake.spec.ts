import { expect, test } from "@playwright/test";
import { clickRowButton, resetLocalData, row, signInAs } from "./helpers";

/**
 * Leaving Booked by Form is asked first (v0.171.1): nothing can be put back
 * into it. A move to another group and an allocation ask in their own words.
 */

const QUEUE = "/workspace/rmit/boards/task-allocation";

test.describe("leaving Booked by Form", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("a move to another group asks first; Cancel leaves it where it was", async ({ page }) => {
    await page.goto(QUEUE);
    const task = "Postgraduate info evening posters";
    await expect(row(page, task)).toBeVisible({ timeout: 30_000 });
    const inGroup = (name: string) => page.getByRole("region", { name: `Group ${name}` }).locator(`[data-testid="item-row"][data-item-name="${task}"]`);
    await expect(inGroup("Booked by Form")).toHaveCount(1);

    await clickRowButton(row(page, task), `More actions for ${task}`);
    await page.getByRole("menuitem", { name: "Move to group" }).click();
    await page.getByRole("menuitem", { name: "Allocated" }).click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText("Move this request out of Booked by Form?");
    await expect(dialog).toContainText("cannot be undone");
    await page.getByTestId("confirm-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(inGroup("Booked by Form")).toHaveCount(1);

    await clickRowButton(row(page, task), `More actions for ${task}`);
    await page.getByRole("menuitem", { name: "Move to group" }).click();
    await page.getByRole("menuitem", { name: "Allocated" }).click();
    await page.getByTestId("confirm-action").click();
    await expect(inGroup("Allocated")).toHaveCount(1, { timeout: 20_000 });
    await expect(inGroup("Booked by Form")).toHaveCount(0);
  });

  test("allocating asks in its own words", async ({ page }) => {
    await page.goto(QUEUE);
    const task = "Scholarship announcement social tiles";
    await expect(row(page, task)).toBeVisible({ timeout: 30_000 });
    await clickRowButton(row(page, task), `More actions for ${task}`);
    await page.getByRole("menuitem", { name: "Allocate to" }).click();
    await page.getByRole("menuitem").filter({ hasText: /./ }).nth(0).hover();
    // Team, then board: the first board on offer.
    const team = page.getByRole("menu").last().getByRole("menuitem").first();
    await team.click();
    await page.getByRole("menu").last().getByRole("menuitem").first().click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText(/^Allocate this request to /);
    await expect(dialog).toContainText("leaves the allocation queue");
    await page.getByTestId("confirm-action").click();
    await expect(row(page, task)).toHaveCount(0, { timeout: 30_000 });
  });

  test("Reset booking sits above Archive on a booked task, and asks first", async ({ page }) => {
    await page.goto(QUEUE);
    const task = "Research impact video – 90s";
    await expect(row(page, task)).toBeVisible({ timeout: 30_000 });
    await clickRowButton(row(page, task), `More actions for ${task}`);
    const items = await page.getByRole("menuitem").allTextContents();
    const reset = items.findIndex((t) => t.includes("Reset booking"));
    expect(reset).toBeGreaterThan(-1);
    expect(items[reset + 1]).toContain("Archive");
    await page.getByTestId("menu-reset-booking").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText(`Reset “${task}” to its booking?`);
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  });
});
