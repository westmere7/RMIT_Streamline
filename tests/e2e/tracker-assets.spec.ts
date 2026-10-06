import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * A tracker sheet as a task's deliverables, end to end: link a sheet to a task
 * from the tracker, see its rows as the task's assets, tick one off on the
 * task and find it ticked in the sheet, then link from the task's side, and
 * use a People column.
 */
const TRACKER = "/workspace/rmit/trackers/0000000d-0000-4000-8000-000000000001";

async function openTracker(page: Page) {
  await page.goto(TRACKER);
  await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
}

test.describe("tracker sheets as task assets", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Admin");
  });

  test("a sheet links to a task, its rows become the task's assets, and ticking one on the task ticks the sheet", async ({ page }) => {
    await openTracker(page);
    const completedBefore = await page.getByRole("gridcell", { name: "STATUS: COMPLETED" }).count();
    await page.getByTestId("task-assets-button").click();
    const dialog = page.getByTestId("task-assets-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("task-assets-search").fill("a");
    const hit = dialog.getByTestId("task-assets-hits").getByRole("button").first();
    await expect(hit).toBeVisible({ timeout: 15_000 });
    const taskName = ((await hit.locator("span").first().innerText()).replace(/^[A-Z]+_\d+\s+/, "")).trim();
    await hit.click();
    await expect(dialog.getByTestId("task-assets-task")).toContainText(taskName);

    // Name each asset by the Format column, and count a row as done when its status is COMPLETED.
    await dialog.getByTestId("map-name").selectOption({ label: "Format" });
    await dialog.getByTestId("map-done").selectOption({ label: "STATUS" });
    // Only COMPLETED counts as done, so ticking on the task writes exactly that.
    const chips = dialog.getByLabel("Choices that count as done").getByRole("button");
    for (let i = 0; i < (await chips.count()); i++) {
      const chip = chips.nth(i);
      const want = (await chip.innerText()).trim() === "COMPLETED";
      if ((await chip.getAttribute("aria-pressed")) === "true" ? !want : want) await chip.click();
    }
    await expect(dialog.getByTestId("task-assets-preview")).toContainText(/\d+ assets?/);
    const preview = await dialog.getByTestId("task-assets-preview").innerText();
    const count = Number(preview.match(/(\d+) assets?/)![1]);
    expect(count).toBeGreaterThan(0);
    await dialog.getByTestId("task-assets-save").click();
    await expect(dialog).toBeHidden();

    const bar = page.getByTestId("linked-sheet-bar");
    await expect(bar).toContainText(taskName);
    await expect(bar).toContainText(`${count} asset`);
    await expect(page.getByTestId("sheet-tab").first().getByLabel("Holds a task's assets")).toBeVisible();
    await expect(page.getByTestId("asset-role-mark").first()).toBeVisible();

    // The task shows the rows as its assets.
    await bar.getByRole("link", { name: new RegExp(taskName.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("tab", { name: /Assets/ }).click();
    const section = panel.getByTestId("tracker-sheet-section");
    await expect(section).toBeVisible();
    await expect(section.getByTestId("tracker-sheet-line")).toHaveCount(count);

    // Tick the first open one on the task…
    const doneBefore = await section.getByRole("checkbox", { checked: true }).count();
    await section.getByRole("checkbox", { checked: false }).first().click();
    await expect(section.getByRole("checkbox", { checked: true })).toHaveCount(doneBefore + 1, { timeout: 10_000 });

    // …and the sheet has one more COMPLETED row.
    await section.getByTestId("open-tracker-sheet").click();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("gridcell", { name: "STATUS: COMPLETED" })).toHaveCount(completedBefore + 1);
  });

  test("editing the sheet changes the task's assets, and unlinking takes them off", async ({ page }) => {
    await openTracker(page);
    await page.getByTestId("task-assets-button").click();
    const dialog = page.getByTestId("task-assets-dialog");
    await dialog.getByTestId("task-assets-search").fill("a");
    await dialog.getByTestId("task-assets-hits").getByRole("button").first().click();
    await dialog.getByTestId("map-name").selectOption({ label: "Format" });
    await dialog.getByTestId("task-assets-save").click();
    const bar = page.getByTestId("linked-sheet-bar");
    await expect(bar).toContainText(/\d+ assets?/, { timeout: 10_000 });
    const before = Number((await bar.innerText()).match(/(\d+) assets?/)![1]);

    // A new row with a Format becomes one more asset.
    await page.getByTestId("add-rows").click();
    const formatHeader = page.locator("thead th").filter({ hasText: /^Format$/ });
    const formatIndex = await formatHeader.evaluate((th) => [...th.parentElement!.children].indexOf(th));
    const lastRow = page.locator("tbody tr").last();
    await lastRow.locator("td").nth(formatIndex).dblclick();
    await page.keyboard.type("Billboard 48 sheet");
    await page.keyboard.press("Enter");
    await expect(bar).toContainText(`${before + 1} assets`, { timeout: 10_000 });

    await page.getByTestId("linked-sheet-settings").click();
    await page.getByTestId("task-assets-unlink").click();
    await expect(bar).toHaveCount(0);
  });

  test("a task picks a tracker sheet from its Assets tab", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20_000 });
    await page.locator("[data-testid=item-row]").first().getByRole("button").first().click({ trial: true }).catch(() => undefined);
    await page.locator("[data-testid=item-row] [data-testid=item-name]").first().click();
    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("tab", { name: /Assets/ }).click();
    await panel.getByTestId("use-tracker-sheet").click();
    await page.getByTestId("pick-sheet-dialog").getByTestId("pick-sheet").first().click();
    const dialog = page.getByTestId("task-assets-dialog");
    await expect(dialog.getByTestId("task-assets-task")).toBeVisible();
    await dialog.getByTestId("map-name").selectOption({ label: "Format" });
    await dialog.getByTestId("task-assets-save").click();
    await expect(panel.getByTestId("tracker-sheet-section")).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByTestId("tracker-sheet-line").first()).toBeVisible();
  });

  test("a People column picks members, shows their names and is searchable", async ({ page }) => {
    await openTracker(page);
    await page.getByTestId("toolbar-insert-column").click();
    const header = page.locator("thead th[scope=col]").filter({ hasText: /^Column \d+$/ }).last();
    const name = (await header.innerText()).trim();
    await header.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Column type" }).click();
    await page.getByRole("menuitem", { name: "People" }).click();
    const index = await header.evaluate((th) => [...th.parentElement!.children].indexOf(th));
    const cell = page.locator("tbody tr").nth(2).locator("td").nth(index);
    await cell.dblclick();
    const picker = page.getByTestId("people-picker");
    await picker.getByRole("textbox").fill("Emily");
    await picker.getByRole("option").first().click();
    await picker.getByTestId("people-picker-done").click();
    await expect(cell).toContainText("Emily Carter");
    await page.getByPlaceholder(/Search this sheet/).fill("Emily Carter");
    await expect(page.getByTestId("row-count")).toContainText("1 of");
    expect(name).toMatch(/Column/);
  });
});
