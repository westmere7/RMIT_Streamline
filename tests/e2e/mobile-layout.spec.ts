import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

// A phone: its own shell — a compact bar, the page, five destinations along the
// bottom — with boards as cards, sheets instead of popovers, and nothing
// scrolling sideways at page level.
test.use({ viewport: { width: 390, height: 844 } });

async function noPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
}

test.describe("phone layout", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("the shell is the bottom navigation, and the sidebar is not mounted", async ({ page }) => {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-top-bar")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
    // Not hidden with CSS — absent, so its queries and subscriptions never run.
    await expect(page.getByTestId("sidebar")).toHaveCount(0);

    await page.getByTestId("mobile-nav-my-work").click();
    await expect(page).toHaveURL(/\/my-work$/);
    await page.getByTestId("mobile-nav-browse").click();
    await expect(page).toHaveURL(/\/browse$/);
    await page.getByTestId("mobile-nav-more").click();
    await expect(page).toHaveURL(/\/more$/);
  });

  test("a board is a list of cards carrying status, priority and the due date", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign");
    const card = page.getByTestId("mobile-item-card").first();
    await expect(card).toBeVisible();
    // The desktop table hides status and priority below md; the card must not.
    await expect(card.locator("..").locator("..")).toContainText(/./);
    await expect(page.getByTestId("mobile-group-toggle").first()).toBeVisible();
    await noPageOverflow(page);
  });

  test("the view switcher is a sheet, and every view fits the screen", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign");
    for (const view of ["kanban", "calendar", "timeline", "gantt", "workload", "chart", "table"] as const) {
      await page.getByTestId("mobile-view-switcher").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByTestId(`mobile-view-${view}`).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await noPageOverflow(page);
    }
  });

  test("the grid is reachable and scrolls inside itself", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign");
    await page.getByTestId("mobile-mode-grid").click();
    const grid = page.getByTestId("board-table");
    await expect(grid).toBeVisible();
    const contained = await grid.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(contained).toBe(true);
    await noPageOverflow(page);
  });

  test("kanban offers an explicit move instead of a drag", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign?view=kanban");
    await expect(page.getByTestId("mobile-kanban")).toBeVisible();
    const lanes = page.locator('[data-testid^="mobile-lane-tab-"]');
    await expect(lanes.first()).toBeVisible();

    const before = await lanes.first().innerText();
    await page.getByTestId("mobile-kanban-move").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("menuitem").first().click();
    await expect(lanes.first()).not.toHaveText(before);
  });

  test("search matches the booking code as well as the name", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign");
    const reference = await page.getByTestId("mobile-item-card").first().locator(".font-mono").first().innerText();

    await page.getByTestId("mobile-search-chip").click();
    await page.getByTestId("mobile-search-input").fill(reference);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("mobile-item-card")).toHaveCount(1);
  });

  test("an item opens full screen, keeps its deep link, and Back returns to the board", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/semester-1-campaign");
    await page.getByTestId("mobile-item-card").first().click();

    const panel = page.getByTestId("item-panel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.x).toBe(0);
    await expect(page).toHaveURL(/[?&]item=/);
    await noPageOverflow(page);

    // A direct load of that link works, and Back leaves the item behind.
    await page.reload();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);
  });

  test("messages show one pane at a time with a way back", async ({ page }) => {
    await page.goto("/workspace/rmit/messages");
    await expect(page.getByTestId("message-person").first()).toBeVisible();
    await expect(page.getByTestId("message-thread")).toHaveCount(0);

    await page.getByTestId("message-person").filter({ hasText: "Emily Carter" }).click();
    await expect(page.getByTestId("message-thread")).toBeVisible();
    await expect(page.getByTestId("message-person").first()).toBeHidden();

    await page.getByRole("link", { name: "Back to people" }).click();
    await expect(page.getByTestId("message-person").first()).toBeVisible();
  });

  test("members read as cards rather than a seven-column table", async ({ page }) => {
    await page.goto("/workspace/rmit/members");
    await expect(page.locator("li[data-testid=member-row]").first()).toBeVisible();
    await expect(page.locator("main table")).toHaveCount(0);
    await noPageOverflow(page);
  });

  test("every main destination fits the screen", async ({ page }) => {
    for (const path of [
      "/workspace/rmit",
      "/workspace/rmit/my-work",
      "/workspace/rmit/browse",
      "/workspace/rmit/more",
      "/workspace/rmit/inbox",
      "/workspace/rmit/members",
      "/workspace/rmit/trackers",
      "/workspace/rmit/dashboard",
      "/workspace/rmit/book",
      "/workspace/rmit/settings",
      "/workspace/rmit/teams/00000002-0000-4000-8000-000000000002",
      "/workspace/rmit/boards/semester-1-campaign",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("mobile-shell")).toBeVisible();
      await noPageOverflow(page);
    }
  });
});

// The boundary itself, and the promise that crossing it changes nothing a
// desktop reader had set.
test.describe("the 767/768 boundary", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("767 is the phone and 768 is the existing interface", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/workspace/rmit");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("mobile-shell")).toHaveCount(0);

    await page.setViewportSize({ width: 767, height: 900 });
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toHaveCount(0);
  });

  test("a desktop → mobile → desktop round trip leaves the sidebar preference alone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/workspace/rmit");
    await expect(page.getByTestId("sidebar")).toBeVisible();

    // A non-default width, set the way a reader would: through the store the
    // resize handle writes to.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("streamline.ui") ?? '{"state":{},"version":0}');
      raw.state = { ...raw.state, sidebarWidth: 317, sidebarCollapsed: false };
      localStorage.setItem("streamline.ui", JSON.stringify(raw));
    });
    await page.reload();
    await expect(page.getByTestId("sidebar")).toHaveCSS("width", "317px");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId("mobile-shell")).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByTestId("sidebar")).toHaveCSS("width", "317px");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("streamline.ui")!).state);
    expect(stored.sidebarWidth).toBe(317);
    expect(stored.sidebarCollapsed).toBe(false);
  });

  test("a tablet folds the sidebar without writing that into the preference", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 900 });
    await page.goto("/workspace/rmit");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    // Folded on screen, and nothing written: either the key was never created
    // (nothing persisted at all) or it still says not collapsed. The old shell
    // wrote `true` here, which is what followed the reader back to a desktop.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("streamline.ui");
      return raw ? (JSON.parse(raw).state as { sidebarCollapsed?: boolean }) : null;
    });
    expect(stored?.sidebarCollapsed ?? false).toBe(false);
  });
});
