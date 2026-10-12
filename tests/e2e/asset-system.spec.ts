import { expect, test, type Locator, type Page } from "@playwright/test";
import { BOARD_URL, clickRowButton, openBoard, resetLocalData, row, signInAs } from "./helpers";

/**
 * The asset system end to end, on the local provider: lines made on a task and
 * lines made in a tracker sheet, both assigned, both on the task's To-do, both
 * counted on the dashboard and in My Work, and both kept in step across tabs.
 *
 * Creation on the task (a line, a block), assignment, ticking off, the To-do
 * filter and its warning, My Work, the dashboard's asset units; then a sheet:
 * parts given from the column menu (with the warning for cells a part cannot
 * read), linking, editing a sheet line from the task (written into the sheet),
 * the sheet card (numbered, folds away); then two tabs kept in step.
 */
const TRACKER = "/workspace/rmit/trackers/0000000d-0000-4000-8000-000000000001";
const TASK = "RMITinerary Pragmatist";

function panel(page: Page) {
  return page.getByTestId("item-panel");
}

function line(page: Page, name: string) {
  return panel(page).locator(`[data-testid="asset-line"][data-asset-name="${name}"]`);
}

async function openTask(page: Page) {
  await openBoard(page, BOARD_URL);
  await clickRowButton(row(page, TASK), `Open ${TASK}`);
  await expect(panel(page)).toBeVisible({ timeout: 20_000 });
  await panel(page).getByTestId("tab-assets").click();
  await expect(panel(page).getByTestId("assets-tab")).toBeVisible({ timeout: 20_000 });
}

/**
 * What the dashboard counts this year: asset units (this year's total, read
 * back from "±change vs last year's total"), and the units under one asset type.
 */
async function dashboardUnits(page: Page, type: string): Promise<{ total: number; ofType: number }> {
  await page.goto("/workspace/rmit/dashboard");
  const units = page.getByRole("button", { name: "Read the dashboard in asset units" });
  await expect(units).toContainText(/vs [\d,]+/, { timeout: 30_000 });
  const text = (await units.textContent()) ?? "";
  const match = text.match(/([+\-−])([\d,]+)\s*·\s*[+\-−]?\d+%\s*vs\s*([\d,]+)/);
  expect(match, `asset units read: ${text}`).not.toBeNull();
  const delta = Number(match![2]!.replace(/,/g, "")) * (match![1] === "+" ? 1 : -1);
  const total = Number(match![3]!.replace(/,/g, "")) + delta;
  // The Asset types list: "Flyer (1 - 2 Pages) 4% 120".
  const entry = page.getByRole("listitem").getByRole("button").filter({ hasText: type });
  const ofType = (await entry.count()) ? Number((await entry.first().innerText()).match(/([\d,]+)\s*$/)![1]!.replace(/,/g, "")) : 0;
  return { total, ofType };
}

/** Opens a column's menu by right-clicking its header, which scrolls a far column into view first. */
async function headerMenu(page: Page, column: string) {
  const header = page.locator("thead th[scope=col]").filter({ has: page.locator(`span[title="${column}"]`) });
  await header.scrollIntoViewIfNeeded();
  await header.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Asset role" })).toBeVisible();
}

