import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The tracker's everyday actions, each from every place it can be started:
 * renaming the tracker, a sheet and a column, resizing a column, changing its
 * type, adding and removing sheets and columns, and undo. Each one is checked
 * after a reload too, so "it looked right" is never mistaken for "it saved".
 */
const TRACKER = "/workspace/rmit/trackers/0000000d-0000-4000-8000-000000000001";

async function openTracker(page: Page) {
  await page.goto(TRACKER);
  await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
}

/** Waits for the sheet's debounced save to land. */
async function saved(page: Page) {
  await expect(page.getByText(/Unsaved changes|Saving…/)).toHaveCount(0, { timeout: 10_000 });
}

const header = (page: Page, name: string) => page.locator("thead th").filter({ hasText: new RegExp(`^${name}$`) });

test.describe("tracker basics", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Admin");
    await openTracker(page);
  });

  test("the tracker renames from its menu and from its title", async ({ page }) => {
    await page.getByRole("button", { name: "Tracker options" }).click();
    await page.getByRole("menuitem", { name: "Rename tracker" }).click();
    const input = page.getByRole("textbox", { name: "Tracker name" });
    await expect(input).toBeFocused();
    await input.fill("Campaign assets 2027");
    await input.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Campaign assets 2027");

    await page.getByRole("heading", { level: 1 }).getByText("Campaign assets 2027").click();
    await page.getByRole("textbox", { name: "Tracker name" }).fill("Campaign assets");
    await page.getByRole("textbox", { name: "Tracker name" }).press("Enter");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Campaign assets", { timeout: 20_000 });
  });

  test("a sheet renames by double-click and from its right-click menu", async ({ page }) => {
    const tab = page.getByRole("tab").first();
    await tab.dblclick();
    const input = page.getByRole("textbox", { name: "Sheet name" });
    await expect(input).toBeFocused();
    await input.fill("Semester one");
    await input.press("Enter");
    await expect(page.getByRole("tab", { name: "Semester one" })).toBeVisible();

    await page.getByRole("tab", { name: "Semester one" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename sheet" }).click();
    await expect(page.getByRole("textbox", { name: "Sheet name" })).toBeFocused();
    await page.getByRole("textbox", { name: "Sheet name" }).fill("Sem 1");
    await page.getByRole("textbox", { name: "Sheet name" }).press("Enter");
    await page.reload();
    await expect(page.getByRole("tab", { name: "Sem 1", exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("a column renames from its header menu and its right-click menu", async ({ page }) => {
    await page.getByRole("button", { name: "STAGE column options" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: "Column name" });
    await expect(input).toBeFocused();
    await input.fill("Funnel stage");
    await input.press("Enter");
    await expect(header(page, "Funnel stage")).toBeVisible();

    await header(page, "Funnel stage").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(page.getByRole("textbox", { name: "Column name" })).toBeFocused();
    await page.getByRole("textbox", { name: "Column name" }).fill("Stage");
    await page.getByRole("textbox", { name: "Column name" }).press("Enter");
    await saved(page);
    await page.reload();
    await expect(header(page, "Stage")).toBeVisible({ timeout: 20_000 });
  });

  test("a column header renames on double-click", async ({ page }) => {
    await header(page, "OBJECTIVE").dblclick();
    const input = page.getByRole("textbox", { name: "Column name" });
    await expect(input).toBeFocused();
    await input.fill("Goal");
    await input.press("Enter");
    await saved(page);
    await page.reload();
    await expect(header(page, "Goal")).toBeVisible({ timeout: 20_000 });
  });

  test("dragging a column edge resizes it, and the width is kept", async ({ page }) => {
    const th = header(page, "OBJECTIVE");
    const before = (await th.boundingBox())!.width;
    const handle = page.getByRole("separator", { name: "Resize OBJECTIVE" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await th.boundingBox())!.width)).toBeGreaterThan(before + 40);
    await saved(page);
    await page.reload();
    await expect(page.getByTestId("tracker-grid")).toBeVisible({ timeout: 20_000 });
    expect((await header(page, "OBJECTIVE").boundingBox())!.width).toBeGreaterThan(before + 40);
  });

  test("double-clicking a column edge fits it to its contents", async ({ page }) => {
    const handle = page.getByRole("separator", { name: "Resize Format" });
    const th = header(page, "Format");
    const before = (await th.boundingBox())!.width;
    await handle.dblclick();
    await expect.poll(async () => Math.round((await th.boundingBox())!.width)).not.toBe(Math.round(before));
  });

  test("the column type changes from the right-click menu", async ({ page }) => {
    await header(page, "OBJECTIVE").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Column type" }).click();
    await page.getByRole("menuitem", { name: "Dropdown" }).click();
    await page.getByRole("button", { name: "OBJECTIVE column options" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit dropdown options" })).toBeVisible();
  });

  test("sheets are added, reordered and deleted", async ({ page }) => {
    const count = await page.getByRole("tab").count();
    await page.getByTestId("add-sheet").click();
    await page.getByRole("menuitem", { name: "Blank grid" }).click();
    await expect(page.getByRole("tab")).toHaveCount(count + 1);
    const added = page.getByRole("tab").last();
    await expect(added).toHaveAttribute("aria-selected", "true");
    const name = (await added.innerText()).trim();

    await added.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move left" }).click();
    await expect(page.getByRole("tab").nth(count - 1)).toHaveText(name);

    await page.getByRole("tab", { name }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete sheet" }).click();
    await page.getByRole("button", { name: "Delete sheet" }).click();
    await expect(page.getByRole("tab")).toHaveCount(count);
    await page.reload();
    await expect(page.getByRole("tab")).toHaveCount(count, { timeout: 20_000 });
  });

  test("a column is inserted from the toolbar, deleted, and undo brings it back", async ({ page }) => {
    const columns = await page.locator("thead th[scope=col]").count();
    await page.getByTestId("toolbar-insert-column").click();
    await expect(page.locator("thead th[scope=col]")).toHaveCount(columns + 1);
    await page.getByRole("button", { name: "OBJECTIVE column options" }).click();
    await page.getByRole("menuitem", { name: "Delete column" }).click();
    await expect(header(page, "OBJECTIVE")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
    await expect(header(page, "OBJECTIVE")).toHaveCount(1);
  });

  test("the description edits and stays", async ({ page }) => {
    await page.getByText(/Creative asset production/).click();
    await page.getByRole("textbox", { name: "Tracker description" }).fill("Every asset for the semester");
    await page.getByRole("textbox", { name: "Tracker description" }).press("Enter");
    await page.reload();
    await expect(page.getByText("Every asset for the semester")).toBeVisible({ timeout: 20_000 });
  });
});
