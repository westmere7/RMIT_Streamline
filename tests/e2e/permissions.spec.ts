import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

async function switchTo(page: Page, name: string) {
  await page.goto("/workspace/rmit");
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /switch user/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]!, { timeout: 15000 });
}

test.describe("permissions", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("a viewer sees the board but cannot change anything", async ({ page }) => {
    // Jun is an explicit VIEWER on Masterclass Assets.
    await switchTo(page, "Jun Tanaka");
    await page.goto("/workspace/rmit/boards/masterclass-assets");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });

    const first = page.getByTestId("item-row").first();
    await expect(first).toBeVisible();
    // No editing affordances anywhere on the row or the toolbar.
    await expect(first.getByRole("button", { name: /More actions/ })).toHaveCount(0);
    await expect(page.getByTestId("new-item-button")).toHaveCount(0);
    await expect(page.getByTestId("add-group")).toHaveCount(0);
    await expect(page.getByTestId("add-column")).toHaveCount(0);
    await expect(first.getByRole("checkbox")).toBeDisabled();

    // The cell is a plain gridcell, not a button — but it keeps its label so a
    // screen reader still hears which column and item the value belongs to.
    const status = first.getByTestId("status-cell");
    await expect(status).toHaveJSProperty("tagName", "DIV");
    const label = await status.getAttribute("aria-label");
    expect(label).toMatch(/^Status: .* for /);
    await status.click({ force: true });
    await expect(page.getByRole("option")).toHaveCount(0);

    // And the stored value is unchanged after the attempt.
    await page.reload();
    await expect(page.getByTestId("item-row").first().getByTestId("status-cell")).toHaveAttribute("aria-label", label!, { timeout: 15000 });
  });

  test("a private board is invisible and unreachable for a non-member", async ({ page }) => {
    // Danh creates a private board.
    await page.getByTestId("sidebar-add-new").click();
    await page.getByTestId("sidebar-add-board").click();
    await page.getByLabel("Board name").fill("Danh private notes");
    await page.getByLabel("Visibility").click();
    await page.getByRole("option", { name: /private/i }).click();
    await page.getByRole("button", { name: /create board/i }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Danh private notes" })).toBeVisible({ timeout: 15000 });
    const url = page.url();

    // Jun is a plain member and not on the board.
    await switchTo(page, "Jun Tanaka");
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByText("Danh private notes")).toHaveCount(0);
    await page.goto(url);
    await expect(page.getByText(/this board is private|board not found|do not have access/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("board-table")).toHaveCount(0);

    // A workspace admin can still get in (that is the documented rule).
    await switchTo(page, "Emily Carter");
    await page.goto(url);
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
  });

  test("a guest cannot create boards, teams or trackers", async ({ page }) => {
    await switchTo(page, "Jane Morrison");
    await page.goto("/workspace/rmit");
    // The whole "Add new" affordance is gone for a guest.
    await expect(page.getByTestId("sidebar-add-new")).toHaveCount(0);
    await page.goto("/workspace/rmit/trackers");
    await expect(page.getByRole("button", { name: /new tracker/i })).toHaveCount(0);
  });

  test("a guest cannot open a workspace-visible board they are not a member of", async ({ page }) => {
    await switchTo(page, "Jane Morrison");
    // Creative Requests is WORKSPACE-visible; guests get no inherited access.
    await page.goto("/workspace/rmit/boards/creative-requests");
    await expect(page.getByText(/this board is private|board not found|do not have access/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("board-table")).toHaveCount(0);
  });

  test("only an owner or admin can delete a board", async ({ page }) => {
    // Duc owns DOOH Production; Jun is only a viewer there.
    await switchTo(page, "Jun Tanaka");
    await page.goto("/workspace/rmit/boards/dooh-production");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("board-menu").click();
    await expect(page.getByRole("menuitem", { name: /delete board/i })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /archive board/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The owner sees both.
    await switchTo(page, "Duc Tran");
    await page.goto("/workspace/rmit/boards/dooh-production");
    await page.getByTestId("board-menu").click();
    await expect(page.getByRole("menuitem", { name: /delete board/i })).toBeVisible();
  });

  test("an editor can edit but only the author can edit their own update", async ({ page }) => {
    await openBoard(page);
    await row(page, "RMITinerary Explorer").getByRole("button", { name: /Open RMITinerary Explorer/ }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await page.getByTestId("comment-input").fill("Owner note");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment").first()).toContainText("Owner note", { timeout: 15000 });

    // Tuyet is an editor on this board: she can post, but not touch Danh's update.
    await switchTo(page, "Tuyet Le");
    await openBoard(page);
    await row(page, "RMITinerary Explorer").getByRole("button", { name: /Open RMITinerary Explorer/ }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    const danhs = page.getByTestId("comment").filter({ hasText: "Owner note" }).first();
    await expect(danhs).toBeVisible({ timeout: 15000 });
    await expect(danhs.getByRole("button", { name: "Delete update" })).toHaveCount(0);
    await page.getByTestId("comment-input").fill("Editor note");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment").filter({ hasText: "Editor note" })).toBeVisible({ timeout: 15000 });
  });
});
