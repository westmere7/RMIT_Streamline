import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/** About is a dialog, opened from Settings or from the logo in the sidebar. */
async function openAbout(page: Page, from: "settings" | "logo" = "settings") {
  if (from === "settings") {
    await page.goto("/workspace/rmit/settings");
    await page.getByTestId("settings-about").click();
  } else {
    await page.getByTestId("sidebar-about").click();
  }
  await expect(page.getByTestId("about-dialog")).toBeVisible({ timeout: 15000 });
}

/** Pretend the server has moved on to another build. */
async function serveNewerBuild(page: Page) {
  await page.route("**/api/version", (route) =>
    route.fulfill({ json: { version: "9.9.9", buildId: "feedfacecafe", builtAt: "2030-01-01T00:00:00.000Z" }, headers: { "cache-control": "no-store" } }),
  );
}

test.describe("version check", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("About wears the running version on a badge beside the mark", async ({ page }) => {
    await signInAs(page, "Danh");
    await openAbout(page);
    await expect(page.getByTestId("about-version")).toHaveText(/^v\d+\.\d+\.\d+$/);
    await page.keyboard.press("Escape");

    // The version is nowhere else until asked for; the logo opens the same dialog.
    await page.goto("/workspace/rmit");
    await expect(page.getByTestId("about-version")).toHaveCount(0);
    await openAbout(page, "logo");
    await expect(page.getByTestId("about-version")).toHaveText(/^v\d+\.\d+\.\d+$/);
  });

  test("a newer build on the server raises a notice that does not force a reload", async ({ page }) => {
    await serveNewerBuild(page);
    await signInAs(page, "Danh");
    const notice = page.getByText("A new version of Streamline is ready");
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();

    // Still the same page, still usable.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/workspace\/rmit$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Danh");

    // "Later" puts the notice away and it stays away for this build.
    await page.getByRole("button", { name: "Later" }).click();
    await expect(notice).toHaveCount(0);
    await page.goto("/workspace/rmit/my-work");
    await page.waitForTimeout(1500);
    await expect(page.getByText("A new version of Streamline is ready")).toHaveCount(0);
  });
});
