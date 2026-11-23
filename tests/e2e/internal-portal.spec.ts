import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The internal portal (v0.157): every team board's tasks on one board, for
 * admins and allocators. A task opens the app's own panel, not the portal's.
 */
test.describe("internal portal", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("an admin opens it from the sidebar, opens a task in the app's panel, and leaves by the sidebar", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Internal portal" }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/internal-portal/);
    const board = page.getByTestId("internal-portal-board");
    await expect(board.getByTestId("item-row").first()).toBeVisible({ timeout: 30_000 });
    // No booking here: it is for looking across the work, not taking requests.
    await expect(page.getByTestId("portal-booking-off")).toHaveCount(0);
    await expect(page.getByTestId("portal-book-button")).toHaveCount(0);

    // A row opens the real panel: its menu and tabs are the board's, not the portal's read-only card.
    const first = board.getByTestId("item-row").first();
    const name = (await first.getAttribute("data-item-name"))!;
    await first.hover();
    await first.getByRole("button", { name: `Open ${name}` }).click();
    await expect(page).toHaveURL(/[?&]task=/);
    const panel = page.getByRole("dialog", { name });
    await expect(panel).toBeVisible({ timeout: 20_000 });
    // The board's own task menu, which the portal's read-only card leaves out.
    await expect(panel.getByRole("button", { name: "More actions for this task" })).toBeVisible();
    // Its breadcrumb is the real board's, where the portal's card would point back at the portal.
    await expect(panel.getByTestId("panel-board-link")).toHaveAttribute("href", /^\/workspace\/rmit\/boards\//);

    // Links out of the board are the app's own here: the sidebar still goes places.
    await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/dashboard/);
  });

  test("a member who does not allocate is not offered it", async ({ page }) => {
    await signInAs(page, "Jun");
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Internal portal" })).toHaveCount(0);
    await page.goto("/workspace/rmit/internal-portal");
    await expect(page.getByText("For admins and allocators")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("internal-portal-board")).toHaveCount(0);
  });
});
