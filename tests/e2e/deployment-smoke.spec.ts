import { expect, test, type Page } from "@playwright/test";

/**
 * Production smoke test: the same journeys the local suite covers, run against a
 * deployed build with the real database behind it. It creates one item, works on
 * it, and deletes it again, so the workspace is left as it was found.
 *
 *   npm run test:e2e:deployment
 *   E2E_BASE_URL=https://... npm run test:e2e:deployment
 */
const EMAIL = process.env.E2E_EMAIL ?? "admin@rmit.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "admin123";
const BOARD = "/workspace/rmit/boards/rmitinerary-2026";
/** Unique per run, so a failed run never collides with the next one. */
const RUN = `deploy-${Date.now().toString(36)}`;

test.describe.configure({ mode: "serial" });

/** Console errors and page exceptions, minus the noise a browser makes anyway. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Failed to load resource: the server responded with a status of 40/i.test(text)) return;
    errors.push(text.slice(0, 300));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  return errors;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 60_000 });
}

function row(page: Page, name: string) {
  return page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
}

test.describe("deployed build", () => {
  test("loads, signs in and opens the workspace", async ({ page }) => {
    const errors = watchForErrors(page);
    const response = await page.goto("/login");
    expect(response?.status(), "the login page should be served").toBeLessThan(400);
    await signIn(page);
    await expect(page.getByText("Recently visited")).toBeVisible({ timeout: 60_000 });
    expect(errors, "no console errors on the way in").toEqual([]);
  });

  test("a board opens and every view renders", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("item-row").first()).toBeVisible({ timeout: 60_000 });

    for (const [view, marker] of [
      ["kanban", "lane-Done"],
      ["timeline", "timeline"],
      ["calendar", "calendar"],
      ["table", "board-table"],
    ] as const) {
      // Radix keeps a dismiss layer for a moment after a menu closes; reopening
      // inside that window is swallowed, so wait for it to go first.
      await expect(page.getByRole("menu")).toHaveCount(0, { timeout: 30_000 });
      await page.getByTestId("view-switcher").click();
      await page.getByTestId(`view-${view}`).click();
      await expect(page.getByTestId(marker)).toBeVisible({ timeout: 60_000 });
    }
    expect(errors).toEqual([]);
  });

  test("creates an item, works on it, and removes it again", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await page.goto(BOARD);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 60_000 });

    const name = `${RUN} smoke item`;
    const input = page.getByTestId("add-item-Design");
    await input.fill(name);
    await input.press("Enter");
    const created = row(page, name);
    await expect(created).toBeVisible({ timeout: 60_000 });

    // Status, owner and date, each confirmed on the row.
    await created.getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Working On It", exact: true }).click();
    await expect(created.getByTestId("status-cell")).toContainText("Working On It", { timeout: 30_000 });

    await created.getByTestId("person-cell").click();
    await page.getByTestId("person-picker").getByPlaceholder("Search people…").fill("Tuyet");
    await page.getByTestId("person-picker").getByText("Tuyet Le").click();
    await page.keyboard.press("Escape");
    await expect(created.getByTestId("person-cell")).toHaveAttribute("aria-label", /Tuyet Le/, { timeout: 30_000 });

    await created.getByTestId("date-cell").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Today", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(created.getByTestId("date-cell")).not.toHaveAttribute("aria-label", /not set/, { timeout: 30_000 });

    // An update on the item.
    await created.getByRole("button", { name: `Open ${name}` }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await page.getByTestId("comment-input").fill(`${RUN} update`);
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment").first()).toContainText(`${RUN} update`, { timeout: 30_000 });
    await page.getByTestId("close-panel").click();

    // Everything above survives a reload, which means it reached Postgres.
    await page.reload();
    await expect(row(page, name).getByTestId("status-cell")).toContainText("Working On It", { timeout: 60_000 });
    await expect(row(page, name).getByTestId("person-cell")).toHaveAttribute("aria-label", /Tuyet Le/);

    // It shows up in My Work for its new owner? No — check filtering and sorting instead.
    await page.getByTestId("search-input").fill(RUN);
    await expect.poll(() => page.getByTestId("item-row").count(), { timeout: 30_000 }).toBe(1);
    await page.getByTestId("search-input").fill("");
    await expect.poll(() => page.getByTestId("item-row").count(), { timeout: 30_000 }).toBeGreaterThan(1);

    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Item name" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitem", { name: /clear sort/i }).click();

    // Move it to another group by drag, and check the move stuck.
    const target = page.getByTestId("group-Backlog").getByTestId("item-row").first();
    await row(page, name).scrollIntoViewIfNeeded();
    await row(page, name).hover();
    const from = (await row(page, name).getByRole("button", { name: `Drag ${name}` }).boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByTestId("group-Backlog").locator(`[data-item-name="${name}"]`)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("group-Backlog").locator(`[data-item-name="${name}"]`)).toBeVisible({ timeout: 60_000 });

    // Clean up: the workspace is left exactly as it was found.
    await row(page, name).getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(row(page, name)).toHaveCount(0, { timeout: 30_000 });
    await page.reload();
    await expect(row(page, name)).toHaveCount(0, { timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test("the other pages load and deep links work", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    for (const [route, marker] of [
      ["/workspace/rmit/my-work", /My Work/],
      ["/workspace/rmit/inbox", /Inbox/],
      ["/workspace/rmit/members", /Members/],
      ["/workspace/rmit/messages", /Messages/],
      ["/workspace/rmit/trackers", /Trackers/],
      ["/workspace/rmit/settings", /Settings|Workspace/],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first(), route).toContainText(marker, { timeout: 60_000 });
    }

    // A deep link straight to an item opens the panel.
    await page.goto(BOARD);
    await expect(page.getByTestId("item-row").first()).toBeVisible({ timeout: 60_000 });
    const first = page.getByTestId("item-row").first();
    const itemName = (await first.getAttribute("data-item-name"))!;
    await first.getByRole("button", { name: `Open ${itemName}` }).click();
    await expect(page).toHaveURL(/item=/, { timeout: 30_000 });
    const url = page.url();
    await page.goto("/workspace/rmit");
    await page.goto(url);
    await expect(page.getByTestId("item-panel")).toContainText(itemName, { timeout: 60_000 });

    // An unknown board says so rather than showing a blank page.
    await page.goto("/workspace/rmit/boards/definitely-not-a-board");
    await expect(page.getByText(/board not found/i)).toBeVisible({ timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test("no request fails and the layout holds at laptop and tablet widths", async ({ page }) => {
    const failures: string[] = [];
    page.on("requestfailed", (request) => {
      // Next prefetches the sidebar's routes and aborts them on navigation;
      // a cancelled prefetch is not a failure.
      const reason = request.failure()?.errorText ?? "";
      if (reason.includes("ERR_ABORTED")) return;
      failures.push(`${request.method()} ${request.url().slice(0, 120)} (${reason})`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().includes("favicon")) failures.push(`${response.status()} ${response.url().slice(0, 120)}`);
    });

    await signIn(page);
    for (const width of [1440, 1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(BOARD);
      await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 60_000 });
      // The toolbar fits without overflowing at every width.
      const overflow = await page.evaluate(() => {
        const bar = document.querySelector('[role="toolbar"][aria-label="Board tools"]') as HTMLElement | null;
        return bar ? bar.scrollWidth - bar.clientWidth : 0;
      });
      expect(overflow, `toolbar overflows at ${width}px`).toBeLessThanOrEqual(1);
      // And the page never scrolls sideways as a whole.
      const bodyOverflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
      expect(bodyOverflow, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
    }
    expect(failures, "no failed requests").toEqual([]);
  });
});
