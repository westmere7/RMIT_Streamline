import { expect, test, type Page } from "@playwright/test";
import { BOARD_URL, openBoard, resetLocalData, row, signInAs } from "./helpers";

/**
 * The Assets tab on an item and the "Assets recap" column that summarises it:
 * lines are added and edited from compact chips, the totals move as you type,
 * and the cell on the board follows without a reload.
 */
test.describe("asset lines and the recap column", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  async function addRecapColumn(page: Page) {
    await page.getByRole("button", { name: "Add column" }).first().click();
    await page.getByRole("menuitem", { name: /assets recap/i }).click();
    await expect(page.getByRole("button", { name: "Assets recap", exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  function panel(page: Page) {
    return page.getByTestId("item-panel");
  }

  /** A line's card; the name is an input, so it is found by attribute rather than by text. */
  function line(page: Page, name: string) {
    return panel(page).locator(`[data-testid="asset-line"][data-asset-name="${name}"]`);
  }

  /** Lines are a single row until opened; the pickers live inside the open one. */
  async function openLine(page: Page, name: string) {
    const card = line(page, name);
    if ((await card.getByTestId("asset-toggle").getAttribute("aria-expanded")) !== "true") await card.getByTestId("asset-toggle").click();
    await expect(card.getByTestId("asset-type")).toBeVisible({ timeout: 20_000 });
  }

  /** The developer user switch, so the same browser can look at the board as someone else. */
  async function switchTo(page: Page, displayName: string) {
    await page.goto("/workspace/rmit");
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /switch user/i }).click();
    await page.getByRole("menuitem", { name: new RegExp(displayName) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(displayName.split(" ")[0]!, { timeout: 20_000 });
  }

  test("lines are added from the panel, totals follow live, and the board cell summarises them", async ({ page }) => {
    await openBoard(page, BOARD_URL);
    await addRecapColumn(page);

    const name = "RMITinerary Pragmatist";
    const cell = row(page, name).getByTestId("assets-recap-cell");
    await expect(cell).toHaveAttribute("aria-label", /no assets/);

    // The empty cell opens the item straight on its Assets tab.
    await cell.getByRole("button").click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByTestId("assets-tab")).toBeVisible({ timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-empty")).toBeVisible();

    // Two lines: the totals move as each one lands.
    await panel(page).getByTestId("asset-add-input").fill("A1 poster");
    await panel(page).getByTestId("asset-add-submit").click();
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(1, { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-progress")).toContainText("0 of 1 line done");
    await panel(page).getByTestId("asset-add-input").fill("Instagram tile");
    await panel(page).getByTestId("asset-add-input").press("Enter");
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(2, { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-progress")).toContainText("0 of 2 lines done");

    // Quantity from the stepper, type from the palette, a person in charge and a due date — on the poster.
    const poster = line(page, "A1 poster");
    await openLine(page, "A1 poster");
    await poster.getByTestId("asset-quantity-plus").click();
    await poster.getByTestId("asset-quantity-plus").click();
    await expect(poster.getByTestId("asset-quantity")).toHaveValue("3", { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-quantity")).toContainText("4 assets");

    await poster.getByTestId("asset-type").click();
    await page.getByTestId("asset-type-option-Print").click();
    await page.keyboard.press("Escape");
    await expect(poster.getByTestId("asset-type")).toHaveAttribute("aria-label", "Asset type: Print", { timeout: 20_000 });
    // Escape closed the picker, not the panel.
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByTestId("assets-breakdown")).toContainText("Print");

    await poster.getByTestId("asset-assignee").click();
    await page.getByPlaceholder("Search people…").fill("Tuyet");
    await page.getByText("Tuyet Le").first().click();
    await page.keyboard.press("Escape");
    await expect(poster.getByTestId("asset-assignee")).toHaveAttribute("aria-label", /Tuyet Le/, { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-people")).toHaveAttribute("aria-label", /Tuyet Le/);

    await poster.getByTestId("asset-due").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Today", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(poster.getByTestId("asset-due")).not.toHaveAttribute("aria-label", /not set/, { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-due")).toContainText(/Next due/);

    // The board cell follows: 3 posters + 1 tile, one type, one person.
    await expect(cell).toContainText("4 assets · 1 type · 1 PIC", { timeout: 20_000 });

    // Everything survives a reload, and the badge on the tab counts the lines.
    await page.reload();
    await expect(row(page, name).getByTestId("assets-recap-cell")).toContainText("4 assets · 1 type · 1 PIC", { timeout: 20_000 });
    await row(page, name).getByRole("button", { name: `Open ${name}` }).click();
    await expect(panel(page).getByTestId("tab-assets")).toContainText("2");

    // Ticking the poster off fills the bar by its three, and the closed row still
    // shows what it is.
    await panel(page).getByTestId("tab-assets").click();
    await openLine(page, "A1 poster");
    await line(page, "A1 poster").getByTestId("asset-done").click();
    await expect(line(page, "A1 poster")).toHaveAttribute("data-asset-done", "true", { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-progress")).toContainText("1 of 2 lines done");
    await line(page, "A1 poster").getByTestId("asset-toggle").click();
    await expect(line(page, "A1 poster").getByTestId("asset-summary")).toContainText("Print");
    await line(page, "A1 poster").getByTestId("asset-done").click();
    await expect(line(page, "A1 poster")).toHaveAttribute("data-asset-done", "false", { timeout: 20_000 });

    // Removing a line takes it out of the totals and the cell.
    await openLine(page, "Instagram tile");
    await line(page, "Instagram tile").getByTestId("asset-remove").click();
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(1, { timeout: 20_000 });
    await expect(row(page, name).getByTestId("assets-recap-cell")).toContainText("3 assets · 1 type · 1 PIC", { timeout: 20_000 });
  });

  test("a viewer sees the lines but cannot change them", async ({ page }) => {
    // Jun is a viewer on DOOH Production.
    const url = "/workspace/rmit/boards/dooh-production";
    await openBoard(page, url);
    const name = "Shopping centre network – 6 sites";
    await row(page, name).getByRole("button", { name: `Open ${name}` }).click();
    await panel(page).getByTestId("tab-assets").click();
    await panel(page).getByTestId("asset-add-input").fill("Banner");
    await panel(page).getByTestId("asset-add-submit").click();
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(1, { timeout: 20_000 });

    await switchTo(page, "Jun Tanaka");
    await openBoard(page, url);
    await row(page, name).getByRole("button", { name: `Open ${name}` }).click();
    await panel(page).getByTestId("tab-assets").click();
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(1, { timeout: 20_000 });
    await expect(panel(page).getByTestId("asset-add-input")).toHaveCount(0);
    await openLine(page, "Banner");
    await expect(panel(page).getByTestId("asset-remove")).toHaveCount(0);
    await expect(panel(page).getByTestId("asset-quantity-readonly")).toBeVisible();
    await expect(panel(page).getByTestId("asset-done")).toBeDisabled();
  });
});