/** Opens a column's header menu and gives it a part under Asset role. */
async function giveRole(page: Page, column: string, role: string) {
  await headerMenu(page, column);
  await page.getByRole("menuitem", { name: "Asset role" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${role}`) }).click();
}

async function pickPerson(scope: Locator | Page, page: Page, name: string) {
  await page.getByTestId("people-picker").getByRole("textbox").fill(name);
  await page.getByTestId("people-picker").getByRole("option").first().click();
  await page.getByTestId("people-picker-done").click();
  void scope;
}

test.describe("the asset system", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("task lines: made, assigned, ticked, filtered by To-do, listed in My Work and counted on the dashboard", async ({ page }) => {
    const before = await dashboardUnits(page, "Flyer (1 - 2 Pages)");

    await openTask(page);
    // A line, made from the add box at the top.
    await panel(page).getByTestId("asset-add-input").fill("E2E poster");
    await panel(page).getByTestId("asset-add-submit").click();
    const poster = line(page, "E2E poster");
    await expect(poster).toHaveCount(1, { timeout: 20_000 });

    // Three of them, a type, on me, due today: a draft until Update.
    if ((await poster.getByTestId("asset-toggle").getAttribute("aria-expanded")) !== "true") await poster.getByTestId("asset-toggle").click();
    await poster.getByTestId("asset-quantity-plus").click();
    await poster.getByTestId("asset-quantity-plus").click();
    await poster.getByTestId("asset-type").click();
    await page.getByTestId("asset-type-option-Flyer (1 - 2 Pages)").click();
    await page.keyboard.press("Escape");
    await poster.getByTestId("asset-assignee").click();
    await page.getByPlaceholder("Search people…").fill("Danh");
    // In the open picker: the account menu in the sidebar carries the same name.
    await page.locator("[data-radix-popper-content-wrapper]").getByText("Danh Nguyen").first().click();
    await page.keyboard.press("Escape");
    await poster.getByTestId("asset-due").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Today", exact: true }).click();
    await page.keyboard.press("Escape");
    await poster.getByTestId("asset-update").click();
    await expect(poster.getByTestId("asset-toggle")).toHaveAttribute("aria-expanded", "false", { timeout: 20_000 });

    // A block of two, on someone else.
    await panel(page).getByTestId("asset-add-block").click();
    const blockDialog = page.getByTestId("asset-block-dialog");
    await blockDialog.getByTestId("asset-block-name").fill("E2E kit");
    await blockDialog.getByTestId("asset-block-assignee").click();
    await page.getByPlaceholder("Search people…").fill("Emily");
    await page.locator("[data-radix-popper-content-wrapper]").getByText("Emily Carter").first().click();
    await page.keyboard.press("Escape");
    const names = blockDialog.getByTestId("asset-block-line-name");
    await names.first().fill("Pull-up banner");
    if ((await names.count()) < 2) await blockDialog.getByTestId("asset-block-add-line").click();
    await names.nth(1).fill("Table runner");
    await blockDialog.getByTestId("asset-block-create").click();
    await expect(blockDialog).toBeHidden();
    const block = panel(page).locator('[data-testid="asset-block"][data-block-name="E2E kit"]');
    await expect(block.getByTestId("asset-line")).toHaveCount(2, { timeout: 20_000 });

    // To-do: only my line is left, under a warning that says what is hidden.
    const todo = panel(page).getByTestId("asset-mine");
    await expect(todo).toBeVisible();
    await expect(panel(page).getByTestId("asset-mine-count")).toHaveText("1");
    await todo.click();
    const strip = panel(page).getByTestId("asset-mine-strip");
    await expect(strip).toContainText(/\d+ items? hidden/);
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(1);
    await expect(poster).toHaveCount(1);
    await expect(panel(page).getByTestId("asset-add-input")).toHaveCount(0);
    await panel(page).getByTestId("asset-mine-show-all").click();
    await expect(panel(page).getByTestId("asset-line")).toHaveCount(3);

    // My Work lists the line that is mine.
    await page.goto("/workspace/rmit/my-work");
    await page.getByTestId("my-work-tab-assets").click();
    await expect(page.getByTestId("my-assets").getByText("E2E poster")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("my-assets").getByText("Pull-up banner")).toHaveCount(0);

    // The dashboard counts the new units, requested today: 3 posters, a banner and a runner, the posters as flyers.
    const after = await dashboardUnits(page, "Flyer (1 - 2 Pages)");
    expect(after.total - before.total).toBe(5);
    expect(after.ofType - before.ofType).toBe(3);

    // Ticking the posters off fills the task's progress by that line.
    await openTask(page);
    await line(page, "E2E poster").getByTestId("asset-done").click();
    await expect(line(page, "E2E poster")).toHaveAttribute("data-asset-done", "true", { timeout: 20_000 });
    await expect(panel(page).getByTestId("assets-progress")).toContainText(/1 of 3 items done/);
    // Done work stays counted: the dashboard reports what was asked for, done or not.
    expect((await dashboardUnits(page, "Flyer (1 - 2 Pages)")).total).toBe(after.total);
  });

  test("sheet lines: parts from the column menu, linked, edited from the task, on To-do, in a card of their own", async ({ page }) => {
    await page.goto(TRACKER);
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });

    // Format names each asset, given from its column menu: the sheet holds no
    // task yet, so the settings open on that choice to pick the task.
    await giveRole(page, "Format", "Asset name");
    const dialog = page.getByTestId("task-assets-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("map-name")).toContainText("Format");
    await dialog.getByTestId("task-assets-search").fill(TASK);
    await dialog.getByTestId("task-assets-hits").getByRole("button").first().click();
    await dialog.getByTestId("task-assets-save").click();
    await expect(dialog).toBeHidden();
    const bar = page.getByTestId("linked-sheet-bar");
    await expect(bar).toContainText(TASK, { timeout: 20_000 });
    const count = Number((await bar.innerText()).match(/(\d+) assets?/)![1]);
    expect(count).toBeGreaterThan(0);

    // A text column as the due date: its cells are not dates, so it asks first. Cancel.
    await giveRole(page, "MESSAGE", "Due date");
    const warning = page.getByRole("alertdialog");
    await expect(warning).toContainText("aren’t a date");
    await warning.getByRole("button", { name: "Cancel" }).click();
    await expect(warning).toBeHidden();

    // LIVE DATE reads as dates: given at once, no question. DEVELOPED BY as the PIC: asked, accepted.
    await giveRole(page, "LIVE DATE", "Due date");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await giveRole(page, "DEVELOPED BY", "PIC");
    await page.getByRole("alertdialog").getByRole("button", { name: "Use anyway" }).click();
    // One column a part: the menu names the column that holds Asset name.
    await headerMenu(page, "STATUS");
    await page.getByRole("menuitem", { name: "Asset role" }).click();
    await expect(page.getByRole("menuitem", { name: /^Asset name/ })).toContainText(/[A-Z]$/);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // On the task: a card of its own, numbered lines, and a line edited from there.
    await bar.getByRole("link").first().click();
    await expect(panel(page)).toBeVisible({ timeout: 20_000 });
    await panel(page).getByTestId("tab-assets").click();
    const section = panel(page).getByTestId("tracker-sheet-section");
    await expect(section).toContainText("Sheet");
    await expect(section.getByTestId("tracker-sheet-line")).toHaveCount(count, { timeout: 20_000 });
    await expect(section.getByTestId("tracker-sheet-line").first()).toContainText("1");

    const first = section.getByTestId("tracker-sheet-line").first();
    await first.getByTestId("tracker-sheet-line-open").click();
    const editor = section.getByTestId("tracker-sheet-line-editor");
    await editor.getByTestId("sheet-line-name").fill("E2E renamed format");
    await editor.getByTestId("sheet-line-pic").click();
    await pickPerson(editor, page, "Danh");
    await editor.getByTestId("sheet-line-update").click();
    await expect(section.getByTestId("tracker-sheet-line").first()).toContainText("E2E renamed format", { timeout: 20_000 });

    // It stays put (the change went into the sheet, and the sheet wrote the line back)…
    await page.waitForTimeout(3000);
    await expect(section.getByTestId("tracker-sheet-line").first()).toContainText("E2E renamed format");
    await expect(section.getByTestId("tracker-sheet-line").first().getByRole("img").first()).toBeVisible();

    // …and To-do counts it: only that line, from the sheet.
    await panel(page).getByTestId("asset-mine").click();
    await expect(panel(page).getByTestId("asset-mine-strip")).toBeVisible();
    await expect(section.getByTestId("tracker-sheet-line")).toHaveCount(1);
    await panel(page).getByTestId("asset-mine-show-all").click();

    // The card folds away and remembers it.
    await section.getByTestId("tracker-sheet-collapse").click();
    await expect(section.getByTestId("tracker-sheet-line")).toHaveCount(0);
    await page.reload();
    await panel(page).getByTestId("tab-assets").click();
    await expect(panel(page).getByTestId("tracker-sheet-section").getByTestId("tracker-sheet-line")).toHaveCount(0, { timeout: 20_000 });
    await panel(page).getByTestId("tracker-sheet-collapse").click();
    await expect(panel(page).getByTestId("tracker-sheet-line")).toHaveCount(count);

    // The sheet has the change: the Format cell and the PIC by name.
    await panel(page).getByTestId("open-tracker-sheet").click();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("gridcell", { name: "Format: E2E renamed format" })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: /DEVELOPED BY: Danh/ })).toBeVisible();
  });

  test("two tabs stay in step: a cell typed in the sheet reaches the task, a tick on the task reaches the sheet", async ({ page, context }) => {
    // Link the sheet from one tab.
    await page.goto(TRACKER);
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    await giveRole(page, "Format", "Asset name");
    const dialog = page.getByTestId("task-assets-dialog");
    await dialog.getByTestId("task-assets-search").fill(TASK);
    await dialog.getByTestId("task-assets-hits").getByRole("button").first().click();
    await giveRoleInDialogDone(page);
    await dialog.getByTestId("task-assets-save").click();
    await expect(page.getByTestId("linked-sheet-bar")).toContainText(TASK, { timeout: 20_000 });

    // The task in a second tab.
    const task = await context.newPage();
    await openTask(task);
    const section = panel(task).getByTestId("tracker-sheet-section");
    await expect(section.getByTestId("tracker-sheet-line").first()).toBeVisible({ timeout: 20_000 });

    // Type in the sheet tab: the task tab follows without a reload.
    const formatHeader = page.locator("thead th").filter({ hasText: /^Format$/ });
    const formatIndex = await formatHeader.evaluate((th) => [...th.parentElement!.children].indexOf(th));
    const firstData = page.locator("tbody tr").filter({ has: page.locator(`td:nth-child(${formatIndex + 1})`).filter({ hasText: /\S/ }) }).first();
    await firstData.locator("td").nth(formatIndex).dblclick();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("E2E live edit");
    await page.keyboard.press("Enter");
    await expect(section).toContainText("E2E live edit", { timeout: 20_000 });

    // Tick on the task tab: the sheet tab's STATUS follows.
    const completedBefore = await page.getByRole("gridcell", { name: "STATUS: COMPLETED" }).count();
    await section.getByRole("checkbox", { checked: false }).first().click();
    await expect(page.getByRole("gridcell", { name: "STATUS: COMPLETED" })).toHaveCount(completedBefore + 1, { timeout: 20_000 });
    await task.close();
  });
});

/** In the open settings dialog, counts COMPLETED alone as done (STATUS as the Done column). */
async function giveRoleInDialogDone(page: Page) {
  const dialog = page.getByTestId("task-assets-dialog");
  await dialog.getByTestId("map-done").click();
  await page.getByRole("option", { name: "STATUS", exact: true }).click();
  const chips = dialog.getByLabel("Choices that count as done").getByRole("button");
  for (let i = 0; i < (await chips.count()); i++) {
    const chip = chips.nth(i);
    const want = (await chip.innerText()).trim() === "COMPLETED";
    if ((await chip.getAttribute("aria-pressed")) === "true" ? !want : want) await chip.click();
  }
}
