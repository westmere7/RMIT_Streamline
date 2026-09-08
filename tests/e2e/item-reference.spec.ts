import { expect, test } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";

test.describe("the ID# column", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("sits in front of the item name, shows each task's code, and hides from the Hide menu", async ({ page }) => {
    const first = row(page, ITEM);
    const code = first.getByTestId("item-reference");
    await expect(code).toBeVisible();
    await expect(code).toHaveText(/^TA-[0-9A-F]{4}$/);

    // In front of the name, and nothing about it can be dragged or resized.
    const codeBox = (await code.boundingBox())!;
    const nameBox = (await first.getByTestId("item-name-cell").boundingBox())!;
    expect(codeBox.x).toBeLessThan(nameBox.x);
    // One header per group on the board; the first is enough to check.
    const idHeader = page.locator('[role="columnheader"]', { hasText: /^ID#$/ }).first();
    await expect(idHeader).toBeVisible();
    await expect(idHeader.getByRole("button")).toHaveCount(0);

    // Hiding it takes the whole slot away, and brings it back.
    await page.getByRole("button", { name: "Hide columns" }).click();
    await page.getByTestId("toggle-reference-column").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-reference-cell")).toHaveCount(0);

    await page.getByRole("button", { name: "Hide columns" }).click();
    await page.getByTestId("toggle-reference-column").click();
    await page.keyboard.press("Escape");
    await expect(first.getByTestId("item-reference")).toBeVisible();
  });

  test("is edited from the item panel, and the board follows", async ({ page }) => {
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible();

    await panel.getByTestId("panel-reference").dblclick();
    const field = panel.getByTestId("panel-reference-input");
    await field.fill("ab-1234");
    await field.press("Enter");

    // Seven characters, upper case, on the chip and in the column.
    await expect(panel.getByTestId("panel-reference")).toHaveText("AB-1234");
    await expect(row(page, ITEM).getByTestId("item-reference")).toHaveText("AB-1234");

    await page.reload();
    await expect(row(page, ITEM).getByTestId("item-reference")).toHaveText("AB-1234");
  });
});
