import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, row, signInAs } from "./helpers";

/**
 * The receipt's link to its task (v0.169.0), on the local demo: switched on in
 * the form editor, given on the receipt, opening the task read-only with
 * nobody signed in, the same link after the task is archived, and closed
 * when the editor switches it off again.
 */

const TITLE = "Graduation banners task link";

async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

async function setTaskLink(page: Page, on: boolean) {
  await page.goto("/workspace/rmit/book/form");
  await page.getByTestId("editor-tab-review").click();
  const toggle = page.getByTestId("editor-share-task-link");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
  await page.getByTestId("booking-editor-publish").click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("booking-editor-publish")).toBeDisabled({ timeout: 20_000 });
}

test.describe("the receipt's task link", () => {
  test.setTimeout(240_000);
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("given on the receipt, opens the task with nobody signed in, survives archiving, closes when switched off", async ({ page }) => {
    await signInAs(page, "Danh");
    await setTaskLink(page, true);
    await signOut(page);

    // A visitor books.
    await page.goto("/rmit/booking");
    await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("booking-name").fill("Priya Nair");
    await page.getByTestId("booking-email").fill("priya.link@rmit.edu.au");
    await page.getByTestId("booking-department").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("booking-title").fill(TITLE);
    await page.getByTestId("booking-priority").click();
    await page.getByTestId("booking-priority-high").click();
    await page.getByTestId("booking-due").fill("2026-12-01");
    await page.getByTestId("booking-service-design").click();
    if (await page.getByTestId("booking-sub-print").count()) await page.getByTestId("booking-sub-print").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-answer-design-what").fill("Banners.");
    await page.getByTestId("booking-answer-design-specs").fill("Pull-up.");
    await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-skip-assets").click();
    await page.getByTestId("booking-submit").click();
    const linkBox = page.getByTestId("booking-task-link");
    await expect(linkBox).toBeVisible({ timeout: 30_000 });
    const link = await page.getByTestId("booking-task-link-url").inputValue();
    expect(link).toMatch(/\/rmit\/booking\/t\/[0-9a-f-]{36}\.[0-9a-f]{40}$/);

    // Opens the task, read-only, with nobody signed in.
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("task-link-page")).toContainText(TITLE, { timeout: 30_000 });
    // The pop-up's layout, and nothing the team does from here: no allocation hint, no empty links.
    const linkPage = page.getByTestId("task-link-page");
    await expect(linkPage.getByTestId("popup-card")).toBeVisible();
    await expect(linkPage.getByTestId("allocation-section")).toHaveCount(0);
    await expect(linkPage.getByTestId("linked-items")).toHaveCount(0);
    await expect(linkPage.getByTestId("panel-menu")).toHaveCount(0);
    // Its own menu: the link to copy; no board for somebody signed out.
    await linkPage.getByTestId("shared-menu").click();
    await expect(page.getByTestId("shared-menu-copy")).toBeVisible();
    await expect(page.getByTestId("shared-menu-open-board")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Archived by the team: the same link still opens it.
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/boards/task-allocation");
    const request = row(page, TITLE);
    await expect(request).toBeVisible({ timeout: 30_000 });
    await request.hover();
    await request.getByRole("button", { name: `More actions for ${TITLE}` }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    const confirm = page.getByRole("button", { name: /^Archive/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(request).toHaveCount(0, { timeout: 20_000 });
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("task-link-page")).toContainText(TITLE, { timeout: 30_000 });
    await expect(page.getByTestId("task-link-archived")).toBeVisible();
    // Signed in: the menu opens it where it is, the board's archive.
    await page.getByTestId("shared-menu").click();
    await page.getByTestId("shared-menu-open-board").click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/boards\/[^/]+\/archive\?item=/, { timeout: 30_000 });

    // Switched off in the editor: the link closes.
    await setTaskLink(page, false);
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("task-link-closed")).toContainText("switched off", { timeout: 30_000 });
  });
});
