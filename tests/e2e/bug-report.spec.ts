import { devices, expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchAccount } from "./helpers";

// One red pixel, as a browser would hand over a screenshot.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TITLE = "The Save button overlaps the footer";

/** A screenshot pasted into the description, the way Ctrl+V delivers one. */
async function pasteScreenshot(page: Page) {
  await page.getByTestId("bug-report-description").evaluate(async (field, png) => {
    const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
    const data = new DataTransfer();
    data.items.add(new File([blob], "paste.png", { type: "image/png" }));
    field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, PNG);
}

test.describe("reporting a bug", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("a member reports one from their menu, and it lands in Bugs on a board only Danh belongs to", async ({ page }) => {
    // Jun is a member. Workspace admins see every board that is not the app's own, this one included.
    await signInAs(page, "Jun");
    await page.getByTestId("user-menu").click();
    await page.getByTestId("menu-report-bug").click();
    const dialog = page.getByTestId("bug-report-dialog");
    await expect(dialog).toBeVisible();

    // Nothing to send until something is written.
    await expect(dialog.getByTestId("bug-report-send")).toBeDisabled();
    await dialog.getByTestId("bug-report-category").click();
    await page.getByTestId("bug-report-category-looks-wrong").click();
    await dialog.getByTestId("bug-report-description").fill(`${TITLE}\nOn Settings, at 1280 wide.`);

    // One pasted, one uploaded.
    await pasteScreenshot(page);
    await expect(dialog.getByTestId("bug-report-screenshot")).toHaveCount(1);
    await dialog.getByTestId("bug-report-file").setInputFiles({ name: "upload.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
    await expect(dialog.getByTestId("bug-report-screenshot")).toHaveCount(2);
    await dialog.getByTestId("bug-report-send").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Bug reported. Thank you.")).toBeVisible();

    // Jun is not on the board.
    await expect(page.getByRole("link", { name: "App development" })).toHaveCount(0);

    await switchAccount(page, "Danh");
    await expect(page.getByRole("link", { name: "App development" }).first()).toBeVisible({ timeout: 15_000 });
    await openBoard(page, "/workspace/rmit/boards/app-development");
    const report = row(page, TITLE);
    await expect(report).toBeVisible();
    await expect(page.getByText("Bugs", { exact: true }).first()).toBeVisible();
    await expect(report.getByRole("gridcell", { name: `Category: Looks wrong for ${TITLE}` })).toBeVisible();
    await expect(report.getByRole("gridcell", { name: `Screenshot: Screenshot 1 for ${TITLE}` })).toBeVisible();
    await expect(report.getByRole("gridcell", { name: `Screenshot 2: Screenshot 2 for ${TITLE}` })).toBeVisible();
  });

  test("About offers it too, and closes to make way", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/settings");
    await page.getByTestId("settings-about").click();
    await page.getByTestId("about-report-bug").click();
    await expect(page.getByTestId("about-dialog")).toHaveCount(0);
    await expect(page.getByTestId("bug-report-dialog")).toBeVisible();
  });
});

test.describe("reporting a bug on a phone", () => {
  const pixel = devices["Pixel 7"];
  test.use({ viewport: pixel.viewport, userAgent: pixel.userAgent, deviceScaleFactor: pixel.deviceScaleFactor, isMobile: true, hasTouch: true });

  test("More has it", async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Emily");
    await page.goto("/workspace/rmit/more");
    await page.getByTestId("more-report-bug").click();
    await expect(page.getByTestId("bug-report-dialog")).toBeVisible();
    await expect(page.getByTestId("bug-report-add-screenshot")).toBeVisible();
  });
});
