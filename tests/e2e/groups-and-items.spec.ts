import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const UNICODE = "Duong sach · 日本語 · emoji 🎉 · <script>alert(1)</script> · quoted & apostrophe";

async function addItem(page: Page, group: string, name: string) {
  const input = page.getByTestId(`add-item-${group}`);
  await input.fill(name);
  await input.press("Enter");
}

/** Item names in DOM order, top to bottom. */
async function order(page: Page) {
  return page.getByTestId("item-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-item-name")));
}

test.describe("groups, items and subitems", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("group lifecycle: create, rename, duplicate, collapse, delete with items", async ({ page }) => {
    await page.getByTestId("add-group").click();
    const group = page.getByTestId("group-New group");
    await expect(group).toBeVisible({ timeout: 15000 });

    await group.getByRole("heading").dblclick();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Duplicate name");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("group-Duplicate name")).toBeVisible();

    await addItem(page, "Duplicate name", "Only child");
    await expect(row(page, "Only child")).toBeVisible();

    // Duplicating copies the items too, under a distinct group.
    await page.getByTestId("group-Duplicate name").getByRole("heading").click({ button: "right" });
    await page.getByRole("menuitem", { name: /duplicate group/i }).click();
    await expect(page.getByTestId(/^group-Duplicate name/)).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('[data-item-name="Only child"]')).toHaveCount(2);

    // Collapse persists across a reload.
    await page.getByTestId("group-Design").getByRole("button", { name: /Collapse Design/ }).click();
    await expect(page.getByTestId("group-Design").getByRole("button", { name: /Expand Design/ })).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("group-Design").getByRole("button", { name: /Expand Design/ })).toBeVisible({ timeout: 15000 });

    // Deleting a group takes its items with it and nothing else.
    const totalBefore = await page.getByTestId("item-row").count();
    await page.getByTestId("group-Duplicate name").first().getByRole("heading").click({ button: "right" });
    await page.getByRole("menuitem", { name: /delete group/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(page.getByTestId(/^group-Duplicate name/)).toHaveCount(1, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("item-row")).toHaveCount(totalBefore - 1, { timeout: 15000 });
  });

  test("reordering groups sticks after a reload", async ({ page }) => {
    const names = () => page.getByTestId(/^group-/).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const before = await names();
    const handle = page.getByRole("button", { name: /Drag to reorder Backlog/ });
    const target = page.getByTestId("group-Production").getByRole("heading");
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("group handles not visible");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 40, { steps: 5 });
    await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = await names();
    expect(after).not.toEqual(before);
    await page.reload();
    await expect.poll(names, { timeout: 15000 }).toEqual(after);
  });

  test("item names: empty is refused, long and unicode names survive a reload", async ({ page }) => {
    const input = page.getByTestId("add-item-Design");
    const before = await page.getByTestId("item-row").count();
    await input.fill("   ");
    await input.press("Enter");
    await page.waitForTimeout(400);
    expect(await page.getByTestId("item-row").count(), "blank name should not create a row").toBe(before);

    const long = "L" + "o".repeat(400) + "ng name";
    await addItem(page, "Design", long);
    await addItem(page, "Design", UNICODE);
    await expect(page.locator(`[data-item-name=${JSON.stringify(UNICODE)}]`)).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId("item-row")).toHaveCount(before + 2, { timeout: 15000 });
    // The angle brackets in the name stayed text: nothing was parsed into an element.
    const injected = await page.evaluate(() => [...document.querySelectorAll("script")].some((s) => s.textContent?.includes("alert(1)")));
    expect(injected, "item name must not be parsed as markup").toBe(false);
    await expect(page.locator(`[data-item-name=${JSON.stringify(UNICODE)}]`)).toHaveCount(1);
    const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("creating ten items in a burst keeps all of them, in order", async ({ page }) => {
    const input = page.getByTestId("add-item-Backlog");
    for (let i = 1; i <= 10; i++) {
      await input.fill(`Burst ${i}`);
      await input.press("Enter");
    }
    await expect(page.locator('[data-item-name^="Burst "]')).toHaveCount(10, { timeout: 20000 });
    await page.reload();
    await expect(page.locator('[data-item-name^="Burst "]')).toHaveCount(10, { timeout: 20000 });
    const names = await page.getByTestId("group-Backlog").getByTestId("item-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-item-name")));
    expect(names.filter((n) => n?.startsWith("Burst "))).toEqual(Array.from({ length: 10 }, (_, i) => `Burst ${i + 1}`));
  });

  test("duplicate copies the values, archive and delete remove the row", async ({ page }) => {
    const source = row(page, "RMITinerary Pragmatist");
    await source.getByRole("button", { name: /More actions for RMITinerary Pragmatist/ }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    const copy = page.locator('[data-item-name="RMITinerary Pragmatist (copy)"]');
    await expect(copy).toBeVisible({ timeout: 15000 });
    await expect(copy.getByTestId("status-cell")).toContainText("Working On It");
    await page.reload();
    await expect(copy).toBeVisible({ timeout: 15000 });

    await copy.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(copy).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(copy).toHaveCount(0);

    const victim = row(page, "RMITinerary Independent");
    await victim.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(victim).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(victim).toHaveCount(0);
  });

  test("moving an item between groups through the menu persists", async ({ page }) => {
    const item = row(page, "Accessibility review of PDF export");
    await item.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: /move to group/i }).hover();
    await page.getByRole("menuitem", { name: /^\s*Production\s*$/ }).click();
    await expect(page.getByTestId("group-Production").locator('[data-item-name="Accessibility review of PDF export"]')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("group-Production").locator('[data-item-name="Accessibility review of PDF export"]')).toBeVisible({ timeout: 15000 });
    // and it left the group it came from
    await expect(page.getByTestId("group-Backlog").locator('[data-item-name="Accessibility review of PDF export"]')).toHaveCount(0);
  });

  test("subitems: add, rename, persist, and vanish with their parent", async ({ page }) => {
    const parent = row(page, "Cover concept – final artwork");
    await parent.getByRole("button", { name: /Add subitem/ }).click();
    const input = page.getByPlaceholder(/subitem/i).first();
    await input.fill("Sub one");
    await input.press("Enter");
    await input.fill("Sub two");
    await input.press("Enter");
    await expect(page.getByTestId("subitem-row")).toHaveCount(2, { timeout: 15000 });
    await page.reload();
    // Expansion itself is view state; what must survive is the subitems.
    const expander = row(page, "Cover concept – final artwork").getByRole("button", { name: /Show 2 subitems/ });
    await expect(expander).toBeVisible({ timeout: 15000 });
    await expander.click();
    await expect(page.getByTestId("subitem-row")).toHaveCount(2, { timeout: 15000 });

    // A subitem is not a top-level row.
    expect(await order(page)).not.toContain("Sub one");

    // Deleting the parent removes the subitems as well.
    await parent.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(parent).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("subitem-row")).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText("Sub one")).toHaveCount(0);
  });

  test("an item deep link opens the detail panel and survives a reload", async ({ page }) => {
    const item = row(page, "RMITinerary Explorer");
    await item.getByRole("button", { name: /Open RMITinerary Explorer/ }).click();
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary Explorer");
    await expect(page).toHaveURL(/item=/);
    const url = page.url();
    await page.reload();
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary Explorer", { timeout: 15000 });
    await page.goto("/workspace/rmit");
    await page.goto(url);
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary Explorer", { timeout: 15000 });
  });

  test("a deleted item's deep link does not hang the board", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/rmitinerary-2026?item=00000006-0000-4000-8000-000000000999");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("item-panel")).toContainText(/item not found/i, { timeout: 15000 });
  });
});
