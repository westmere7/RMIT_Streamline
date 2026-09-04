import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

test.describe("board management", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("creates a board from the Campaign template and lands on it", async ({ page }) => {
    await page.getByTestId("sidebar-add-new").click();
    await page.getByTestId("sidebar-add-board").click();
    await page.getByLabel("Board name").fill("Open Day 2027");
    await page.getByRole("radio", { name: /Campaign/ }).click();
    await page.getByTestId("create-board-submit").click();
    await expect(page).toHaveURL(/boards\/open-day-2027/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Open Day 2027");
    await expect(page.getByTestId("group-Planning")).toBeVisible();
    await expect(page.getByTestId("group-Completed")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Day 2027" })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("group-Planning")).toBeVisible();
  });

  test("toggles a favourite from the board header", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/dooh-production");
    const star = page.getByTestId("favourite-toggle");
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    const sidebarFavourites = page.locator("aside").getByRole("link", { name: "DOOH Production" });
    await expect(sidebarFavourites).toHaveCount(2);
  });

  test("resets demo data from the developer menu", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    const input = page.getByTestId("add-item-Backlog");
    await input.fill("Temporary item");
    await input.press("Enter");
    await expect(page.locator('[data-item-name="Temporary item"]')).toBeVisible();
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Reset demo data" }).click();
    await page.getByRole("button", { name: "Reset data" }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/);
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(page.getByTestId("group-Backlog")).toBeVisible();
    await expect(page.locator('[data-item-name="Temporary item"]')).toHaveCount(0);
  });
});
