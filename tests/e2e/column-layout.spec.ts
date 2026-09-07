import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";

const headerNames = (page: Page) => page.getByRole("columnheader").allTextContents();

/** Centre of a column header, for dragging. */
async function headerBox(page: Page, name: string) {
  const box = await page.getByRole("columnheader", { name: new RegExp(`^${name}`) }).first().boundingBox();
  if (!box) throw new Error(`header ${name} is not visible`);
  return box;
}

test.describe("columns: alignment, dragging and renaming", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("short values sit under the middle of their header, long ones stay left", async ({ page }) => {
    // Every centred cell type, and the two that stay against the left edge.
    const centred = await row(page, ITEM).evaluateAll((rows) => {
      const cells = [...rows[0]!.querySelectorAll('[role="gridcell"]')];
      return cells.map((cell) => ({
        label: cell.getAttribute("aria-label") ?? "",
        justify: getComputedStyle(cell).justifyContent,
      }));
    });
    const byPrefix = (prefix: string) => centred.find((c) => c.label.startsWith(prefix));
    expect(byPrefix("Status")?.justify, "status").toBe("center");
    expect(byPrefix("Priority")?.justify, "priority").toBe("center");
    expect(byPrefix("Due Date")?.justify, "date").toBe("center");
    expect(byPrefix("Notes")?.justify ?? "center", "a text column is short by nature").toBe("center");
    expect(byPrefix("Dependency")?.justify, "a list of item names reads better left").not.toBe("center");
  });

  test("a number column is centred like the rest", async ({ page }) => {
    await page.getByTestId("add-column").first().click();
    await page.getByRole("menuitem", { name: "Number", exact: true }).click();
    const cell = row(page, ITEM).locator('[aria-label^="Number"]').first();
    await expect(cell).toBeVisible({ timeout: 15000 });
    await expect(cell).toHaveCSS("justify-content", "center");
  });

  test("dragging a header moves the column, and only within its own row", async ({ page }) => {
    const before = await headerNames(page);
    expect(before.slice(0, 4)).toEqual(["Item", "Owner", "Status", "Priority"]);

    const from = await headerBox(page, "Owner");
    const to = await headerBox(page, "Priority");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });

    // The line shows where it will land — one line, in this header row only.
    await expect(page.getByTestId("column-drop-line")).toHaveCount(1);
    await page.mouse.up();

    await expect.poll(() => headerNames(page).then((n) => n.slice(0, 4))).toEqual(["Item", "Status", "Priority", "Owner"]);
    // And it is the board's order now, not a screen state.
    await page.reload();
    await expect.poll(() => headerNames(page).then((n) => n.slice(0, 4)), { timeout: 15000 }).toEqual(["Item", "Status", "Priority", "Owner"]);
  });

  test("clicking a header still opens its menu", async ({ page }) => {
    await page.getByRole("columnheader", { name: /^Status/ }).first().getByRole("button", { name: /column options/ }).click();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("renaming works from the header menu and from the right-click menu", async ({ page }) => {
    await page.getByRole("columnheader", { name: /^Status/ }).first().getByRole("button", { name: /column options/ }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByTestId("column-name-input");
    // The field stays put: the menu closing must not take focus off it.
    await expect(input).toBeFocused({ timeout: 15000 });
    await input.fill("Progress");
    await input.press("Enter");
    await expect.poll(() => headerNames(page)).toContain("Progress");
    await page.reload();
    await expect.poll(() => headerNames(page), { timeout: 15000 }).toContain("Progress");

    // Right-click gets there too.
    await page.getByRole("columnheader", { name: /^Progress/ }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const second = page.getByTestId("column-name-input");
    await expect(second).toBeFocused({ timeout: 15000 });
    await second.fill("Status");
    await second.press("Enter");
    await expect.poll(() => headerNames(page)).toContain("Status");

    // Escape abandons a rename.
    await page.getByRole("columnheader", { name: /^Status/ }).first().getByRole("button", { name: /column options/ }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByTestId("column-name-input").fill("Nonsense");
    await page.getByTestId("column-name-input").press("Escape");
    await expect.poll(() => headerNames(page)).not.toContain("Nonsense");
  });

  test("renaming a column renames the matching one on a linked board", async ({ page }) => {
    // Link an item on this board to one on another board.
    await row(page, ITEM).getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: /link to another item/i }).click();
    const dialog = page.getByTestId("link-item-dialog");
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await page.getByTestId("link-search").fill("Campus banner");
    await dialog.getByRole("button", { name: "Open Day 2026", exact: true }).click();
    await page.getByTestId("link-search").fill("Campus banner artwork – round 2");
    await page.getByTestId("link-candidate").filter({ hasText: "Campus banner artwork – round 2" }).first().click();
    await page.getByTestId("link-submit").click();
    await expect(dialog).toHaveCount(0, { timeout: 20000 });
    await expect(row(page, ITEM).getByTestId("link-indicator")).toBeVisible({ timeout: 20000 });

    // Rename a column that both boards share.
    await page.getByRole("columnheader", { name: /^Priority/ }).first().getByRole("button", { name: /column options/ }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByTestId("column-name-input").fill("Urgency");
    await page.getByTestId("column-name-input").press("Enter");
    await expect.poll(() => headerNames(page), { timeout: 15000 }).toContain("Urgency");

    // The linked board's matching column followed, so the pair still lines up.
    await page.goto("/workspace/rmit/boards/open-day-2026");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20000 });
    await expect.poll(() => headerNames(page), { timeout: 20000 }).toContain("Urgency");
  });
});

test.describe("renaming an item from a menu", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("the field stays open after the menu closes, wherever the pointer goes", async ({ page }) => {
    const item = row(page, ITEM);
    await item.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    const input = page.locator('input[aria-label="Item name"]');
    // What matters is where the caret is, so ask the page directly: while the
    // menu animates out it marks the rest of the page aria-hidden, which upsets
    // locator-based focus assertions for a moment.
    const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await expect.poll(focusedLabel, { timeout: 15000 }).toBe("Item name");
    // A hand flicking away from the row must not close it.
    await page.mouse.move(20, 20, { steps: 6 });
    await page.waitForTimeout(400);
    expect(await focusedLabel()).toBe("Item name");
    await expect(input).toHaveCount(1);

    await input.fill("Renamed from the menu");
    await input.press("Enter");
    await expect(row(page, "Renamed from the menu")).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(row(page, "Renamed from the menu")).toBeVisible({ timeout: 15000 });
  });

  test("the pencil and the right-click menu behave the same way", async ({ page }) => {
    const item = row(page, ITEM);
    const field = page.locator('input[aria-label="Item name"]');
    const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await item.hover();
    await item.getByRole("button", { name: `Rename ${ITEM}` }).click();
    await expect.poll(focusedLabel, { timeout: 15000 }).toBe("Item name");
    await page.keyboard.press("Escape");

    await item.getByTestId("item-name").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect.poll(focusedLabel, { timeout: 15000 }).toBe("Item name");
    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
  });
});

test.describe("search says when it is still loading", () => {
  test("an empty result is an empty result once the board has settled", async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);

    // Nothing is in flight, so nothing claims to be loading.
    await expect(page.getByTestId("search-loading")).toHaveCount(0, { timeout: 20000 });
    await page.getByTestId("search-input").fill("zzz-no-match");
    await expect(page.getByText("No tasks match these filters.")).toBeVisible();
    await expect(page.getByTestId("search-loading")).toHaveCount(0);
  });
});
