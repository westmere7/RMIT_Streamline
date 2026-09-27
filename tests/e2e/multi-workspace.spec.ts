import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs, switchAccount } from "./helpers";

/**
 * Several workspaces, driven through the app: Owners make and run them, an
 * admin runs one, and nobody reaches a workspace they were not given.
 */

async function openWorkspaceMenu(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("menu-workspace").click();
}

async function createWorkspace(page: Page, name: string, slug?: string) {
  await openWorkspaceMenu(page);
  await page.getByTestId("menu-workspace-new").click();
  const dialog = page.getByTestId("new-workspace-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("new-workspace-name").fill(name);
  if (slug) await dialog.getByTestId("new-workspace-slug").fill(slug);
  await dialog.getByTestId("new-workspace-create").click();
  await expect(dialog).toBeHidden();
}

/** Signs out and back in as someone, landing wherever the app sends them (their last workspace). */
async function signBackIn(page: Page, firstName: string) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  await page.getByTestId(`login-${firstName.toLowerCase()}`).click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 15000 });
}

test.beforeEach(async ({ page }) => {
  await resetLocalData(page);
});

test("an Owner makes a workspace, lands in it, and switches between the two", async ({ page }) => {
  await signInAs(page, "Danh");
  await createWorkspace(page, "Hanoi Studio", "hanoi");
  await expect(page).toHaveURL(/\/workspace\/hanoi$/, { timeout: 15000 });
  // It starts empty but for the Admin team and its intake board.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Danh");
  await openWorkspaceMenu(page);
  await expect(page.getByTestId("menu-workspace-current")).toContainText("Hanoi Studio");
  await page.getByTestId("menu-workspace-option").filter({ hasText: "RMIT Creative Team" }).click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/);
  // A board of RMIT is not a board of Hanoi.
  await page.goto("/workspace/hanoi/boards/rmitinerary-2026");
  await expect(page.getByTestId("board-table")).toHaveCount(0);
});

