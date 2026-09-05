import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

async function names(page: Page) {
  return page.getByTestId("item-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-item-name")!));
}

async function openFilters(page: Page) {
  await page.getByTestId("filter-button").click();
  await expect(page.getByTestId("filter-panel")).toBeVisible();
}

test.describe("filtering, sorting, bulk actions and drag and drop", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("status, priority and group filters combine, and clear again", async ({ page }) => {
    const all = await names(page);
    await openFilters(page);
    await page.getByTestId("filter-panel").getByText("Working On It").click();
    await page.keyboard.press("Escape");
    const working = await names(page);
    expect(working.length).toBeGreaterThan(0);
    expect(working.length).toBeLessThan(all.length);
    for (const name of working) {
      await expect(row(page, name).getByTestId("status-cell")).toContainText("Working On It");
    }

    // Add a priority filter: the result is the intersection.
    await openFilters(page);
    await page.getByTestId("filter-panel").getByText("Critical").click();
    await page.keyboard.press("Escape");
    const both = await names(page);
    expect(both.length).toBeLessThanOrEqual(working.length);
    for (const name of both) {
      await expect(row(page, name).getByTestId("priority-cell")).toContainText("Critical");
    }

    // A filter that matches nothing explains itself.
    await openFilters(page);
    await page.getByTestId("filter-panel").getByText("Stuck").click();
    await page.getByTestId("filter-panel").getByText("Working On It").click();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/no tasks match these filters/i)).toBeVisible({ timeout: 15000 });

    // Filters are view state, not board state: a reload clears them.
    await page.reload();
    await expect.poll(() => names(page).then((n) => n.length), { timeout: 15000 }).toBe(all.length);

    // And clearing them by hand works too.
    await openFilters(page);
    await page.getByTestId("filter-panel").getByText("Stuck").click();
    await expect.poll(() => names(page).then((n) => n.length), { timeout: 15000 }).toBeLessThan(all.length);
    await page.getByTestId("filter-panel").getByRole("button", { name: /clear all/i }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => names(page).then((n) => n.length), { timeout: 15000 }).toBe(all.length);
  });

  test("search narrows the board and combines with a filter", async ({ page }) => {
    const search = page.getByTestId("search-input");
    await search.fill("RMITinerary");
    await expect.poll(() => names(page), { timeout: 15000 }).toEqual(expect.arrayContaining(["RMITinerary Explorer"]));
    const found = await names(page);
    expect(found.every((n) => n.toLowerCase().includes("rmitinerary"))).toBe(true);

    // Case-insensitive, and no match says so.
    await search.fill("rmitINERARY");
    expect((await names(page)).length).toBe(found.length);
    await search.fill("zzz-nothing-matches");
    await expect(page.getByText(/no tasks match these filters/i)).toBeVisible({ timeout: 15000 });

    // Special characters are treated literally, not as a regex.
    await search.fill("(*)");
    await expect(page.getByText(/no tasks match these filters/i)).toBeVisible();
    await search.fill("");
    await expect.poll(() => names(page).then((n) => n.length), { timeout: 15000 }).toBeGreaterThan(5);
  });

  test("sorting orders by name and by due date, both directions, and clears", async ({ page }) => {
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Item name" }).click();
    await page.keyboard.press("Escape");
    const design = () => page.getByTestId("group-Design").getByTestId("item-row").evaluateAll((r) => r.map((x) => x.getAttribute("data-item-name")!));
    const asc = await design();
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));

    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitem", { name: /descending/i }).click();
    await page.keyboard.press("Escape");
    const desc = await design();
    expect(desc).toEqual([...asc].reverse());

    // Sorting is view state: a reload returns to the board's own order.
    await page.reload();
    await expect.poll(design, { timeout: 15000 }).not.toEqual(desc);

    // Clearing by hand does the same.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Item name" }).click();
    await expect.poll(design, { timeout: 15000 }).toEqual(asc);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitem", { name: /clear sort/i }).click();
    await page.keyboard.press("Escape");
    const cleared = await design();
    expect(cleared).not.toEqual(asc);
  });

  test("sorting by due date puts empty values last", async ({ page }) => {
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Due date" }).click();
    await page.keyboard.press("Escape");
    const rows = await page.getByTestId("group-Production").getByTestId("item-row").evaluateAll((els) =>
      els.map((el) => ({
        name: el.getAttribute("data-item-name"),
        due: el.querySelector('[data-testid="date-cell"]')?.getAttribute("aria-label") ?? "",
      })),
    );
    const emptyIndexes = rows.map((r, i) => (/not set/.test(r.due) ? i : -1)).filter((i) => i >= 0);
    const datedIndexes = rows.map((r, i) => (/not set/.test(r.due) ? -1 : i)).filter((i) => i >= 0);
    if (emptyIndexes.length && datedIndexes.length) {
      expect(Math.min(...emptyIndexes)).toBeGreaterThan(Math.max(...datedIndexes));
    }
  });

  test("bulk select, move, archive and delete", async ({ page }) => {
    const design = page.getByTestId("group-Design");
    await design.getByRole("checkbox", { name: /Select all items in Design/ }).click();
    const bulk = page.getByTestId("bulk-actions");
    await expect(bulk).toBeVisible();
    const count = await design.getByTestId("item-row").count();
    await expect(bulk).toContainText(String(count));

    // Move them all to Backlog.
    await bulk.getByRole("button", { name: /move to/i }).click();
    await page.getByRole("menuitem", { name: /Backlog/ }).click();
    await expect(page.getByTestId("group-Design").getByTestId("item-row")).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("group-Design").getByTestId("item-row")).toHaveCount(0, { timeout: 15000 });

    // Selection does not survive navigation.
    await expect(page.getByTestId("bulk-actions")).toHaveCount(0);

    // Select two in Backlog and archive them.
    const backlogRows = page.getByTestId("group-Backlog").getByTestId("item-row");
    await expect(backlogRows.first()).toBeVisible({ timeout: 15000 });
    const before = await backlogRows.count();
    await backlogRows.nth(0).getByRole("checkbox").click();
    await backlogRows.nth(1).getByRole("checkbox").click();
    await expect(page.getByTestId("bulk-actions")).toContainText("2");
    await page.getByTestId("bulk-actions").getByRole("button", { name: /archive/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /archive/i }).click();
    await expect(backlogRows).toHaveCount(before - 2, { timeout: 15000 });

    // And delete one.
    await backlogRows.nth(0).getByRole("checkbox").click();
    await page.getByTestId("bulk-actions").getByRole("button", { name: /delete/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(backlogRows).toHaveCount(before - 3, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("group-Backlog").getByTestId("item-row")).toHaveCount(before - 3, { timeout: 15000 });
  });

  test("dragging a row within a group changes the stored order", async ({ page }) => {
    const design = () => page.getByTestId("group-Design").getByTestId("item-row").evaluateAll((r) => r.map((x) => x.getAttribute("data-item-name")!));
    const before = await design();
    const first = row(page, before[0]!);
    const handle = first.getByRole("button", { name: `Drag ${before[0]}` });
    const target = row(page, before[2]!);
    await first.hover();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect.poll(design, { timeout: 15000 }).not.toEqual(before);
    const after = await design();
    expect(after).toHaveLength(before.length);
    expect([...after].sort()).toEqual([...before].sort());
    await page.reload();
    await expect.poll(design, { timeout: 15000 }).toEqual(after);
  });

  test("repeated drags between groups keep every item exactly once", async ({ page }) => {
    const all = async () => (await names(page)).sort();
    const before = await all();
    for (let i = 0; i < 3; i++) {
      const item = row(page, "RMITinerary Independent");
      await item.scrollIntoViewIfNeeded();
      await item.hover();
      const handle = item.getByRole("button", { name: /Drag RMITinerary Independent/ });
      const targetGroup = i % 2 === 0 ? "group-Production" : "group-Design";
      const target = page.getByTestId(targetGroup).getByTestId("item-row").first();
      await target.scrollIntoViewIfNeeded();
      const from = (await handle.boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y + 20, { steps: 5 });
      await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
    expect(await all()).toEqual(before);
    await page.reload();
    await expect.poll(all, { timeout: 15000 }).toEqual(before);
  });

  test("kanban: a card moved between lanes keeps its new status after a reload", async ({ page }) => {
    await switchView(page, "kanban");
    const card = page.getByTestId("kanban-card").filter({ hasText: "RMITinerary Independent" });
    await expect(card).toBeVisible({ timeout: 15000 });
    const target = page.getByTestId("lane-Done");
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height - 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 200, { steps: 15 });
    await page.mouse.up();
    await expect(target.getByTestId("kanban-card").filter({ hasText: "RMITinerary Independent" })).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("lane-Done").getByTestId("kanban-card").filter({ hasText: "RMITinerary Independent" })).toBeVisible({ timeout: 15000 });
    await switchView(page, "table");
    await expect(row(page, "RMITinerary Independent").getByTestId("status-cell")).toContainText("Done");
  });
});
