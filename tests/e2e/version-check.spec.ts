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

  test("a newer build on the server raises a pop-up that does not force a reload", async ({ page }) => {
    await serveNewerBuild(page);
    await signInAs(page, "Danh");
    const popup = page.getByTestId("update-card");
    await expect(popup).toBeVisible({ timeout: 15000 });
    await expect(popup).toContainText("v9.9.9 is ready");
    await expect(page.getByTestId("update-refresh")).toHaveText(/Refresh/);
    // Compact until asked: the changelog opens in place.
    await expect(page.getByTestId("changelog-entries")).toHaveCount(0);
    await page.getByTestId("update-whats-new").click();
    await expect(page.getByTestId("changelog-entries").locator("li").first()).toBeVisible();

    // Still the same page underneath.
    await expect(page).toHaveURL(/\/workspace\/rmit$/);

    // "Later" puts it away and it stays away for this build.
    await page.getByTestId("update-later").click();
    await expect(popup).toHaveCount(0);
    await page.goto("/workspace/rmit/my-work");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("update-card")).toHaveCount(0);
  });
});

// After the refresh, not before it: the app says it was updated, and what changed.
test.describe("app updated", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("a first visit has nothing to catch up on, and starts from this version", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("app-updated")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("streamline.version.seen"))).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("it is off until asked for, and off it still keeps up with the version", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.evaluate(() => localStorage.setItem("streamline.version.seen", "0.1.0"));
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("app-updated")).toHaveCount(0);
    // Read as it went by, so switching it on later brings no backlog.
    expect(await page.evaluate(() => localStorage.getItem("streamline.version.seen"))).not.toBe("0.1.0");
  });

  test("switched on, a browser that last ran an older version is told what changed, once", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/settings?section=view");
    const toggle = page.getByTestId("setting-app-updated");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() => localStorage.setItem("streamline.version.seen", "0.1.0"));
    await page.goto("/workspace/rmit");
    const card = page.getByTestId("app-updated");
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText("App updated");
    await expect(card.getByTestId("app-updated-entries").locator("li").first()).toBeVisible();
    // The latest release is open; the ones before it are a tap away.
    await card.getByTestId("app-updated-earlier").click();
    await expect(card.getByTestId("app-updated-earlier")).toHaveText(/Hide earlier updates/);

    await card.getByTestId("app-updated-done").click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("app-updated")).toHaveCount(0);
  });

  test("switched on, it waits while a newer build is on offer", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.evaluate(() => {
      localStorage.setItem("streamline.version.notice", "on");
      localStorage.setItem("streamline.version.seen", "0.1.0");
    });
    await serveNewerBuild(page);
    await page.reload();
    await expect(page.getByTestId("update-card")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("app-updated")).toHaveCount(0);
    // Later: then it is the news that is left.
    await page.getByTestId("update-later").click();
    await expect(page.getByTestId("app-updated")).toBeVisible();
  });
});
