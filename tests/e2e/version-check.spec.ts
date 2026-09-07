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

  test("About shows the running version and reports it as up to date", async ({ page }) => {
    await signInAs(page, "Danh");
    await openAbout(page);
    await expect(page.getByTestId("about-version")).toContainText(/Streamline v\d+\.\d+\.\d+ \(/);
    await expect(page.getByTestId("version-status")).toContainText(/up to date/i, { timeout: 15000 });
    await expect(page.getByTestId("version-reload")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The version is nowhere else until asked for; the logo opens the same dialog.
    await page.goto("/workspace/rmit");
    await expect(page.getByText(/Streamline v\d+\.\d+\.\d+/)).toHaveCount(0);
    await openAbout(page, "logo");
    await expect(page.getByTestId("about-dialog")).toContainText(/Streamline v\d+\.\d+\.\d+ \(/);
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

    // About still says so and offers the reload.
    await openAbout(page);
    await expect(page.getByTestId("version-status")).toContainText(/newer version is live: v9\.9\.9 \(feedfac\)/, { timeout: 15000 });
    await expect(page.getByTestId("version-reload")).toBeVisible();
  });

  test("a manual check picks up a build that appeared after the page loaded", async ({ page }) => {
    await signInAs(page, "Danh");
    await openAbout(page);
    await expect(page.getByTestId("version-status")).toContainText(/up to date/i, { timeout: 15000 });
    await serveNewerBuild(page);
    await page.getByTestId("version-check").click();
    await expect(page.getByTestId("version-status")).toContainText(/newer version is live/i, { timeout: 15000 });
    await expect(page.getByText("A new version of Streamline is ready")).toBeVisible();
  });
});
