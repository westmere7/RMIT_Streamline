import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

const BOARD = "/workspace/rmit/boards/rmitinerary-2026";

/** Opens the Share dialog from the board header and returns the link it shows. */
async function createShareLink(page: Page): Promise<string> {
  await page.getByTestId("board-share").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("share-create").click();
  const link = dialog.getByTestId("share-link");
  await expect(link).toBeVisible({ timeout: 15000 });
  const url = await link.inputValue();
  expect(url).toMatch(/\/share\/[a-z0-9]{16,}$/);
  return url;
}

test.describe("sharing a board by link", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page, BOARD);
  });

  test("a visitor with no account reads the board, switches views and opens a task", async ({ page, context }) => {
    const url = await createShareLink(page);
    await expect(page.getByTestId("board-shared-badge")).toBeVisible();

    // A second page, standing in for a stakeholder. It has to share this browser
    // context: in local mode the "server" is this origin's IndexedDB, and a fresh
    // context would be a different database with no such link in it. Nothing on
    // the shared page reads the session, which is what the assertions below check.
    const guest = await context.newPage();
    await guest.goto(url);

    await expect(guest.getByTestId("shared-board")).toBeVisible({ timeout: 20000 });
    await expect(guest.getByTestId("share-view-only")).toHaveText(/View only/);
    await expect(guest.getByTestId("item-row").first()).toBeVisible();

    // Nothing that would change the board, and no way out of the page.
    await expect(guest.getByTestId("new-item-button")).toHaveCount(0);
    await expect(guest.getByTestId("add-group")).toHaveCount(0);
    await expect(guest.getByTestId("add-column")).toHaveCount(0);
    await expect(guest.getByTestId("board-menu")).toHaveCount(0);
    await expect(guest.getByTestId("board-share")).toHaveCount(0);
    await expect(guest.locator("nav[aria-label='Primary']")).toHaveCount(0);
    for (const href of await guest.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      if (href.startsWith("/")) expect(href).toMatch(/^\/share\//);
    }

    // The views are all there. Each switch waits for the menu to go away first:
    // clicking the switcher while the last menu is still closing does nothing.
    await switchView(guest, "kanban");
    await expect(guest.getByTestId("kanban")).toBeVisible({ timeout: 15000 });
    await switchView(guest, "table");
    await expect(guest.getByTestId("board-table")).toBeVisible();

    // A task opens, read-only: its updates are there and the composer is not.
    await guest.getByTestId("item-row").first().getByTestId("item-name").click();
    const panel = guest.getByTestId("item-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await panel.getByRole("tab", { name: "Updates" }).click();
    await expect(panel.getByTestId("comment-input")).toHaveCount(0);

    await guest.close();
  });

  test("the board a visitor sees keeps up with the one the team is working on", async ({ page, context }) => {
    const url = await createShareLink(page);

    const guest = await context.newPage();
    await guest.goto(url);
    const shared = guest.locator('[data-testid="item-row"]').first();
    await expect(shared).toBeVisible({ timeout: 20000 });
    const name = (await shared.getAttribute("data-item-name"))!;
    await expect(guest.locator(`[data-item-name="${name}"] [data-testid="status-cell"]`)).not.toContainText("In Review");

    // The team changes a status while the visitor is looking at the board.
    await page.keyboard.press("Escape");
    await row(page, name).getByTestId("status-cell").click();
    await page.getByRole("option", { name: "In Review" }).click();
    await expect(row(page, name).getByTestId("status-cell")).toContainText("In Review");

    // The shared page catches up on its own, without a reload.
    await expect(guest.locator(`[data-item-name="${name}"] [data-testid="status-cell"]`)).toContainText("In Review", { timeout: 30000 });

    await guest.close();
  });

  test("a password stands in front of the board, and a wrong one does not get in", async ({ page, context }) => {
    const url = await createShareLink(page);
    const dialog = page.getByTestId("share-dialog");
    await dialog.getByTestId("share-password").fill("letmein");
    await dialog.getByTestId("share-password-set").click();
    await expect(dialog.getByTestId("share-password-remove")).toBeVisible({ timeout: 15000 });

    const guest = await context.newPage();
    await guest.goto(url);
    await expect(guest.getByTestId("share-visitor-password")).toBeVisible({ timeout: 20000 });
    await expect(guest.getByTestId("shared-board")).toHaveCount(0);

    await guest.getByTestId("share-visitor-password").fill("nope");
    await guest.getByTestId("share-visitor-submit").click();
    await expect(guest.getByText("That password is not right.")).toBeVisible({ timeout: 15000 });
    await expect(guest.getByTestId("shared-board")).toHaveCount(0);

    await guest.getByTestId("share-visitor-password").fill("letmein");
    await guest.getByTestId("share-visitor-submit").click();
    await expect(guest.getByTestId("shared-board")).toBeVisible({ timeout: 20000 });

    await guest.close();
  });

  test("turning the link off, and a new link, shut the old one out", async ({ page, context }) => {
    const url = await createShareLink(page);
    const dialog = page.getByTestId("share-dialog");

    await dialog.getByTestId("share-enabled").click();
    await expect(dialog.getByTestId("share-enabled")).toHaveAttribute("data-state", "unchecked");

    const guest = await context.newPage();
    await guest.goto(url);
    await expect(guest.getByTestId("share-closed")).toBeVisible({ timeout: 20000 });
    await expect(guest.getByTestId("share-closed")).toContainText(/turned off/i);

    // Back on, same address.
    await dialog.getByTestId("share-enabled").click();
    await expect(dialog.getByTestId("share-enabled")).toHaveAttribute("data-state", "checked");
    await guest.goto(url);
    await expect(guest.getByTestId("shared-board")).toBeVisible({ timeout: 20000 });

    // A new link retires the address that has been handed out.
    await dialog.getByTestId("share-regenerate").click();
    await dialog.getByTestId("share-regenerate-confirm").click();
    await expect(dialog.getByTestId("share-link")).not.toHaveValue(url, { timeout: 15000 });
    const replacement = await dialog.getByTestId("share-link").inputValue();

    await guest.goto(url);
    await expect(guest.getByTestId("share-closed")).toBeVisible({ timeout: 20000 });
    await guest.goto(replacement);
    await expect(guest.getByTestId("shared-board")).toBeVisible({ timeout: 20000 });

    await guest.close();
  });

  test("an expiry closes the link at the end of its day, and stopping forgets it", async ({ page, context }) => {
    const url = await createShareLink(page);
    const dialog = page.getByTestId("share-dialog");

    // Today still works: an expiry means the end of that day.
    const today = new Date().toISOString().slice(0, 10);
    await dialog.getByTestId("share-expires").fill(today);
    await expect(dialog.getByTestId("share-expires-clear")).toBeVisible({ timeout: 15000 });

    const guest = await context.newPage();
    await guest.goto(url);
    await expect(guest.getByTestId("shared-board")).toBeVisible({ timeout: 20000 });

    await dialog.getByTestId("share-stop").click();
    await expect(dialog.getByTestId("share-create")).toBeVisible({ timeout: 15000 });
    await guest.goto(url);
    await expect(guest.getByTestId("share-closed")).toBeVisible({ timeout: 20000 });

    await guest.close();
  });

  test("the share panel is in the board menu and in board settings", async ({ page }) => {
    await page.getByTestId("board-menu").click();
    await page.getByTestId("board-menu-share").click();
    await expect(page.getByTestId("share-dialog")).toBeVisible();

    // A fresh page rather than closing the dialog: reopening a menu underneath
    // one that is still going away is a race, and it is not what is being tested.
    await openBoard(page, BOARD);
    await page.getByTestId("board-menu").click();
    await page.getByRole("menuitem", { name: /Board settings/ }).click();
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("share-create")).toBeVisible();
  });
});

test.describe("a link that opens nothing", () => {
  test("says so without giving anything away", async ({ page }) => {
    await resetLocalData(page);
    await page.goto("/share/thistokenopensnothing");
    await expect(page.getByTestId("share-closed")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("share-closed")).toContainText(/does not open/i);
  });
});
