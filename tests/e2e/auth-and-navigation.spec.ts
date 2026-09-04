import { expect, test } from "@playwright/test";
import { openBoard, resetLocalData, signInAs } from "./helpers";

test.describe("authentication and navigation", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("signs in as Danh and lands on the workspace home", async ({ page }) => {
    await signInAs(page, "Danh");
    await expect(page.getByText("Recently visited")).toBeVisible();
    await expect(page.getByRole("link", { name: "Vietnam Creative", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Melbourne Creative", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "RMITinerary 2026" }).first()).toBeVisible();
  });

  test("redirects signed-out visitors to login and remembers the session", async ({ page }) => {
    await page.goto("/workspace/rmit");
    await expect(page).toHaveURL(/\/login$/);
    await signInAs(page, "Emily");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Emily");
  });

  test("opens a board from the sidebar with populated groups", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.getByRole("link", { name: "RMITinerary 2026" }).first().click();
    await expect(page).toHaveURL(/rmitinerary-2026/);
    await expect(page.getByTestId("group-Design")).toBeVisible();
    await expect(page.getByTestId("group-Production")).toBeVisible();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(16);
  });

  test("opens My Work with sections", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.getByRole("link", { name: "My Work" }).click();
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
    await expect(page.getByTestId("my-work-today")).toBeVisible();
    await expect(page.getByText("Sem 1 DOOH adaptation")).toBeVisible();
  });

  test("global search finds items and navigates", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Search boards, items, teams and people…").fill("Pragmatist");
    await page.getByRole("option", { name: /RMITinerary Pragmatist/ }).click();
    await expect(page).toHaveURL(/rmitinerary-2026\?item=/);
    await expect(page.getByTestId("item-panel")).toContainText("RMITinerary Pragmatist");
  });

  test("shows the inbox with unread notifications", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.getByRole("link", { name: /Inbox/ }).click();
    await expect(page.getByText("Emily mentioned you in Masterclass landing page hero")).toBeVisible();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("You are all caught up.")).toBeVisible();
  });

  test("board is reachable directly and persists across reload", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBoard(page);
    await page.reload();
    await expect(page.getByTestId("group-Design")).toBeVisible();
  });
});
