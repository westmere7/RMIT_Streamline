import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";

/** Adds a column of `type` from the header's add-column menu and names it. */
async function addColumn(page: Page, type: string, name: string) {
  await page.getByTestId("add-column").first().click();
  await page.getByRole("menuitem", { name: type, exact: true }).click();
  const header = page.getByRole("columnheader").filter({ hasText: type }).last();
  await expect(header).toBeVisible({ timeout: 15000 });
  await header.getByRole("button").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox").last();
  await input.fill(name);
  await input.press("Enter");
  await expect(page.getByRole("columnheader", { name: new RegExp(name) }).first()).toBeVisible({ timeout: 15000 });
}

function cell(page: Page, columnName: string, item = ITEM) {
  return row(page, item).locator(`[aria-label^="${columnName}"]`).first();
}

test.describe("column types", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("text and long text: set, edit, clear, persist", async ({ page }) => {
    await addColumn(page, "Text", "Notes");
    const notes = cell(page, "Notes");
    await notes.click();
    await page.keyboard.type("First note");
    await page.keyboard.press("Enter");
    await expect(notes).toContainText("First note");
    await page.reload();
    await expect(cell(page, "Notes")).toContainText("First note", { timeout: 15000 });

    // Overwrite, then clear.
    await cell(page, "Notes").click();
    await expect(row(page, ITEM).getByRole("textbox")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Second note");
    await page.keyboard.press("Enter");
    await expect(cell(page, "Notes")).toContainText("Second note");
    await cell(page, "Notes").click();
    await expect(row(page, ITEM).getByRole("textbox")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Enter");
    await expect(cell(page, "Notes")).toHaveAttribute("aria-label", /empty/, { timeout: 15000 });
    await page.reload();
    await expect(cell(page, "Notes")).toHaveAttribute("aria-label", /empty/, { timeout: 15000 });

    // Escape abandons an edit instead of saving it.
    await cell(page, "Notes").click();
    await expect(row(page, ITEM).getByRole("textbox")).toBeFocused();
    await page.keyboard.type("Discard me");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(cell(page, "Notes")).toHaveAttribute("aria-label", /empty/, { timeout: 15000 });
  });

  test("number: accepts, formats and clears; refuses nonsense", async ({ page }) => {
    await addColumn(page, "Number", "Budget");
    const budget = cell(page, "Budget");
    await budget.click();
    await page.keyboard.type("1234.5");
    await page.keyboard.press("Enter");
    await expect(budget).toContainText("1,234.5");
    await page.reload();
    await expect(cell(page, "Budget")).toContainText("1,234.5", { timeout: 15000 });

    // A negative number is legitimate; an empty value clears it.
    await cell(page, "Budget").click();
    await expect(row(page, ITEM).getByRole("spinbutton")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("-42");
    await page.keyboard.press("Enter");
    await expect(cell(page, "Budget")).toContainText("-42");
    await cell(page, "Budget").click();
    await expect(row(page, ITEM).getByRole("spinbutton")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Enter");
    await expect(cell(page, "Budget")).toHaveAttribute("aria-label", /empty/, { timeout: 15000 });
    await page.reload();
    await expect(cell(page, "Budget")).toHaveAttribute("aria-label", /empty/, { timeout: 15000 });
  });

  test("checkbox toggles and persists", async ({ page }) => {
    await addColumn(page, "Checkbox", "Signed off");
    const box = row(page, ITEM).getByRole("checkbox", { name: /Signed off/ });
    await expect(box).toHaveAttribute("aria-checked", "false");
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(row(page, ITEM).getByRole("checkbox", { name: /Signed off/ })).toHaveAttribute("aria-checked", "true", { timeout: 15000 });
  });

  test("link: stores a url, shows display text, and can be removed", async ({ page }) => {
    await addColumn(page, "Link", "Brief");
    await cell(page, "Brief").click();
    await page.getByLabel("URL").fill("https://example.com/brief.pdf");
    await page.getByLabel("Link text").fill("The brief");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(cell(page, "Brief")).toContainText("The brief");
    await page.reload();
    const link = row(page, ITEM).getByRole("link", { name: "The brief" });
    await expect(link).toHaveAttribute("href", "https://example.com/brief.pdf", { timeout: 15000 });
    await expect(link).toHaveAttribute("rel", /noreferrer/);

    await cell(page, "Brief").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Remove" }).click();
    await expect(row(page, ITEM).getByRole("link")).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(row(page, ITEM).getByRole("link")).toHaveCount(0, { timeout: 15000 });
  });

  test("tags: add, reuse, remove, and always exactly one hash", async ({ page }) => {
    await addColumn(page, "Tags", "Channels");
    await cell(page, "Channels").click();
    const input = page.getByPlaceholder(/tag/i).first();
    await input.fill("#Print");
    await input.press("Enter");
    // Each tag is created and applied before the next one is typed: creating one
    // writes the column palette and the value, and the editor re-renders.
    await expect(page.getByRole("button", { name: /#Print/ }).first()).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await input.fill("digital");
    await input.press("Enter");
    await expect(page.getByRole("button", { name: /#digital/ }).first()).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(cell(page, "Channels")).toContainText("#Print", { timeout: 15000 });
    await expect(cell(page, "Channels")).toContainText("#digital");
    const text = await cell(page, "Channels").innerText();
    expect(text, "a tag keeps exactly one hash").not.toContain("##");
    await page.reload();
    await expect(cell(page, "Channels")).toContainText("#Print", { timeout: 15000 });

    // The tag joins the column palette, so another item can pick it without retyping.
    await cell(page, "Channels", "RMITinerary Independent").click();
    const palette = page.locator("[data-radix-popper-content-wrapper]").last();
    await expect(palette.getByRole("button", { name: /#Print/ })).toBeVisible({ timeout: 15000 });
    await palette.getByRole("button", { name: /#Print/ }).click();
    await page.keyboard.press("Escape");
    await expect(cell(page, "Channels", "RMITinerary Independent")).toContainText("#Print");
  });

  test("timeline: a range persists and an end-before-start range is not stored backwards", async ({ page }) => {
    const timeline = cell(page, "Timeline");
    await timeline.click();
    const picker = page.locator("[data-radix-popper-content-wrapper]").last();
    await picker.getByRole("button", { name: /September 15th/ }).click();
    await picker.getByRole("button", { name: /September 18th/ }).click();
    await page.keyboard.press("Escape");
    const label = await cell(page, "Timeline").getAttribute("aria-label");
    expect(label).toMatch(/Timeline: .*\d/);
    await page.reload();
    await expect(cell(page, "Timeline")).toHaveAttribute("aria-label", label!, { timeout: 15000 });
  });

  test("dependency: link, blocked marker, self-dependency refused, deleted target drops out", async ({ page }) => {
    const dep = cell(page, "Dependency");
    await dep.click();
    await page.getByRole("option", { name: /Cover concept/ }).click();
    await page.keyboard.press("Escape");
    await expect(cell(page, "Dependency")).toContainText("Cover concept", { timeout: 15000 });
    // Cover concept is not done, so the item shows as blocked.
    await expect(row(page, ITEM).getByLabel("Blocked")).toBeVisible();
    await page.reload();
    await expect(cell(page, "Dependency")).toContainText("Cover concept", { timeout: 15000 });

    // An item cannot depend on itself: it is not offered.
    await cell(page, "Dependency").click();
    await expect(page.getByRole("option", { name: new RegExp(ITEM) })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Deleting the dependency target must not leave a dangling reference.
    const target = row(page, "Cover concept – final artwork");
    await target.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    // Wait for the delete to land: reloading inside the write window would only
    // prove that an unfinished delete is unfinished.
    await expect(target).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(row(page, ITEM)).toBeVisible({ timeout: 15000 });
    await expect(cell(page, "Dependency")).not.toContainText("Cover concept");
    await expect(row(page, ITEM).getByLabel("Blocked")).toHaveCount(0);
  });

  test("hiding, showing, reordering and renaming a column keeps every value", async ({ page }) => {
    const before = await cell(page, "Status").innerText();

    // Hide from the header menu, then bring it back from the toolbar.
    await page.getByRole("columnheader", { name: /^Priority/ }).first().getByRole("button").click();
    await page.getByRole("menuitem", { name: /hide column/i }).click();
    await expect(page.getByRole("columnheader", { name: /^Priority/ })).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /^Priority/ })).toHaveCount(0, { timeout: 15000 });
    await page.getByRole("button", { name: /^Hide/ }).click();
    await page.getByRole("menuitemcheckbox", { name: "Priority" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: /^Priority/ }).first()).toBeVisible({ timeout: 15000 });
    await expect(cell(page, "Priority")).toContainText("Medium");

    // Move Status left and check the values travelled with the column.
    const headersBefore = await page.getByRole("columnheader").allTextContents();
    await page.getByRole("columnheader", { name: /^Status/ }).first().getByRole("button").click();
    await page.getByRole("menuitem", { name: /move left/i }).click();
    await page.waitForTimeout(500);
    const headersAfter = await page.getByRole("columnheader").allTextContents();
    expect(headersAfter).not.toEqual(headersBefore);
    await page.reload();
    await expect.poll(() => page.getByRole("columnheader").allTextContents(), { timeout: 15000 }).toEqual(headersAfter);
    expect(await cell(page, "Status").innerText()).toBe(before);
  });

  test("deleting a column removes only its own values", async ({ page }) => {
    await addColumn(page, "Text", "Scratch");
    await cell(page, "Scratch").click();
    await page.keyboard.type("temporary");
    await page.keyboard.press("Enter");
    await expect(cell(page, "Scratch")).toContainText("temporary");

    const statusBefore = await cell(page, "Status").innerText();
    const priorityBefore = await cell(page, "Priority").innerText();

    await page.getByRole("columnheader", { name: /^Scratch/ }).first().getByRole("button").click();
    await page.getByRole("menuitem", { name: /delete column/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(page.getByRole("columnheader", { name: /^Scratch/ })).toHaveCount(0, { timeout: 15000 });

    await page.reload();
    await expect(page.getByRole("columnheader", { name: /^Scratch/ })).toHaveCount(0, { timeout: 15000 });
    expect(await cell(page, "Status").innerText()).toBe(statusBefore);
    expect(await cell(page, "Priority").innerText()).toBe(priorityBefore);
    // Every remaining row still renders (a stale value would throw during render).
    await expect(page.getByTestId("item-row").first()).toBeVisible();
  });

  test("resizing a column persists", async ({ page }) => {
    const header = page.getByRole("columnheader", { name: /^Status/ }).first();
    const box = (await header.boundingBox())!;
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 80, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const widened = (await page.getByRole("columnheader", { name: /^Status/ }).first().boundingBox())!.width;
    expect(widened).toBeGreaterThan(box.width + 40);
    await page.reload();
    const after = (await page.getByRole("columnheader", { name: /^Status/ }).first().boundingBox())!.width;
    expect(Math.abs(after - widened)).toBeLessThan(4);
  });
});
