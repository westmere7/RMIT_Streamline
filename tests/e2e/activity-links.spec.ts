import { expect, test, type Page } from "@playwright/test";
import { BOARD_URL, clickRowButton, openBoard, resetLocalData, row, signInAs } from "./helpers";

/**
 * Names in a task's activity open what they name (v0.170.0): a deliverable,
 * the task's Assets tab; a column, the task on that field, brought into view.
 */

const TASK = "RMITinerary Pragmatist";
const panel = (page: Page) => page.getByTestId("item-panel");

test.describe("activity names open what they name", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("an asset opens the Assets tab; a column opens its field", async ({ page }) => {
    await openBoard(page, BOARD_URL);
    // Something for the activity to name: a status change and a deliverable.
    await row(page, TASK).getByTestId("status-cell").click();
    await page.getByRole("option", { name: "In Review" }).click();
    await expect(row(page, TASK).getByTestId("status-cell")).toContainText("In Review");
    await page.keyboard.press("Escape");
    await clickRowButton(row(page, TASK), `Open ${TASK}`);
    await expect(panel(page)).toBeVisible({ timeout: 20_000 });
    await panel(page).getByTestId("tab-assets").click();
    await panel(page).getByTestId("asset-add-input").fill("Activity link poster");
    await panel(page).getByTestId("asset-add-submit").click();
    await expect(panel(page).locator('[data-testid="asset-line"][data-asset-name="Activity link poster"]')).toHaveCount(1, { timeout: 20_000 });

    // From the Activity tab: the deliverable's name opens the Assets tab.
    await panel(page).getByRole("tab", { name: "Activity" }).click();
    const added = panel(page).getByTestId("activity-line").filter({ hasText: "Activity link poster" }).first();
    await expect(added).toBeVisible({ timeout: 20_000 });
    await added.getByRole("link", { name: "Activity link poster" }).click();
    await expect(panel(page).getByTestId("assets-tab")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/[?&]tab=/);

    // And the column's name opens the Overview on that field.
    await panel(page).getByRole("tab", { name: "Activity" }).click();
    const changed = panel(page).getByTestId("activity-line").filter({ hasText: "In Review" }).first();
    await changed.getByRole("link", { name: "Status" }).click();
    await expect(panel(page).locator('[data-testid^="panel-field-"][data-requested="true"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/[?&]field=/);
  });
});
