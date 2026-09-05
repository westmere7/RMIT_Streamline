import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

const LONG = "Brand, Campaigns, Content, Digital, Events & Everything Else";

test.describe("teams and members", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("an unknown workspace slug says so instead of hanging or crashing", async ({ page }) => {
    await page.goto("/workspace/does-not-exist");
    await expect(page.getByText(/workspace not found/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /go to my workspace/i }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/);
  });

  test("creates a team, renames it, adds and removes a member, then archives it", async ({ page }) => {
    await page.getByTestId("sidebar-add-new").click();
    await page.getByTestId("sidebar-add-team").click();
    await page.getByLabel("Team name").fill("QA Squad");
    await page.getByRole("button", { name: /create team/i }).click();
    await expect(page.getByRole("heading", { level: 1, name: "QA Squad" })).toBeVisible({ timeout: 10000 });
    const url = page.url();

    // Rename through the edit dialog.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Team name").fill(LONG);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Brand, Campaigns", { timeout: 10000 });

    // Long names must not blow the layout out horizontally.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // Add a member, then take them out again.
    await page.locator("main").getByRole("button", { name: "Add", exact: true }).click();
    await page.getByPlaceholder("Search people…").fill("Tuyet");
    await page.getByRole("option", { name: /Tuyet Le/ }).click();
    await expect(page.getByText("Tuyet Le")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Tuyet Le")).toBeVisible();
    await page.getByRole("button", { name: /Remove Tuyet Le/ }).click();
    await expect(page.getByText("Tuyet Le")).toHaveCount(0);

    // Archive, and confirm the archived team is marked as such after reload.
    await page.getByRole("button", { name: "Archive" }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /archive/i }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 10000 });
    await page.goto(url);
    await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("an invalid team id shows the not-found state", async ({ page }) => {
    await page.goto("/workspace/rmit/teams/00000000-0000-4000-8000-000000000999");
    await expect(page.getByText(/team not found/i)).toBeVisible({ timeout: 10000 });
  });

  test("members page lists people, opens a profile and changes a role", async ({ page }) => {
    await page.goto("/workspace/rmit/members");
    await expect(page.getByText("Emily Carter")).toBeVisible({ timeout: 10000 });
    const rows = await page.getByTestId("member-profile-link").count();
    expect(rows).toBeGreaterThan(10);

    await page.getByTestId("member-profile-link").filter({ hasText: "Tuyet Le" }).click();
    await expect(page.getByTestId("profile-name")).toHaveText("Tuyet Le", { timeout: 10000 });
    await page.goBack();

    // Role change must survive a reload.
    const row = page.locator("tr", { hasText: "Tuyet Le" }).first();
    await row.getByRole("button", { name: "Actions for Tuyet Le" }).click();
    await page.getByRole("menuitemradio", { name: "Admin" }).click();
    await page.reload();
    await expect(page.locator("tr", { hasText: "Tuyet Le" }).first()).toContainText(/admin/i, { timeout: 10000 });
  });

  test("deactivating a member takes them out of pickers", async ({ page }) => {
    await page.goto("/workspace/rmit/members");
    const row = page.locator("tr", { hasText: "Minh Hoang" }).first();
    await row.getByRole("button", { name: "Actions for Minh Hoang" }).click();
    await page.getByRole("menuitem", { name: /deactivate/i }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /deactivate/i }).click();
    await expect(row).toContainText(/deactivated/i, { timeout: 10000 });

    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await page.getByTestId("item-row").first().getByTestId("person-cell").click();
    await page.getByTestId("person-picker").getByPlaceholder("Search people…").fill("Minh");
    await expect(page.getByTestId("person-picker").getByText("Minh Hoang")).toHaveCount(0);
  });
});
