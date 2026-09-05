import { expect, test } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

test.describe("board interactions", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("creates an item from the add row and keeps it after reload", async ({ page }) => {
    const input = page.getByTestId("add-item-Design");
    await input.fill("Back cover artwork");
    await input.press("Enter");
    await expect(row(page, "Back cover artwork")).toBeVisible();
    await expect(input).toHaveValue("");
    await page.reload();
    await expect(row(page, "Back cover artwork")).toBeVisible();
  });

  test("changes a status through the picker", async ({ page }) => {
    const explorer = row(page, "RMITinerary Explorer");
    await explorer.getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Done" }).click();
    await expect(explorer.getByTestId("status-cell")).toContainText("Done");
    await page.reload();
    await expect(row(page, "RMITinerary Explorer").getByTestId("status-cell")).toContainText("Done");
  });

  test("assigns an owner with the person picker", async ({ page }) => {
    const item = row(page, "RMITinerary Independent");
    await item.getByTestId("person-cell").click();
    const picker = page.getByTestId("person-picker");
    await picker.getByPlaceholder("Search people…").fill("Duc");
    await picker.getByText("Duc Tran").click();
    await page.keyboard.press("Escape");
    await expect(item.getByTestId("person-cell")).toHaveAttribute("aria-label", /Tuyet Le, Duc Tran/);
  });

  test("changes a due date", async ({ page }) => {
    const item = row(page, "RMITinerary Independent");
    await item.getByTestId("date-cell").click();
    await page.getByRole("button", { name: "Tomorrow" }).click();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const label = tomorrow.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await expect(item.getByTestId("date-cell")).toContainText(label);
  });

  test("moves an item between groups with drag and drop", async ({ page }) => {
    const source = row(page, "Accessibility review of PDF export");
    const handle = source.getByRole("button", { name: /Drag Accessibility review/ });
    const target = row(page, "RMITinerary Independent");
    await source.hover();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("rows not visible");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + 100, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    const design = page.getByTestId("group-Design");
    await expect(design.locator('[data-item-name="Accessibility review of PDF export"]')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("group-Design").locator('[data-item-name="Accessibility review of PDF export"]')).toBeVisible();
  });

  test("previews the landing slot in the group being dragged over", async ({ page }) => {
    const source = row(page, "Accessibility review of PDF export");
    const handle = source.getByRole("button", { name: /Drag Accessibility/ });
    const target = row(page, "RMITinerary Independent");
    await source.hover();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("rows not visible");

    // No preview before anything moves.
    await expect(page.getByTestId("drop-slot")).toHaveCount(0);

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + 100, to.y + to.height / 2, { steps: 15 });

    // The line belongs to the group under the pointer, not the one dragged from.
    const slot = page.getByTestId("drop-slot");
    await expect(slot).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByTestId("group-Design").getByTestId("drop-slot")).toHaveCount(1);
    await expect(page.getByTestId("group-Backlog").getByTestId("drop-slot")).toHaveCount(0);

    // It is a line across the table, not a gap: it takes no vertical space and
    // the rows around it have not moved.
    const line = await slot.evaluate((el) => {
      const bar = el.firstElementChild as HTMLElement;
      const table = el.closest('[role="grid"]') as HTMLElement;
      return {
        wrapperHeight: Math.round(el.getBoundingClientRect().height),
        barHeight: Math.round(bar.getBoundingClientRect().height),
        barWidth: Math.round(bar.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
      };
    });
    expect(line.wrapperHeight).toBe(0);
    expect(line.barHeight).toBeGreaterThanOrEqual(3);
    // Full width bar the panel's 1px borders.
    expect(line.tableWidth - line.barWidth).toBeLessThanOrEqual(4);

    const movedTo = await target.boundingBox();
    expect(Math.round(movedTo?.y ?? -1)).toBe(Math.round(to.y));

    await page.mouse.up();
    await expect(page.getByTestId("drop-slot")).toHaveCount(0);
    await expect(page.getByTestId("group-Design").locator('[data-item-name="Accessibility review of PDF export"]')).toBeVisible();
  });

  test("previews a landing slot in an empty group", async ({ page }) => {
    await page.getByTestId("add-group").click();
    const empty = page.getByTestId("group-New group");
    await expect(empty).toBeVisible({ timeout: 20_000 });
    await empty.scrollIntoViewIfNeeded();

    // Drag a row from the group above onto the empty one.
    const source = row(page, "Photography shortlist");
    await source.scrollIntoViewIfNeeded();
    await source.hover();
    const handle = source.getByRole("button", { name: /Drag Photography shortlist/ });
    const from = await handle.boundingBox();
    const to = await empty.boundingBox();
    if (!from || !to) throw new Error("rows not visible");

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 });
    // Aim at the body of the empty group, below its header row.
    await page.mouse.move(from.x + 100, to.y + to.height - 12, { steps: 15 });

    const emptyLine = empty.getByTestId("drop-slot");
    await expect(emptyLine).toHaveCount(1, { timeout: 5_000 });
    // Full width and thick in the empty group too.
    const geometry = await emptyLine.evaluate((el) => {
      const bar = el.firstElementChild as HTMLElement;
      const table = el.closest('[role="grid"]') as HTMLElement;
      return { barHeight: Math.round(bar.getBoundingClientRect().height), barWidth: Math.round(bar.getBoundingClientRect().width), tableWidth: Math.round(table.getBoundingClientRect().width) };
    });
    expect(geometry.barHeight).toBeGreaterThanOrEqual(3);
    expect(geometry.tableWidth - geometry.barWidth).toBeLessThanOrEqual(4);

    await page.mouse.up();
    await expect(page.getByTestId("drop-slot")).toHaveCount(0);
    await expect(empty.locator('[data-item-name="Photography shortlist"]')).toBeVisible({ timeout: 20_000 });
  });

  test("filters by owner and by search", async ({ page }) => {
    await page.getByTestId("person-filter").click();
    await page.getByRole("button", { name: "Duc Tran" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("person-filter")).toContainText("1");
    await expect(row(page, "Chinese language adaptation")).toBeVisible();
    await expect(row(page, "RMITinerary Explorer")).toHaveCount(0);

    await page.getByTestId("search-input").fill("Printer");
    await expect(row(page, "Printer quote and paper stock")).toBeVisible();
    await expect(row(page, "Chinese language adaptation")).toHaveCount(0);
    await page.getByTestId("search-input").fill("zzz-no-match");
    await expect(page.getByText("No tasks match these filters.")).toBeVisible();
  });

  test("opens the item panel and posts a comment", async ({ page }) => {
    await row(page, "Cover concept – final artwork").getByTestId("item-name").click();
    const panel = page.getByTestId("item-panel");
    await expect(panel).toContainText("Cover concept – final artwork");
    await expect(page).toHaveURL(/item=/);
    await panel.getByRole("tab", { name: /Updates/ }).click();
    await page.getByTestId("comment-input").fill("Printer confirmed the spot UV area.");
    await page.getByTestId("comment-submit").click();
    await expect(panel.getByTestId("comment").filter({ hasText: "Printer confirmed the spot UV area." })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await page.getByTestId("item-panel").getByRole("tab", { name: /Updates/ }).click();
    await expect(page.getByText("Printer confirmed the spot UV area.")).toBeVisible();
  });

  test("bulk archives selected items", async ({ page }) => {
    await row(page, "RMITinerary 2027 planning kick-off").getByRole("checkbox").check();
    await row(page, "Accessibility review of PDF export").getByRole("checkbox").check();
    await expect(page.getByTestId("bulk-actions")).toContainText("2");
    await page.getByTestId("bulk-actions").getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).last().click();
    await expect(row(page, "RMITinerary 2027 planning kick-off")).toHaveCount(0);
    await expect(page.getByTestId("group-Backlog")).toContainText("0 items");
  });

  test("kanban moves a card between statuses and reflects in the table", async ({ page }) => {
    await switchView(page, "kanban");
    const card = page.getByTestId("kanban-card").filter({ hasText: "RMITinerary Independent" });
    const lane = page.getByTestId("lane-Working On It");
    const from = await card.boundingBox();
    const to = await lane.boundingBox();
    if (!from || !to) throw new Error("kanban not visible");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height - 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 200, { steps: 15 });
    await page.mouse.up();
    await expect(lane.getByTestId("kanban-card").filter({ hasText: "RMITinerary Independent" })).toBeVisible();
    await switchView(page, "table");
    await expect(row(page, "RMITinerary Independent").getByTestId("status-cell")).toContainText("Working On It");
  });
});
