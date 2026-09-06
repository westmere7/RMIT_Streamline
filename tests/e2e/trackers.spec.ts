import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

async function openDemoTracker(page: Page) {
  await page.goto("/workspace/rmit/trackers");
  await page.getByRole("link", { name: /Domestic Campaigns Asset Tracker/ }).click();
  await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 15000 });
}

const grid = (page: Page) => page.getByTestId("tracker-grid");
/** The n-th data row (bands are skipped) and one of its cells; col is the column index, the gutter is skipped. */
const dataRow = (page: Page, n: number) => grid(page).locator("tbody tr:not([data-testid=grid-section-row])").nth(n);
const cell = (page: Page, row: number, col: number) => dataRow(page, row).locator("td").nth(col + 1);

test.describe("asset tracker grid", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openDemoTracker(page);
  });

  test("typing edits a cell, Enter moves down, and Ctrl+D fills the selection down", async ({ page }) => {
    // OBJECTIVE is the fourth column; data rows skip the phase and channel bands.
    await cell(page, 0, 3).click();
    await page.keyboard.type("Awareness");
    await page.keyboard.press("Enter");
    await expect(cell(page, 0, 3)).toContainText("Awareness");

    // Select from the filled cell down two rows and fill.
    await cell(page, 0, 3).click();
    await cell(page, 2, 3).click({ modifiers: ["Shift"] });
    await page.keyboard.press("Control+d");
    await expect(cell(page, 1, 3)).toContainText("Awareness");
    await expect(cell(page, 2, 3)).toContainText("Awareness");

    // It is saved: reload and the values are still there.
    await expect(page.getByText(/unsaved|saving/i)).toHaveCount(0, { timeout: 10000 });
    await page.reload();
    await expect(grid(page)).toBeVisible({ timeout: 15000 });
    await expect(cell(page, 2, 3)).toContainText("Awareness");
  });

  test("Ctrl+Arrow jumps to the edge of filled cells and the status bar follows", async ({ page }) => {
    await cell(page, 0, 0).click();
    await page.keyboard.press("Control+ArrowDown");
    const address = page.locator("text=/^[A-Z]+\\d+/").first();
    await expect(address).toBeVisible();
    const text = await address.textContent();
    expect(Number(text!.replace(/^[A-Z]+/, ""))).toBeGreaterThan(2);
  });

  test("search narrows the sheet, keeps the bands that still have rows, and the counts say so", async ({ page }) => {
    const total = await grid(page).locator("tbody tr").count();
    await page.getByTestId("sheet-search").fill("youtube");
    await expect(page.getByTestId("view-count")).toContainText(/hidden/);
    const shown = await grid(page).locator("tbody tr").count();
    expect(shown).toBeLessThan(total);
    await expect(page.getByTestId("row-count")).toContainText(/of \d+ rows/);
    await page.getByTestId("clear-view").click();
    await expect(grid(page).locator("tbody tr")).toHaveCount(total);
  });

  test("a column can be sorted and filtered from its header, without changing the data", async ({ page }) => {
    const header = page.getByRole("columnheader", { name: /^STATUS/ });
    await header.getByRole("button", { name: /column options/ }).click();
    await page.getByRole("menuitem", { name: "Sort A → Z" }).click();
    await expect(page.getByTestId("sort-chip")).toContainText("STATUS");

    await header.getByRole("button", { name: /column options/ }).click();
    await page.getByRole("menuitem", { name: /Filter by value/ }).click();
    const dialog = page.getByTestId("filter-values-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear" }).click();
    await dialog.getByLabel("COMPLETED").check();
    await page.getByTestId("apply-filter").click();
    await expect(page.getByTestId("filter-chip")).toContainText("STATUS: COMPLETED");
    const statuses = await grid(page).locator("tbody tr:not([data-testid=grid-section-row]) td:nth-child(6)").allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s).toContain("COMPLETED");

    // Nothing was written; clearing the view shows everything again.
    await expect(page.getByText(/unsaved|saving/i)).toHaveCount(0);
    await page.getByTestId("clear-view").click();
    await expect(page.getByTestId("filter-chip")).toHaveCount(0);
  });

  test("the footer summarises columns and the summary can be changed per column", async ({ page }) => {
    const summary = page.getByTestId("summary-row");
    await expect(summary).toBeVisible();
    // STATUS is a dropdown: it counts filled cells by default.
    const statusSummary = summary.getByTestId("summary-cell").nth(4);
    await expect(statusSummary).toContainText(/\d+ filled/);
    await statusSummary.getByRole("button").click();
    await page.getByRole("menuitemradio", { name: "Count empty" }).click();
    await expect(statusSummary).toContainText(/\d+ empty/);
  });

  test("export offers the workbook and a CSV of the current sheet", async ({ page }) => {
    await page.getByTestId("export-tracker").click();
    await expect(page.getByTestId("export-xlsx")).toBeVisible();
    await expect(page.getByTestId("export-csv")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("export-csv").click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });
});
