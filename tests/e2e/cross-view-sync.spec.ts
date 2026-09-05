import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

const ITEM = "RMITinerary Explorer";

async function setStatus(page: Page, item: string, status: string) {
  await row(page, item).getByTestId("status-cell").click();
  await page.getByRole("option", { name: status, exact: true }).click();
}

test.describe("changes reaching every view", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("a status change shows up in kanban, the item panel and My Work", async ({ page }) => {
    await openBoard(page);
    await setStatus(page, ITEM, "Stuck");
    await expect(row(page, ITEM).getByTestId("status-cell")).toContainText("Stuck");

    // Kanban lanes follow the status.
    await switchView(page, "kanban");
    await expect(page.getByTestId("lane-Stuck").getByText(ITEM)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("lane-Not Started").getByText(ITEM)).toHaveCount(0);

    // The item panel agrees.
    await switchView(page, "table");
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    await expect(page.getByTestId("item-panel")).toContainText("Stuck");
    await page.getByTestId("close-panel").click();

    // My Work lists it for its owner with the same status.
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByText(ITEM).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("li", { hasText: ITEM }).first()).toContainText("Stuck");
  });

  test("changing the owner moves the item in and out of My Work", async ({ page }) => {
    await openBoard(page);
    // Take Danh off the item.
    const person = row(page, ITEM).getByTestId("person-cell");
    await person.click();
    await page.getByTestId("person-picker").getByText("Danh Nguyen").click();
    await page.keyboard.press("Escape");
    await expect(person).toHaveAttribute("aria-label", /unassigned/, { timeout: 15000 });

    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("my-work-today")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ITEM)).toHaveCount(0);

    // Put him back and it returns.
    await openBoard(page);
    await row(page, ITEM).getByTestId("person-cell").click();
    await page.getByTestId("person-picker").getByPlaceholder("Search people…").fill("Danh");
    await page.getByTestId("person-picker").getByText("Danh Nguyen").click();
    await page.keyboard.press("Escape");
    await expect(row(page, ITEM).getByTestId("person-cell")).toHaveAttribute("aria-label", /Danh Nguyen/, { timeout: 15000 });
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByText(ITEM).first()).toBeVisible({ timeout: 20000 });
  });

  test("moving a due date moves the item between My Work sections", async ({ page }) => {
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByTestId("my-work-today")).toBeVisible({ timeout: 15000 });

    await openBoard(page);
    const due = row(page, ITEM).getByTestId("date-cell");
    await due.click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Today", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(row(page, ITEM).getByTestId("date-cell")).not.toHaveAttribute("aria-label", /not set/, { timeout: 15000 });

    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByTestId("my-work-today")).toContainText(ITEM, { timeout: 15000 });

    // Clearing the date sends it to "no date".
    await openBoard(page);
    await row(page, ITEM).getByTestId("date-cell").click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Clear", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(row(page, ITEM).getByTestId("date-cell")).toHaveAttribute("aria-label", /not set/, { timeout: 15000 });
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByTestId("my-work-today")).not.toContainText(ITEM, { timeout: 15000 });
    // With no due date the timeline's end date takes over, so the item is still
    // scheduled rather than falling into "No Date".
    await expect(page.locator("li", { hasText: ITEM }).first()).toBeVisible();

    // Clearing the timeline as well finally puts it in "No Date".
    await openBoard(page);
    const timeline = row(page, ITEM).locator('[aria-label^="Timeline"]').first();
    await timeline.click();
    await page.locator("[data-radix-popper-content-wrapper]").getByRole("button", { name: "Clear", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(row(page, ITEM).locator('[aria-label^="Timeline"]').first()).toHaveAttribute("aria-label", /not set/, { timeout: 15000 });
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByTestId("my-work-noDate")).toContainText(ITEM, { timeout: 15000 });
  });

  test("completed work leaves the active sections, and archiving removes it entirely", async ({ page }) => {
    await openBoard(page);
    await setStatus(page, ITEM, "Done");
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByTestId("my-work-today")).toBeVisible({ timeout: 15000 });
    // Completed work is hidden until asked for.
    await expect(page.getByTestId("my-work-completed")).toHaveCount(0);
    await page.getByLabel("Show completed").click();
    await expect(page.getByTestId("my-work-completed")).toContainText(ITEM, { timeout: 15000 });

    await openBoard(page);
    await row(page, ITEM).getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(row(page, ITEM)).toHaveCount(0, { timeout: 15000 });
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("my-work-today")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ITEM)).toHaveCount(0);
  });

  test("updates: post, edit, delete, and refuse an empty one", async ({ page }) => {
    await openBoard(page);
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    const input = page.getByTestId("comment-input");
    await expect(page.getByTestId("comment-submit")).toBeDisabled();
    await input.fill("   ");
    await expect(page.getByTestId("comment-submit")).toBeDisabled();

    const long = "A long update. ".repeat(60);
    await input.fill(long);
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment").first()).toContainText("A long update.", { timeout: 15000 });

    await input.fill("Special <b>chars</b> & emoji 🎉");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment")).toHaveCount(2, { timeout: 15000 });
    await page.reload();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await expect(page.getByTestId("comment")).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByTestId("comment").first()).toContainText("<b>chars</b>");

    // Edit the newest.
    await page.getByTestId("comment").first().getByRole("button", { name: "Edit update" }).click();
    const editor = page.getByTestId("comment").first().getByRole("textbox");
    await editor.fill("Edited update");
    await page.getByTestId("comment").first().getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("comment").first()).toContainText("Edited update", { timeout: 15000 });
    await page.reload();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await expect(page.getByTestId("comment").first()).toContainText("Edited update", { timeout: 15000 });

    // Delete it.
    await page.getByTestId("comment").first().getByRole("button", { name: "Delete update" }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /delete/i }).click();
    await expect(page.getByTestId("comment")).toHaveCount(1, { timeout: 15000 });
    await page.reload();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await expect(page.getByTestId("comment")).toHaveCount(1, { timeout: 15000 });
  });

  test("someone else's update cannot be edited or deleted by a non-admin", async ({ page }) => {
    await openBoard(page);
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await page.getByTestId("comment-input").fill("Danh was here");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment").first()).toContainText("Danh was here", { timeout: 15000 });
    const url = page.url();

    // Jun is a plain MEMBER: he may not edit or delete another person's update.
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /switch user/i }).click();
    await page.getByRole("menuitem", { name: /Jun Tanaka/ }).click();
    await page.goto(url);
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    const comment = page.getByTestId("comment").filter({ hasText: "Danh was here" }).first();
    await expect(comment).toBeVisible({ timeout: 15000 });
    await expect(comment.getByRole("button", { name: "Edit update" })).toHaveCount(0);
    await expect(comment.getByRole("button", { name: "Delete update" })).toHaveCount(0);
  });

  test("activity records what changed, with the old and new values", async ({ page }) => {
    await openBoard(page);
    await setStatus(page, ITEM, "Stuck");
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    const panel = page.getByTestId("item-panel");
    await panel.getByRole("tab", { name: /activity/i }).click();
    await expect(panel).toContainText(/Status/i, { timeout: 15000 });
    await expect(panel).toContainText("Waiting");
    await expect(panel).toContainText("Stuck");
  });

  test("inbox: read one, mark all read, and open the item behind a notification", async ({ page }) => {
    await page.goto("/workspace/rmit/inbox");
    const first = page.getByTestId("notification").first();
    await expect(first).toBeVisible({ timeout: 15000 });
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(nav.getByRole("link", { name: /Inbox/ })).toContainText(/[1-9]/);

    await first.click();
    await expect(page).toHaveURL(/item=|boards\//, { timeout: 15000 });

    await page.goto("/workspace/rmit/inbox");
    await page.getByRole("button", { name: /mark all read/i }).click();
    await expect(page.getByText(/all caught up/i)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByText(/all caught up/i)).toBeVisible({ timeout: 15000 });
    await expect(nav.getByRole("link", { name: /Inbox/ })).not.toContainText(/[1-9]/);
  });
});
