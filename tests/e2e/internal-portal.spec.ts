import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs, switchAccount } from "./helpers";

/**
 * The internal portal (v0.157): every team board's tasks on one board, for
 * admins and allocators. It opens from Portal and Booking's Portal card
 * (v0.157.1), never from the sidebar, and a task opens the app's own panel.
 */
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace navigation" });

/** The "N requests" figure over the internal portal's board. */
async function requestTotal(page: Page): Promise<number> {
  const text = await page.getByTestId("internal-portal-page").locator("header").innerText();
  return Number(/(\d+)\s*requests/.exec(text)![1]);
}

async function openPortalAndBooking(page: Page) {
  await page.goto("/workspace/rmit/book");
  await expect(page.getByRole("heading", { name: "Portal and Booking", level: 1 })).toBeVisible({ timeout: 20_000 });
}

test.describe("internal portal", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("an admin opens it from the Portal card, opens a task in the app's panel, and comes back", async ({ page }) => {
    await signInAs(page, "Danh");
    // Not in the menu: it lives on the Portal and Booking page, and among Home's quick links.
    await expect(nav(page).getByRole("link", { name: "Internal portal" })).toHaveCount(0);
    const quick = page.getByTestId("home-internal-portal-link").first();
    await expect(quick).toHaveAttribute("href", "/workspace/rmit/internal-portal");
    await expect(page.getByTestId("home-internal-portal-link-copy")).toHaveCount(0);
    await openPortalAndBooking(page);
    const button = page.getByTestId("portal-link-block").getByTestId("internal-portal-open");
    await expect(button).toBeVisible();
    await expect(button).toHaveText(/Internal portal/);
    await button.click();
    // Same tab, the app's page (not the public portal, which the card's background opens in a new one).
    await expect(page).toHaveURL(/\/workspace\/rmit\/internal-portal$/);
    expect(page.context().pages()).toHaveLength(1);
    const board = page.getByTestId("internal-portal-board");
    await expect(board.getByTestId("item-row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("portal-booking-off")).toHaveCount(0);
    await expect(page.getByTestId("portal-book-button")).toHaveCount(0);

    // A row opens the real panel, with the board's own task menu.
    const first = board.getByTestId("item-row").first();
    const name = (await first.getAttribute("data-item-name"))!;
    await first.hover();
    await first.getByRole("button", { name: `Open ${name}` }).click();
    await expect(page).toHaveURL(/[?&]task=/);
    const panel = page.getByRole("dialog", { name });
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByRole("button", { name: "More actions for this task" })).toBeVisible();
    await expect(panel.getByTestId("panel-board-link")).toHaveAttribute("href", /^\/workspace\/rmit\/boards\//);
    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(page).not.toHaveURL(/[?&]task=/);

    // Back to where it was opened from.
    await page.getByTestId("internal-portal-back").click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/book$/);
  });

  test("a task's menu opens its board, and Kanban lays lanes out by team", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/internal-portal");
    const board = page.getByTestId("internal-portal-board");
    const first = board.getByTestId("item-row").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    const name = (await first.getAttribute("data-item-name"))!;

    // The menu: Open and the task's board; nothing that would only touch the portal's copy.
    await first.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Open task's board"]);
    await expect(menu.getByRole("menuitem", { name: /^(Star|Follow|Task journey|Open in pop-up)$/ })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Open task's board" }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/boards\/[^/?]+\?item=/);
    await expect(page.getByRole("dialog", { name })).toBeVisible({ timeout: 20_000 });

    // Kanban: Team among the lanes, a lane per team.
    await page.goto("/workspace/rmit/internal-portal?view=kanban");
    const lanes = page.getByRole("radiogroup", { name: "Lanes by" });
    await expect(lanes.getByRole("radio", { name: "Team" })).toBeVisible({ timeout: 30_000 });
    await lanes.getByRole("radio", { name: "Team" }).click();
    await expect(page.getByText("Brand", { exact: true }).first()).toBeVisible();

    // And grouping by team.
    await page.goto("/workspace/rmit/internal-portal?group=team");
    await expect(page.getByRole("region", { name: "Group Brand" })).toBeVisible({ timeout: 30_000 });
  });

  test("a member who does not allocate sees the Portal card without it, and the page is closed to them", async ({ page }) => {
    // An admin's first visit sets the portal up; a member then sees its card read-only.
    await signInAs(page, "Danh");
    await openPortalAndBooking(page);
    await expect(page.getByTestId("portal-link-block")).toBeVisible({ timeout: 20_000 });
    await switchAccount(page, "Jun");
    await expect(nav(page).getByRole("link", { name: "Internal portal" })).toHaveCount(0);
    // Home offers the portal and the form, not the internal portal.
    await expect(page.getByTestId("home-portal-link").first()).toBeAttached({ timeout: 20_000 });
    await expect(page.getByTestId("home-internal-portal-link")).toHaveCount(0);
    await openPortalAndBooking(page);
    await expect(page.getByTestId("portal-link-block")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("portal-link-open")).toBeVisible();
    await expect(page.getByTestId("internal-portal-open")).toHaveCount(0);
    await page.goto("/workspace/rmit/internal-portal");
    await expect(page.getByText("For admins and allocators")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("internal-portal-board")).toHaveCount(0);
  });

  test("an allocator who is not an admin gets it, and sees only the boards they can open", async ({ page }) => {
    // Danh keeps a private board with one task on it: Jun is not on it.
    await signInAs(page, "Danh");
    await page.getByTestId("sidebar-add-new").click();
    await page.getByTestId("sidebar-add-board").click();
    await page.getByLabel("Board name").fill("Leads private board");
    await page.getByLabel("Visibility").click();
    await page.getByRole("option", { name: /private/i }).click();
    await page.getByRole("button", { name: /create board/i }).click();
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: "Leads private board" })).toBeVisible({ timeout: 15_000 });
    const add = page.getByRole("textbox", { name: /^Add item to / }).first();
    await add.fill("Leads only plan");
    await add.press("Enter");
    await expect(page.locator('[data-testid="item-row"][data-item-name="Leads only plan"]')).toBeVisible({ timeout: 15_000 });

    // The admin finds it on the internal portal.
    await openPortalAndBooking(page);
    await page.getByTestId("internal-portal-open").click();
    const board = page.getByTestId("internal-portal-board");
    await expect(board.getByTestId("item-row").first()).toBeVisible({ timeout: 30_000 });
    const adminTotal = await requestTotal(page);
    await page.getByPlaceholder("Search items").fill("Leads only plan");
    await expect(board.locator('[data-testid="item-row"][data-item-name="Leads only plan"]')).toBeVisible({ timeout: 20_000 });

    // Jun, a member, is given a seat that edits Task Allocation: that makes them an allocator.
    await page.evaluate(async () => {
      const open = indexedDB.open("rmit-streamline");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const boards: Array<{ id: string; system: string | null }> = await new Promise((resolve) => {
        const read = db.transaction("boards").objectStore("boards").getAll();
        read.onsuccess = () => resolve(read.result);
      });
      const allocation = boards.find((board) => board.system === "TASK_ALLOCATION")!;
      await new Promise<void>((resolve) => {
        const tx = db.transaction("boardMembers", "readwrite");
        tx.objectStore("boardMembers").put({ id: crypto.randomUUID(), boardId: allocation.id, userId: "00000001-0000-4000-8000-000000000003", role: "EDITOR" });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    });

    await switchAccount(page, "Jun");
    await openPortalAndBooking(page);
    await page.getByTestId("internal-portal-open").click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/internal-portal$/);
    await expect(board.getByTestId("item-row").first()).toBeVisible({ timeout: 30_000 });
    // The private board's task is not theirs to see, here or anywhere: one fewer, and no search finds it.
    expect(await requestTotal(page)).toBe(adminTotal - 1);
    await page.getByPlaceholder("Search items").fill("Leads only plan");
    await expect(page.getByTestId("internal-portal-page")).toContainText("Searching every year");
    await expect(board.locator('[data-testid="item-row"][data-item-name="Leads only plan"]')).toHaveCount(0);
    await expect(board.getByTestId("item-row")).toHaveCount(0, { timeout: 20_000 });
  });

  test("a guest gets neither the card nor the page", async ({ page }) => {
    await signInAs(page, "Jane");
    await openPortalAndBooking(page);
    await expect(page.getByTestId("portal-link-block")).toHaveCount(0);
    await expect(page.getByTestId("internal-portal-open")).toHaveCount(0);
    await page.goto("/workspace/rmit/internal-portal");
    await expect(page.getByText("For admins and allocators")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("internal-portal-board")).toHaveCount(0);
  });
});
