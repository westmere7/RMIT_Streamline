import { expect, test, type Browser, type Page } from "@playwright/test";
import { clickRowButton, row } from "./helpers";

/**
 * The asset system against a real Supabase project, with two people signed in
 * at once: what one does reaches the other over Postgres realtime, through the
 * row-level security each of them is under. Lines made and assigned on a task,
 * ticked off by the person they are on, a sheet linked with a column made for
 * its PIC, a sheet line edited from the task, My Work and the dashboard.
 *
 * Runs only against a Supabase-backed app (E2E_PROVIDER=supabase), and only on
 * a disposable project: it writes as two people and leaves a sheet linked.
 */
const PROVIDER = process.env.E2E_PROVIDER ?? "local";
const BOARD = "/workspace/rmit/boards/rmitinerary-2026";
const TASK = "RMITinerary Pragmatist";
const TRACKER = "/workspace/rmit/trackers/0000000d-0000-4000-8000-000000000001";
const RUN = Date.now().toString(36);

test.skip(PROVIDER !== "supabase", "Supabase run; set E2E_PROVIDER=supabase against a disposable project");
test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 60_000 });
  return page;
}

function panel(page: Page) {
  return page.getByTestId("item-panel");
}

function line(page: Page, name: string) {
  return panel(page).locator(`[data-testid="asset-line"][data-asset-name="${name}"]`);
}

async function openTask(page: Page) {
  await page.goto(BOARD);
  await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 60_000 });
  await clickRowButton(row(page, TASK), `Open ${TASK}`);
  await expect(panel(page)).toBeVisible({ timeout: 30_000 });
  await panel(page).getByTestId("tab-assets").click();
  await expect(panel(page).getByTestId("assets-tab")).toBeVisible({ timeout: 30_000 });
}

/** Waits for the PostgREST call an action makes, and fails on an error status (an RLS refusal included). */
async function expectWrite(page: Page, table: string, act: () => Promise<void>) {
  const [response] = await Promise.all([page.waitForResponse((r) => r.url().includes(`/rest/v1/${table}`) && r.request().method() !== "GET", { timeout: 30_000 }), act()]);
  expect(response.ok(), `${table} → ${response.status()} ${await response.text().catch(() => "")}`).toBeTruthy();
}

