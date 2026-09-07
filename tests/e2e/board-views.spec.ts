import { expect, test } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

/**
 * What each board view shows beyond a list of names: the Kanban's lane
 * dimension and card details, the Timeline's zoom and undated items, the
 * Calendar's week layout, the Gantt's subitems and dependencies, the Workload's
 * grid and the Chart's slicing. All read from the same filtered board model.
 */
test.describe("board views", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("kanban lanes by status, priority, person or group, and cards carry their details", async ({ page }) => {
    await switchView(page, "kanban");
    await expect(page.getByTestId("lane-Done")).toBeVisible({ timeout: 15000 });
    const card = page.locator('[data-testid="kanban-card"][data-item-name="RMITinerary High Achiever"]');
    await expect(card).toBeVisible();
    // Subitem progress and the owner are on the card.
    await expect(card.getByTestId("card-subitems")).toBeVisible();
    await expect(card.getByRole("img", { name: "Danh Nguyen" })).toBeVisible();

    await page.getByTestId("kanban-lanes-priority").click();
    await expect(page.getByTestId("lane-Critical")).toBeVisible({ timeout: 15000 });
    // Status is now shown on the card instead of being the lane.
    await expect(page.locator('[data-testid="kanban-card"][data-item-name="RMITinerary High Achiever"]')).toContainText("Done");

    await page.getByTestId("kanban-lanes-person").click();
    await expect(page.getByTestId("lane-Danh Nguyen")).toBeVisible({ timeout: 15000 });

    await page.getByTestId("kanban-lanes-group").click();
    await expect(page.getByTestId("lane-Design")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("lane-Design").locator('[data-item-name="RMITinerary High Achiever"]')).toBeVisible();

    // A lane collapses to a strip and comes back.
    await page.getByRole("button", { name: "Collapse Design" }).click();
    await expect(page.getByRole("button", { name: "Expand Design" })).toBeVisible();
    await page.getByRole("button", { name: "Expand Design" }).click();
    await expect(page.getByRole("button", { name: "Collapse Design" })).toBeVisible();

    // Lanes can be washed in their colour, and the choice is remembered for this person on this board.
    await page.getByTestId("kanban-tint").click();
    await expect(page.getByTestId("kanban-tint")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByTestId("kanban-tint")).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await expect(page.getByTestId("lane-Design")).toBeVisible();
    await page.getByTestId("kanban-tint").click();

    // Clicking anywhere on a card opens it, and the panel floats over the lanes instead of squeezing them.
    const lanesBefore = (await page.getByTestId("kanban-lanes-scroller").boundingBox())!.width;
    await page.locator('[data-testid="kanban-card"][data-item-name="RMITinerary High Achiever"]').click({ position: { x: 20, y: 60 } });
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary High Achiever", { timeout: 15000 });
    expect((await page.getByTestId("kanban-lanes-scroller").boundingBox())!.width).toBe(lanesBefore);
    await page.getByTestId("close-panel").click();
  });

  test("timeline zooms, colours bars by status, and lists items without a date", async ({ page }) => {
    await switchView(page, "timeline");
    await expect(page.getByTestId("timeline")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("timeline-bar").first()).toBeVisible();
    await page.getByTestId("timeline-zoom-month").click();
    await expect(page.getByTestId("timeline-zoom-month")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("timeline-bar").first()).toBeVisible();
    await page.getByTestId("timeline-zoom-day").click();

    // An undated item is counted and can be reached from the list.
    await switchView(page, "table");
    const input = page.getByTestId("add-item-Design");
    await input.fill("Undated brief");
    await input.press("Enter");
    await expect(row(page, "Undated brief")).toBeVisible({ timeout: 15000 });
    await switchView(page, "timeline");
    await page.getByTestId("timeline-unscheduled").click();
    await expect(page.getByTestId("timeline-unscheduled-list")).toContainText("Undated brief");
    await page.getByTestId("timeline-unscheduled-list").getByRole("button", { name: "Undated brief" }).click();
    await expect(page.getByTestId("item-panel")).toContainText("Undated brief", { timeout: 15000 });
  });

  test("calendar switches between month and week and shows status on each entry", async ({ page }) => {
    await switchView(page, "calendar");
    await expect(page.getByTestId("calendar")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("calendar-chip").first()).toBeVisible();
    await page.getByTestId("calendar-mode-week").click();
    await expect(page.getByTestId("calendar-title")).toContainText("–");
    await expect(page.getByTestId("calendar-card").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: "Previous week" }).click();
    await page.getByTestId("calendar-mode-month").click();
    await expect(page.getByTestId("calendar-chip").first()).toBeVisible();
  });

  test("gantt shows groups, bars, subitems on demand and dependency arrows", async ({ page }) => {
    await switchView(page, "gantt");
    await expect(page.getByTestId("gantt")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("gantt-group-Design")).toBeVisible();
    await expect(page.getByTestId("gantt-bar").first()).toBeVisible();
    // The seed links Production items to Design ones through the Dependency column.
    await expect(page.getByTestId("gantt-arrows")).toBeVisible();
    // Subitems are hidden until asked for.
    await expect(page.getByTestId("gantt-subrow")).toHaveCount(0);
    await page.getByTestId("gantt-expand").click();
    await expect(page.getByTestId("gantt-subrow").first()).toBeVisible();
    await page.getByTestId("gantt-zoom-day").click();
    await expect(page.getByTestId("gantt-bar").first()).toBeVisible();
    const ganttRow = page.locator('[data-testid="gantt-row"][data-item-name="RMITinerary High Achiever"]');
    await ganttRow.scrollIntoViewIfNeeded();
    await ganttRow.getByTestId("gantt-name").click();
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary High Achiever", { timeout: 15000 });
  });

  test("workload lays people against weeks and a cell opens its items", async ({ page }) => {
    await switchView(page, "workload");
    await expect(page.getByTestId("workload")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("workload-row").first()).toBeVisible();
    const cell = page.locator('[data-testid="workload-cell"]').filter({ hasText: /^[1-9]/ }).first();
    await cell.click();
    await expect(page.locator("[data-radix-popper-content-wrapper]")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chart slices the board and switches between bars and a donut", async ({ page }) => {
    await switchView(page, "chart");
    await expect(page.getByTestId("chart")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("chart-bar").first()).toBeVisible();
    await page.getByRole("radio", { name: /donut/i }).click();
    await expect(page.getByTestId("chart-donut")).toBeVisible();
    await expect(page.getByTestId("chart-legend-item").first()).toBeVisible();
  });
});
