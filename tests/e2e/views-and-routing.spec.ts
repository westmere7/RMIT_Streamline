import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

/** Console errors and page exceptions seen while a test runs. */
function watch(page: Page) {
  const seen: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") seen.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => seen.push(`pageerror: ${e.message.slice(0, 200)}`));
  return seen;
}

test.describe("views, routing and error states", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("every board view opens, switches repeatedly and stays in sync", async ({ page }) => {
    const errors = watch(page);
    await openBoard(page);

    await switchView(page, "kanban");
    await expect(page.getByTestId("lane-Done")).toBeVisible({ timeout: 15000 });
    await switchView(page, "timeline");
    await expect(page.getByTestId("timeline")).toBeVisible({ timeout: 15000 });
    await switchView(page, "calendar");
    await expect(page.getByTestId("calendar")).toBeVisible({ timeout: 15000 });
    await switchView(page, "files");
    await switchView(page, "table");
    await expect(page.getByTestId("board-table")).toBeVisible();

    // Round two, quickly, to catch state left behind by the first pass.
    for (const view of ["kanban", "timeline", "calendar", "table"] as const) {
      await switchView(page, view);
    }
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
    expect(errors, "no console errors while switching views").toEqual([]);
  });

  test("the timeline plots dated items and reflects a change made in the table", async ({ page }) => {
    await openBoard(page);
    await switchView(page, "timeline");
    const timeline = page.getByTestId("timeline");
    await expect(timeline).toBeVisible({ timeout: 15000 });
    await expect(timeline).toContainText("RMITinerary Explorer");

    // An item with no dates at all is not plotted.
    await switchView(page, "table");
    const input = page.getByTestId("add-item-Design");
    await input.fill("No dates at all");
    await input.press("Enter");
    await expect(row(page, "No dates at all")).toBeVisible({ timeout: 15000 });
    await switchView(page, "timeline");
    await expect(page.getByTestId("timeline")).not.toContainText("No dates at all");

    // Give it a due date and it appears.
    await switchView(page, "table");
    await row(page, "No dates at all").getByTestId("date-cell").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Today", exact: true }).click();
    await page.keyboard.press("Escape");
    await switchView(page, "timeline");
    await expect(page.getByTestId("timeline")).toContainText("No dates at all", { timeout: 15000 });
  });

  test("the calendar shows dated items, navigates months and opens an item", async ({ page }) => {
    await openBoard(page);
    await switchView(page, "calendar");
    const calendar = page.getByTestId("calendar");
    await expect(calendar).toBeVisible({ timeout: 15000 });
    const heading = await calendar.innerText();

    await page.getByRole("button", { name: /next month/i }).click();
    await expect(calendar).not.toHaveText(heading, { timeout: 15000 });
    await page.getByRole("button", { name: /previous month/i }).click();

    // Clicking an entry opens the item panel.
    const entry = calendar.getByRole("button").filter({ hasText: "RMITinerary" }).first();
    if (await entry.count()) {
      await entry.click();
      await expect(page.getByTestId("item-panel")).toBeVisible({ timeout: 15000 });
    }
  });

  test("every route survives a direct load and a refresh", async ({ page }) => {
    const errors = watch(page);
    const routes = [
      "/workspace/rmit",
      "/workspace/rmit/my-work",
      "/workspace/rmit/inbox",
      "/workspace/rmit/messages",
      "/workspace/rmit/members",
      "/workspace/rmit/settings",
      "/workspace/rmit/trackers",
      "/workspace/rmit/boards/rmitinerary-2026",
      "/workspace/rmit/people/00000001-0000-4000-8000-000000000001",
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main"), `${route} should render something`).not.toBeEmpty({ timeout: 20000 });
      await page.reload();
      await expect(page.locator("main"), `${route} after refresh`).not.toBeEmpty({ timeout: 20000 });
      expect(await page.getByText("404").count(), `${route} must not 404`).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test("browser back and forward keep the app coherent", async ({ page }) => {
    await page.goto("/workspace/rmit");
    await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "My Work" }).click();
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: /Inbox/ }).click();
    await expect(page).toHaveURL(/inbox/);

    await page.goBack();
    await expect(page).toHaveURL(/my-work/);
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/workspace\/rmit$/);
    await page.goForward();
    await expect(page).toHaveURL(/my-work/);
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
  });

  test("invalid ids show a state, never a blank screen", async ({ page }) => {
    const cases: Array<[string, RegExp]> = [
      ["/workspace/rmit/boards/nope", /board not found/i],
      ["/workspace/rmit/teams/00000000-0000-4000-8000-000000000000", /team not found/i],
      ["/workspace/rmit/people/00000000-0000-4000-8000-000000000000", /person not found/i],
      ["/workspace/rmit/trackers/00000000-0000-4000-8000-000000000000", /not found/i],
    ];
    for (const [route, message] of cases) {
      await page.goto(route);
      await expect(page.getByText(message), `${route}`).toBeVisible({ timeout: 20000 });
    }
  });

  test("the command palette finds and opens things", async ({ page }) => {
    await page.goto("/workspace/rmit");
    await expect(page.getByText("Recently visited")).toBeVisible({ timeout: 20000 });
    await page.keyboard.press("Control+f");
    const input = page.getByPlaceholder("Search boards, items, teams and people…");
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill("zzzzzz");
    await expect(page.getByText(/no results/i)).toBeVisible({ timeout: 15000 });

    await input.fill("Pragmatist");
    await page.getByRole("option", { name: /RMITinerary Pragmatist/ }).first().click();
    await expect(page).toHaveURL(/item=/, { timeout: 15000 });
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary Pragmatist");

    // Reopening on a board scopes the search to that board, so the placeholder
    // changes; Escape closes it and leaves the page usable.
    await page.keyboard.press("Control+f");
    const scoped = page.getByPlaceholder(/Search items in /);
    await expect(scoped).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(scoped).toHaveCount(0);
    await expect(page.getByTestId("board-table")).toBeVisible();
  });

  test("a My Work row and a notification both land on the right item", async ({ page }) => {
    await page.goto("/workspace/rmit/my-work");
    const first = page.getByTestId("my-work-today").getByRole("link").first();
    const label = (await first.innerText()).split("\n")[0]!;
    await first.click();
    await expect(page).toHaveURL(/boards\/.*item=/, { timeout: 15000 });
    await expect(page.getByTestId("item-panel")).toContainText(label.slice(0, 20));

    await page.goto("/workspace/rmit/inbox");
    const notification = page.getByTestId("notification").first();
    await expect(notification).toBeVisible({ timeout: 15000 });
    await notification.click();
    await expect(page).toHaveURL(/boards\//, { timeout: 15000 });
  });
});