test("two people, one task: lines, assignment, ticking, a linked sheet and its edits all reach the other side live", async ({ browser }) => {
  test.setTimeout(600_000);
  const admin = await signedIn(browser, "admin@rmit.local", "admin123");
  const emily = await signedIn(browser, "emily@rmit.local", "Password123!");
  const name = `SB poster ${RUN}`;

  await openTask(admin);
  await openTask(emily);

  // Admin adds a line; Emily, with the same task open, sees it arrive.
  await expectWrite(admin, "item_assets", async () => {
    await panel(admin).getByTestId("asset-add-input").fill(name);
    await panel(admin).getByTestId("asset-add-submit").click();
  });
  await expect(line(emily, name)).toHaveCount(1, { timeout: 30_000 });

  // Admin puts it on Emily; it reaches her To-do and My Work.
  const adminLine = line(admin, name);
  if ((await adminLine.getByTestId("asset-toggle").getAttribute("aria-expanded")) !== "true") await adminLine.getByTestId("asset-toggle").click();
  await adminLine.getByTestId("asset-assignee").click();
  await admin.getByPlaceholder("Search people…").fill("Emily");
  await admin.locator("[data-radix-popper-content-wrapper]").getByText("Emily Carter").first().click();
  await admin.keyboard.press("Escape");
  await expectWrite(admin, "item_assets", () => adminLine.getByTestId("asset-update").click());
  await expect(panel(emily).getByTestId("asset-mine")).toBeVisible({ timeout: 30_000 });

  // Emily ticks it off; admin sees it ticked.
  await expectWrite(emily, "item_assets", () => line(emily, name).getByTestId("asset-done").click());
  await expect(line(admin, name)).toHaveAttribute("data-asset-done", "true", { timeout: 30_000 });

  // My Work lists it for Emily, under Done or not, by name.
  const myWork = await emily.context().newPage();
  await myWork.goto("/workspace/rmit/my-work");
  await myWork.getByTestId("my-work-tab-assets").click();
  await expect(myWork.getByTestId("my-assets")).toBeVisible({ timeout: 30_000 });
  await myWork.close();

  // Admin links the tracker sheet: Format names the assets, and a new People column is made for the PIC.
  const sheetPage = await admin.context().newPage();
  await sheetPage.goto(TRACKER);
  await expect(sheetPage.getByTestId("tracker-grid")).toBeVisible({ timeout: 60_000 });
  const settingsButton = sheetPage.getByTestId("task-assets-button");
  await settingsButton.click();
  const dialog = sheetPage.getByTestId("task-assets-dialog");
  if (await dialog.getByTestId("task-assets-search").count()) {
    await dialog.getByTestId("task-assets-search").fill(TASK);
    await dialog.getByTestId("task-assets-hits").getByRole("button").first().click({ timeout: 30_000 });
  }
  await dialog.getByTestId("map-name").click();
  await sheetPage.getByRole("option", { name: "Format", exact: true }).click();
  await expectWrite(sheetPage, "tracker_sheets", async () => {
    await dialog.getByTestId("map-pic").click();
    await sheetPage.getByTestId("map-pic-new").click();
  });
  await expect(dialog.getByTestId("map-pic")).toContainText("PIC");
  await expectWrite(sheetPage, "tracker_sheets", () => dialog.getByTestId("task-assets-save").click());
  await expect(sheetPage.getByTestId("linked-sheet-bar")).toContainText(TASK, { timeout: 30_000 });
  await expect(sheetPage.locator("thead th").filter({ hasText: /^PIC/ })).toHaveCount(1);

  // Emily's task panel grows a sheet card, live.
  const emilySheet = panel(emily).getByTestId("tracker-sheet-section");
  await expect(emilySheet.getByTestId("tracker-sheet-line").first()).toBeVisible({ timeout: 30_000 });

  // Admin edits a sheet line from the task: renamed and put on Emily. It is written into the sheet, and reaches Emily.
  await admin.reload();
  await panel(admin).getByTestId("tab-assets").click();
  const adminSheet = panel(admin).getByTestId("tracker-sheet-section");
  await adminSheet.getByTestId("tracker-sheet-line").first().getByTestId("tracker-sheet-line-open").click();
  const editor = adminSheet.getByTestId("tracker-sheet-line-editor");
  await editor.getByTestId("sheet-line-name").fill(`SB sheet line ${RUN}`);
  await editor.getByTestId("sheet-line-pic").click();
  await admin.getByTestId("people-picker").getByRole("textbox").fill("Emily");
  await admin.getByTestId("people-picker").getByRole("option").first().click();
  // Update wakes at the pick, before the list is closed.
  await expect(editor.getByTestId("sheet-line-update")).toBeEnabled();
  await admin.getByTestId("people-picker-done").click();
  await expectWrite(admin, "tracker_sheets", () => editor.getByTestId("sheet-line-update").click());
  await expect(emilySheet).toContainText(`SB sheet line ${RUN}`, { timeout: 30_000 });
  // It stays: the sheet wrote the line back the same.
  await admin.waitForTimeout(4000);
  await expect(adminSheet.getByTestId("tracker-sheet-line").first()).toContainText(`SB sheet line ${RUN}`);
  // And the sheet tab has the new name in its Format cell.
  await expect(sheetPage.getByRole("gridcell", { name: `Format: SB sheet line ${RUN}` })).toBeVisible({ timeout: 30_000 });

  // Emily's To-do now counts the sheet line too.
  await panel(emily).getByTestId("asset-mine").click();
  await expect(panel(emily).getByTestId("asset-mine-strip")).toBeVisible();
  await expect(emilySheet.getByTestId("tracker-sheet-line")).toHaveCount(1, { timeout: 30_000 });

  // The dashboard reads the asset units without error.
  await admin.goto("/workspace/rmit/dashboard");
  await expect(admin.getByRole("button", { name: "Read the dashboard in asset units" })).toContainText(/units/, { timeout: 60_000 });

  // Leave the sheet unlinked again.
  await sheetPage.getByTestId("linked-sheet-settings").click();
  await expectWrite(sheetPage, "tracker_sheets", () => sheetPage.getByTestId("task-assets-unlink").click());
});
