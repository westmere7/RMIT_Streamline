import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

// A phone: the sidebar becomes a drawer behind the menu button, pages stack
// their panes, and nothing scrolls sideways at page level.
test.use({ viewport: { width: 390, height: 844 } });

async function noPageOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
}

test.describe("phone layout", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("the sidebar is a drawer that closes after navigating", async ({ page }) => {
    await expect(page.getByTestId("mobile-top-bar")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();

    await page.getByTestId("mobile-menu").click();
    const drawer = page.getByTestId("mobile-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "My Work" }).click();
    await expect(page).toHaveURL(/\/my-work$/);
    await expect(page.getByTestId("mobile-drawer")).toHaveCount(0);

    // The backdrop closes it too.
    await page.getByTestId("mobile-menu").click();
    await expect(page.getByTestId("mobile-drawer")).toBeVisible();
    // The backdrop is the whole screen; tap the part of it beside the drawer.
    await page.getByRole("button", { name: "Close navigation" }).click({ position: { x: 370, y: 400 } });
    await expect(page.getByTestId("mobile-drawer")).toHaveCount(0);
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

  test("settings sections read as tabs and every page fits the screen", async ({ page }) => {
    await page.goto("/workspace/rmit/settings");
    await page.getByRole("button", { name: "Teams" }).click();
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await noPageOverflow(page);

    for (const path of ["/workspace/rmit", "/workspace/rmit/my-work", "/workspace/rmit/inbox", "/workspace/rmit/members", "/workspace/rmit/trackers", "/workspace/rmit/teams/00000002-0000-4000-8000-000000000002", "/workspace/rmit/boards/semester-1-campaign"]) {
      await page.goto(path);
      await expect(page.getByTestId("mobile-top-bar")).toBeVisible();
      await noPageOverflow(page);
    }
  });
});
