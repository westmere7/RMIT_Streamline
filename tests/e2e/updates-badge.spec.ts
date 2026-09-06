import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";
const OTHER = "Cover concept – final artwork";

async function postUpdate(page: Page, item: string, body: string) {
  await row(page, item).getByRole("button", { name: `Open ${item}` }).click();
  await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
  await page.getByTestId("comment-input").fill(body);
  await page.getByTestId("comment-submit").click();
  await expect(page.getByTestId("comment").filter({ hasText: body })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Close panel" }).click();
}

async function switchUser(page: Page, name: RegExp) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /switch user/i }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name, { timeout: 15000 });
}

const badge = (page: Page, item: string) => row(page, item).getByTestId("updates-badge");

test.describe("update badges on items", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("shows the count quietly for your own updates and as new for everyone else until they look", async ({ page }) => {
    await expect(badge(page, ITEM)).toHaveCount(0);
    await postUpdate(page, ITEM, "Badge check one");
    await expect(badge(page, ITEM)).toContainText("1");
    await expect(badge(page, ITEM)).toHaveAttribute("data-unread", "0");

    // Tuyet has not seen it: the badge reads as new.
    await switchUser(page, /Tuyet Le/);
    await openBoard(page);
    await expect(badge(page, ITEM)).toHaveAttribute("data-unread", "1", { timeout: 15000 });

    // Clicking the badge opens the item; the Updates tab is where catching up happens.
    await badge(page, ITEM).click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    // The badge opens straight onto the Updates tab.
    await expect(page.getByTestId("item-panel").getByRole("tab", { name: /updates/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("comment").filter({ hasText: "Badge check one" })).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(badge(page, ITEM)).toHaveAttribute("data-unread", "0", { timeout: 15000 });
    await expect(badge(page, ITEM)).toContainText("1");

    // And it stays read after a reload.
    await page.reload();
    await expect(badge(page, ITEM)).toHaveAttribute("data-unread", "0", { timeout: 15000 });
  });

  test("reading the notification in the Inbox also clears the new marker", async ({ page }) => {
    await postUpdate(page, OTHER, "@Tuyet Le could you look at this?");
    await switchUser(page, /Tuyet Le/);
    await openBoard(page);
    await expect(badge(page, OTHER)).toHaveAttribute("data-unread", "1", { timeout: 15000 });

    await page.goto("/workspace/rmit/inbox");
    await expect(page.getByTestId("notification-row").filter({ hasText: "mentioned you" }).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: /mark all read/i }).click();

    await openBoard(page);
    await expect(badge(page, OTHER)).toHaveAttribute("data-unread", "0", { timeout: 15000 });
    await expect(badge(page, OTHER)).toContainText("1");
  });
});
