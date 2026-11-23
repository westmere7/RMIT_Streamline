import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The spreadsheet moves people bring from Excel and Google Sheets (v0.160):
 * drag to select a block, Delete to clear it, pull the fill handle, pick and
 * drag whole columns and rows by their headers, and bold / italic / size /
 * link. Each one is read back after a reload, so the save is checked too.
 */
const TRACKER = "/workspace/rmit/trackers/0000000d-0000-4000-8000-000000000001";

async function openTracker(page: Page) {
  await page.goto(TRACKER);
  await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
}

/** Waits for the sheet's batched save to land. */
async function saved(page: Page) {
  await expect(page.getByText(/Unsaved changes|Saving…/)).toHaveCount(0, { timeout: 15_000 });
}

const cell = (page: Page, row: number, col: number) => page.locator(`tbody tr[data-r="${row}"] td[data-c="${col}"]`);
const headerCell = (page: Page, col: number) => page.locator(`thead th[data-hc="${col}"]`);
const gutter = (page: Page, row: number) => page.locator(`tbody tr[data-r="${row}"] td[role="rowheader"]`);
const textOf = async (locator: Locator) => (await locator.innerText()).trim();

async function drag(page: Page, from: Locator, to: Locator, at: { x?: number; y?: number } = {}) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (at.x ?? 0.5), b.y + b.height * (at.y ?? 0.5), { steps: 8 });
  await page.mouse.up();
}

/** The first run of `count` data rows whose first column is filled. */
async function dataRun(page: Page, count: number): Promise<number> {
  return page.evaluate((n) => {
    const rows = [...document.querySelectorAll<HTMLElement>("tbody tr[data-r]")];
    for (let i = 0; i + n <= rows.length; i++) {
      const run = rows.slice(i, i + n);
      if (run.every((tr) => tr.querySelector('td[data-c="0"]') && tr.querySelector('td[data-c="0"]')!.textContent!.trim() !== "")) return Number(run[0]!.dataset.r);
    }
    return -1;
  }, count);
}

test.describe("sheet operations", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Admin");
    await openTracker(page);
  });

  test("dragging selects a block without selecting page text, and Delete clears it for good", async ({ page }) => {
    const r = await dataRun(page, 2);
    expect(r).toBeGreaterThanOrEqual(0);
    await drag(page, cell(page, r, 0), cell(page, r + 1, 1));
    await expect(page.getByText("2×2 selected")).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
    await expect(cell(page, r + 1, 1)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Delete");
    for (const [row, col] of [[r, 0], [r, 1], [r + 1, 0], [r + 1, 1]] as const) await expect(cell(page, row, col)).toHaveAttribute("aria-label", /: empty$/);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    await expect(cell(page, r, 0)).toHaveAttribute("aria-label", /: empty$/);
    await expect(cell(page, r + 1, 1)).toHaveAttribute("aria-label", /: empty$/);
  });

  test("the fill handle copies a cell down", async ({ page }) => {
    const r = await dataRun(page, 3);
    const source = await textOf(cell(page, r, 0));
    await cell(page, r, 0).click();
    await drag(page, page.getByTestId("fill-handle"), cell(page, r + 2, 0));
    await expect(cell(page, r + 1, 0)).toHaveText(source);
    await expect(cell(page, r + 2, 0)).toHaveText(source);
    await expect(page.getByText("3×1 selected")).toBeVisible();

    await saved(page);
    await page.reload();
    await expect(cell(page, r + 2, 0)).toHaveText(source, { timeout: 20_000 });
  });

  test("a picked column drags to a new place, and a picked row block with it", async ({ page }) => {
    const first = await textOf(headerCell(page, 0));
    const second = await textOf(headerCell(page, 1));
    await headerCell(page, 1).click();
    await expect(cell(page, await dataRun(page, 1), 1)).toHaveAttribute("aria-selected", "true");
    await drag(page, headerCell(page, 1), headerCell(page, 0), { x: 0.15 });
    await expect(headerCell(page, 0)).toHaveText(second);
    await expect(headerCell(page, 1)).toHaveText(first);

    const r = await dataRun(page, 3);
    const moving = await textOf(cell(page, r, 0));
    const below = await textOf(cell(page, r + 2, 0));
    await gutter(page, r).click();
    await drag(page, gutter(page, r), gutter(page, r + 2), { y: 0.85 });
    await expect(cell(page, r + 2, 0)).toHaveText(moving);
    await expect(cell(page, r + 1, 0)).toHaveText(below);

    await saved(page);
    await page.reload();
    await expect(headerCell(page, 0)).toHaveText(second, { timeout: 20_000 });
    await expect(cell(page, r + 2, 0)).toHaveText(moving);
  });

  test("bold, italic, size and a link, from the keys and the toolbar", async ({ page }) => {
    const r = await dataRun(page, 1);
    const target = cell(page, r, 0);
    await target.click();
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Control+i");
    await expect(page.getByRole("button", { name: "Bold (Ctrl+B)" })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("toolbar-text-size").click();
    await page.getByRole("menuitemradio", { name: "Large" }).click();
    // The menu hands the keys back to the grid once it has closed.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByTestId("tracker-grid")).toBeFocused();
    await page.keyboard.press("Control+k");
    await page.getByTestId("cell-link-input").fill("rmit.edu.au");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(target.getByTestId("cell-open-link")).toBeVisible();

    await saved(page);
    await page.reload();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    const look = await cell(page, r, 0)
      .locator("div")
      .first()
      .evaluate((el) => ({ weight: getComputedStyle(el).fontWeight, style: getComputedStyle(el).fontStyle, size: getComputedStyle(el).fontSize }));
    expect(Number(look.weight)).toBeGreaterThanOrEqual(700);
    expect(look.style).toBe("italic");
    expect(look.size).toBe("16px");
    await cell(page, r, 0).click();
    await expect(cell(page, r, 0).getByTestId("cell-open-link")).toHaveAttribute("title", "https://rmit.edu.au");
    // The search palette stays out of it.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