test("an admin of one workspace gets none of the Owners' controls", async ({ page }) => {
  await signInAs(page, "Emily");
  await openWorkspaceMenu(page);
  await expect(page.getByTestId("menu-workspace-current")).toBeVisible();
  await expect(page.getByTestId("menu-workspace-new")).toHaveCount(0);
  await expect(page.getByTestId("menu-workspace-manage")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.goto("/workspace/rmit/settings?section=workspaces");
  await expect(page.getByTestId("settings-nav-workspaces")).toHaveCount(0);
  await expect(page.getByTestId("workspaces-list")).toHaveCount(0);
  await expect(page.getByTestId("settings-nav-snapshots")).toHaveCount(0);

  // Owners' rows carry no actions for an admin.
  await page.goto("/workspace/rmit/members");
  const danhRow = page.locator("tr, li").filter({ hasText: "danh@rmit.local" }).first();
  await expect(danhRow).toBeVisible();
  await expect(danhRow.getByRole("button", { name: /Actions for Danh/ })).toHaveCount(0);
  // An ordinary member's row does, and Owner is not a role on offer.
  await page.getByRole("button", { name: /Actions for Jun Tanaka/ }).first().click();
  await expect(page.getByRole("menuitemradio", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Owner" })).toHaveCount(0);
  await expect(page.getByTestId("member-make-owner")).toHaveCount(0);
});

test("nobody reaches a workspace they were not added to, and an Owner adds them without a new account", async ({ page }) => {
  await signInAs(page, "Danh");
  await createWorkspace(page, "Hanoi Studio", "hanoi");
  await expect(page).toHaveURL(/\/workspace\/hanoi$/, { timeout: 15000 });

  await switchAccount(page, "Jun");
  await page.goto("/workspace/hanoi");
  await expect(page.getByText("You do not have access to Hanoi Studio")).toBeVisible();
  await page.getByTestId("no-access-my-workspaces").click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/);

  // Danh gives Jun access by email: Jun already has an account.
  await signBackIn(page, "Danh");
  await page.goto("/workspace/hanoi/members");
  await page.getByRole("button", { name: /add member/i }).first().click();
  const dialog = page.getByTestId("invite-dialog");
  await dialog.locator("#invite-email").fill("jun@rmit.local");
  await dialog.locator("#invite-first").fill("Jun");
  await dialog.locator("#invite-last").fill("Tanaka");
  await dialog.getByTestId("invite-submit").click();
  await expect(dialog.getByText("Jun Tanaka now has access")).toBeVisible();
  await dialog.getByTestId("invite-done").click();

  await signBackIn(page, "Jun");
  await page.goto("/workspace/hanoi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Jun");
  await openWorkspaceMenu(page);
  await expect(page.getByTestId("menu-workspace-option").filter({ hasText: "RMIT Creative Team" })).toBeVisible();
});

test("an Owner makes and unmakes an Owner from Members", async ({ page }) => {
  await signInAs(page, "Danh");
  await page.goto("/workspace/rmit/members");
  await page.getByRole("button", { name: /Actions for Jun Tanaka/ }).first().click();
  await page.getByTestId("member-make-owner").click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Make Owner" }).click();
  await expect(page.getByText("Jun is now an Owner")).toBeVisible();

  await page.goto("/workspace/rmit/settings?section=workspaces");
  await expect(page.getByTestId("owner-row").filter({ hasText: "jun@rmit.local" })).toBeVisible();
  await page.getByTestId("owner-row").filter({ hasText: "jun@rmit.local" }).getByTestId("owner-remove").click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("owner-row").filter({ hasText: "jun@rmit.local" })).toHaveCount(0);
});

test("an Owner renames and deletes a workspace, typing its name to confirm", async ({ page }) => {
  await signInAs(page, "Danh");
  await createWorkspace(page, "Doomed", "doomed");
  await expect(page).toHaveURL(/\/workspace\/doomed$/, { timeout: 15000 });
  await page.goto("/workspace/rmit/settings?section=workspaces");
  const row = page.getByTestId("workspace-row").filter({ hasText: "/workspace/doomed" });
  await row.getByTestId("workspace-rename").click();
  await row.getByTestId("workspace-rename-input").fill("Doomed Studio");
  await row.getByTestId("workspace-rename-save").click();
  await expect(row.getByTestId("workspace-row-name")).toHaveText("Doomed Studio");

  await row.getByTestId("workspace-delete").click();
  const confirm = page.getByTestId("confirm-dialog");
  const button = confirm.getByRole("button", { name: "Delete workspace" });
  await confirm.getByTestId("workspace-delete-confirm").fill("Doomed");
  await expect(button).toBeDisabled();
  await confirm.getByTestId("workspace-delete-confirm").fill("Doomed Studio");
  await button.click();
  await expect(page.getByTestId("workspace-row").filter({ hasText: "/workspace/doomed" })).toHaveCount(0);
  // The last one cannot go.
  await expect(page.getByTestId("workspace-row").getByTestId("workspace-delete")).toBeDisabled();
});

test("a workspace can take Portal and Booking out of its menu, and the others keep theirs", async ({ page }) => {
  await signInAs(page, "Danh");
  await createWorkspace(page, "No Bookings", "no-bookings");
  await expect(page).toHaveURL(/\/workspace\/no-bookings$/, { timeout: 15000 });
  await expect(page.getByTestId("sidebar-book-task")).toBeVisible();
  await page.goto("/workspace/no-bookings/settings?section=view");
  const toggle = page.getByTestId("setting-portal-menu");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("sidebar-book-task")).toHaveCount(0);
  // RMIT is left as it was.
  await page.goto("/workspace/rmit");
  await expect(page.getByTestId("sidebar-book-task")).toBeVisible();
});

test("a member does not get the Portal and Booking switch", async ({ page }) => {
  await signInAs(page, "Jun");
  await page.goto("/workspace/rmit/settings?section=view");
  await expect(page.getByTestId("setting-team-counts")).toBeVisible();
  await expect(page.getByTestId("setting-portal-menu")).toHaveCount(0);
});
