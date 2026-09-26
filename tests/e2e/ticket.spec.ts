import { expect, test } from "@playwright/test";
import { clickRowButton, openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";

test.describe("the ticket column", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("sits in front of the item name, shows each task's ticket, and hides from the Hide menu", async ({ page }) => {
    const first = row(page, ITEM);
    const code = first.getByTestId("item-ticket");
    await expect(code).toBeVisible();
    await expect(code).toHaveText(/^CP_\d{3,}$/);

    // In front of the name, and nothing about it can be dragged or resized.
    const codeBox = (await code.boundingBox())!;
    const nameBox = (await first.getByTestId("item-name-cell").boundingBox())!;
    expect(codeBox.x).toBeLessThan(nameBox.x);
    // One header per group on the board; the first is enough to check.
    const header = page.locator('[role="columnheader"]', { hasText: /^Ticket$/ }).first();
    await expect(header).toBeVisible();
    await expect(header.getByRole("button")).toHaveCount(0);

    // Hiding it takes the whole slot away, and brings it back.
    await page.getByRole("button", { name: "Hide columns" }).click();
    await page.getByTestId("toggle-ticket-column").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-ticket-cell")).toHaveCount(0);

    await page.getByRole("button", { name: "Hide columns" }).click();
    await page.getByTestId("toggle-ticket-column").click();
    await page.keyboard.press("Escape");
    await expect(first.getByTestId("item-ticket")).toBeVisible();
  });

  test("no two tasks on the board answer to the same ticket", async ({ page }) => {
    const codes = await page.getByTestId("item-ticket").allTextContents();
    expect(codes.length).toBeGreaterThan(5);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("is edited from the item panel, and the board follows", async ({ page }) => {
    await clickRowButton(row(page, ITEM), `Open ${ITEM}`);
    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible();
    const before = await panel.getByTestId("panel-ticket").textContent();

    await panel.getByTestId("panel-ticket").dblclick();
    const field = panel.getByTestId("panel-ticket-input");
    // Typed the way somebody reads it off a printout: no padding, a dash.
    await field.fill("qa-901");
    await field.press("Enter");

    await expect(panel.getByTestId("panel-ticket")).toHaveText("QA_901");
    await expect(row(page, ITEM).getByTestId("item-ticket")).toHaveText("QA_901");

    await page.reload();
    await expect(row(page, ITEM).getByTestId("item-ticket")).toHaveText("QA_901");
    expect(before).not.toBe("QA_901");
  });

  test("refuses a ticket another task already holds, and says which", async ({ page }) => {
    // Whatever the first row answers to, the second may not.
    const taken = (await page.getByTestId("item-ticket").first().textContent())!.trim();
    await clickRowButton(row(page, ITEM), `Open ${ITEM}`);
    const panel = page.getByTestId("item-panel");
    const mine = (await panel.getByTestId("panel-ticket").textContent())!.trim();
    test.skip(mine === taken, "the first row is the one already open");

    await panel.getByTestId("panel-ticket").dblclick();
    await panel.getByTestId("panel-ticket-input").fill(taken);
    await panel.getByTestId("panel-ticket-input").press("Enter");

    await expect(page.getByText(/is already/)).toBeVisible();
    await expect(panel.getByTestId("panel-ticket")).toHaveText(mine);
  });
});
