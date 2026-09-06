import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, row, signInAs } from "./helpers";

/**
 * Task booking: the built-in Admin team and Task Allocation board, the public
 * booking form, and a manager allocating a request to a team board.
 */

const TASK_ALLOCATION_URL = "/workspace/rmit/boards/task-allocation";

async function openBookPage(page: Page) {
  await page.getByTestId("sidebar-book-task").click();
  await expect(page).toHaveURL(/\/workspace\/rmit\/book$/);
  await expect(page.getByTestId("booking-form")).toBeVisible();
}

test.describe("task booking", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("an admin gets the built-in Admin team and Task Allocation board, which cannot be archived", async ({ page }) => {
    await signInAs(page, "Danh");
    // Created on first load; the sidebar picks it up once the context refreshes.
    const sidebar = page.getByRole("complementary").first();
    await expect(sidebar.getByRole("link", { name: "Admin", exact: true })).toBeVisible({ timeout: 15_000 });
    await sidebar.getByRole("link", { name: "Admin", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin");
    await expect(page.getByTestId("team-built-in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Task Allocation/ })).toBeVisible();

    await page.goto(TASK_ALLOCATION_URL);
    await expect(page.getByTestId("board-table")).toBeVisible();
    await page.getByRole("button", { name: /board options/i }).click();
    await expect(page.getByRole("menuitem", { name: /archive board/i })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /delete board/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("a member sees neither the Admin team nor the Task Allocation board", async ({ page }) => {
    // Let the owner create them first, then look as a plain member.
    await signInAs(page, "Danh");
    await page.getByTestId("sidebar-book-task").click();
    await expect(page.getByTestId("booking-public-link")).toHaveValue(/\/book\/rmit\//, { timeout: 15_000 });

    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await signInAs(page, "Jun");
    const sidebar = page.getByRole("complementary").first();
    await expect(sidebar.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("sidebar-book-task")).toBeVisible();
    await page.goto(TASK_ALLOCATION_URL);
    await expect(page.getByText(/board not found|this board is private/i)).toBeVisible();
  });

  test("a stakeholder books through the public link and the request lands on Task Allocation", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    const link = page.getByTestId("booking-public-link");
    await expect(link).toHaveValue(/\/book\/rmit\/[a-z0-9]{24}$/, { timeout: 15_000 });
    const publicUrl = await link.inputValue();

    await page.goto(publicUrl);
    await expect(page.getByTestId("booking-card")).toBeVisible();
    await page.getByTestId("booking-name").fill("Priya Nair");
    await page.getByTestId("booking-email").fill("priya.nair@rmit.edu.au");
    await page.getByTestId("booking-department").fill("School of Design");
    await page.getByTestId("booking-title").fill("Open Day wayfinding posters");
    await page.getByTestId("booking-brief").fill("Six A1 posters for the Brunswick campus, brand compliant and print ready.");
    await page.getByTestId("booking-asset-print").click();
    await page.getByTestId("booking-priority-high").click();
    await page.getByTestId("booking-due").fill("2026-12-01");
    await page.getByTestId("booking-team").click();
    await page.getByRole("option", { name: /Digital/ }).click();
    await expect(page.getByTestId("booking-routing")).toContainText("marked for Digital");

    // The asset list has its own tab and is optional; fill two lines.
    await page.getByTestId("booking-tab-assets").click();
    await page.getByTestId("booking-asset-name-0").fill("A1 poster");
    await page.getByTestId("booking-asset-qty-0").fill("6");
    await page.getByTestId("booking-asset-spec-0").fill("594×841 mm, CMYK, print ready");
    await page.getByTestId("booking-asset-add").click();
    await page.getByTestId("booking-asset-name-1").fill("Instagram tile");
    await expect(page.getByTestId("booking-tab-assets")).toContainText("2");
    await page.getByTestId("booking-submit").click();

    await expect(page.getByTestId("booking-receipt")).toBeVisible();
    await expect(page.getByTestId("booking-reference")).toHaveText(/^TA-[0-9A-F]{5}$/);
    await expect(page.getByTestId("booking-receipt")).toContainText("allocation queue");
    await expect(page.getByTestId("booking-receipt")).toContainText("2 assets");

    // Back inside: the request is on Task Allocation with its answers in the columns.
    await page.goto(TASK_ALLOCATION_URL);
    const request = row(page, "Open Day wayfinding posters");
    await expect(request).toBeVisible();
    await expect(request).toContainText("Priya Nair");
    await expect(request).toContainText("Digital");
    await expect(request).toContainText("High");
    // The asset lines are its subitems.
    await request.getByRole("button", { name: /subitems/i }).click();
    await expect(page.getByText("A1 poster ×6")).toBeVisible();
    await expect(page.getByText("Instagram tile")).toBeVisible();
  });

  test("a validation error brings the request tab back into view", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await page.getByTestId("booking-tab-assets").click();
    await expect(page.getByTestId("booking-assets")).toBeVisible();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-title")).toBeVisible();
    await expect(page.getByText("Give the task a short name")).toBeVisible();
    await expect(page.getByTestId("booking-receipt")).toHaveCount(0);
  });

  test("a stakeholder needs the right key", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await expect(page.getByTestId("booking-public-link")).toHaveValue(/\/book\/rmit\//, { timeout: 15_000 });
    await page.goto("/book/rmit/nottherightkeynottherightkey");
    await expect(page.getByTestId("booking-unusable")).toBeVisible();
    await expect(page.getByTestId("booking-form")).toHaveCount(0);
  });

  test("a member books from inside the app and a manager allocates it to a team board", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await expect(page.getByTestId("booking-name")).toHaveValue("Danh Nguyen");
    await page.getByTestId("booking-title").fill("Alumni magazine cover");
    await page.getByTestId("booking-brief").fill("Cover artwork for the spring alumni magazine, portrait, with masthead space at the top.");
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-receipt")).toBeVisible();
    await page.getByRole("link", { name: /Open on Task Allocation/ }).click();

    await expect(page.getByTestId("item-panel")).toBeVisible();
    await expect(page.getByTestId("allocation-status")).toContainText("Not placed");
    await page.getByTestId("allocation-target").click();
    await page.getByTestId("allocation-board-rmitinerary-2026").click();
    await page.getByTestId("allocation-submit").click();
    await expect(page.getByTestId("allocation-status")).toContainText("Allocated to RMITinerary 2026");
    await expect(page.getByTestId("item-panel").getByText("RMITinerary 2026").first()).toBeVisible();

    // The linked copy exists on the team board and shares the name.
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(row(page, "Alumni magazine cover")).toBeVisible();
  });
});
