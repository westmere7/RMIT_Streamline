import { devices, expect, test, type Page } from "@playwright/test";
import { BOARD_URL, resetLocalData, signInAs } from "./helpers";

// A phone in the hand rather than a narrow desktop window: an Android handset's
// screen, touch, and a coarse pointer, so what a mouse finds by hovering has to
// be on the screen already. mobile-layout.spec.ts covers the shell; this covers
// the work people do in it.
const pixel = devices["Pixel 7"];
test.use({ viewport: pixel.viewport, userAgent: pixel.userAgent, deviceScaleFactor: pixel.deviceScaleFactor, isMobile: true, hasTouch: true });

const ITEM = "RMITinerary Explorer";

async function noPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
}

/** How opaque an element really is, its ancestors included: a control faded to 0 is not there for a thumb. */
async function shownOpacity(page: Page, testId: string, within = page.locator("body")) {
  return within.getByTestId(testId).first().evaluate((el) => {
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  });
}

async function openTask(page: Page, name = ITEM) {
  await page.goto(BOARD_URL);
  await page.getByTestId("mobile-item-card").filter({ hasText: name }).first().getByTestId("mobile-item-open").click();
  await expect(page.getByTestId("item-panel")).toBeVisible();
}

test.describe("on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("a task's status is a pill, and an update is written, edited, reacted to and deleted by touch", async ({ page }) => {
    await openTask(page);
    const panel = page.getByTestId("item-panel");
    // The same pill as on the cards, not the table's band across the whole field.
    const pill = panel.locator('[data-testid="status-cell"] [data-shape="pill"]').first();
    await expect(pill).toBeVisible();
    const box = (await pill.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(32);
    expect(box.width).toBeLessThan((await panel.boundingBox())!.width / 2);

    await panel.getByRole("tab", { name: /updates/i }).click();
    await page.getByTestId("comment-input").fill("Checked on the phone");
    await page.getByTestId("comment-submit").click();
    const posted = page.getByTestId("comment").filter({ hasText: "Checked on the phone" }).first();
    await expect(posted).toBeVisible({ timeout: 15_000 });

    // Nothing to hover over on a phone: the controls are simply there.
    expect(await shownOpacity(page, "comment-delete", posted)).toBe(1);
    expect(await shownOpacity(page, "comment-reaction-add", posted)).toBe(1);

    await posted.getByRole("button", { name: "Edit update" }).click();
    await page.getByTestId("comment-edit-input").fill("Checked on the phone, then edited");
    await page.locator("form", { has: page.getByTestId("comment-edit-input") }).getByRole("button", { name: "Save" }).click();
    const edited = page.getByTestId("comment").filter({ hasText: "then edited" }).first();
    await expect(edited).toBeVisible();

    await edited.getByTestId("comment-reaction-add").click();
    await page.getByTestId("comment-reaction-picker").getByRole("button").first().click();
    await expect(edited.getByTestId("comment-reaction").first()).toBeVisible();

    await edited.getByTestId("comment-delete").click();
    await edited.getByTestId("comment-delete-confirm").click();
    await expect(page.getByTestId("comment").filter({ hasText: "then edited" })).toHaveCount(0);
  });

  test("a status is changed from the card, in a sheet", async ({ page }) => {
    await page.goto(BOARD_URL);
    const card = page.getByTestId("mobile-item-card").filter({ hasText: ITEM }).first();
    const before = (await card.getByTestId("mobile-card-status").innerText()).trim();
    await card.getByTestId("mobile-card-status").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // Any status but the one it has.
    const names = (await sheet.getByTestId("mobile-label-option").allInnerTexts()).map((t) => t.trim());
    const name = names.find((n) => n && n !== before)!;
    await sheet.getByTestId("mobile-label-option").filter({ hasText: name }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card.getByTestId("mobile-card-status")).toContainText(name);
  });

  test("search opens full screen, finds a board, and Cancel closes it", async ({ page }) => {
    await page.getByTestId("mobile-search").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(pixel.viewport.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(pixel.viewport.height - 1);
    await dialog.locator("input").first().fill("RMITinerary");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("My Work is searched and filtered from a sheet", async ({ page }) => {
    await page.goto("/workspace/rmit/my-work");
    const rows = page.getByTestId("mobile-task-row");
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();

    await page.getByTestId("my-work-search").fill("zzzz-nothing-called-this");
    await expect(rows).toHaveCount(0);
    await page.getByTestId("my-work-search").fill("");
    await expect(rows).toHaveCount(all);

    await page.getByTestId("my-work-open-filters").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("my-work-due-overdue").click();
    await page.getByTestId("my-work-sheet-done").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("my-work-filter-count")).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(all);
    // Every date left is a late one (said to a screen reader as "Overdue").
    for (const due of await page.getByTestId("mobile-task-due").evaluateAll((els) => els.map((el) => el.textContent ?? ""))) expect(due).toMatch(/overdue/i);

    await page.getByTestId("my-work-clear-filters").click();
    await expect(rows).toHaveCount(all);
    await noPageOverflow(page);
  });

  test("every settings section opens from the list and goes back to it", async ({ page }) => {
    await page.goto("/workspace/rmit/settings");
    const rows = page.locator('[data-testid^="settings-row-"]:not([data-testid="settings-row-about"])');
    await expect(rows.first()).toBeVisible();
    const ids = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.replace("settings-row-", "")));
    expect(ids).toEqual(expect.arrayContaining(["general", "tickets", "teams", "departments", "asset-types", "permissions", "view", "documentation"]));

    for (const id of ids) {
      await page.getByTestId(`settings-row-${id}`).click();
      await expect(page).toHaveURL(new RegExp(`section=${id}$`));
      await expect(page.getByTestId("settings-back")).toBeVisible();
      await noPageOverflow(page);
      await page.getByTestId("settings-back").click();
      await expect(page.getByTestId(`settings-row-${id}`)).toBeVisible();
    }
  });

  test("a board is made from Browse, in a sheet whose button is in reach with the phone on its side", async ({ page }) => {
    await page.setViewportSize({ width: pixel.viewport.height, height: pixel.viewport.width });
    await page.goto("/workspace/rmit/browse");
    await page.getByTestId("browse-new-board").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Never taller than the screen: it scrolls inside itself instead.
    expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(pixel.viewport.width);
    await dialog.getByLabel(/board name/i).fill("Made on a phone");
    const submit = page.getByTestId("create-board-submit");
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    await expect(page).toHaveURL(/\/boards\//, { timeout: 15_000 });
    await expect(page.getByText("Made on a phone").first()).toBeVisible();
  });

  test("losing the connection says so, and coming back clears it", async ({ page, context }) => {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
  });

  test("the form's save and publish controls sit above the form, not under it", async ({ page }) => {
    await page.goto("/workspace/rmit/book");
    await page.getByTestId("portal-tab-book").click();
    await expect(page.getByTestId("booking-editor")).toBeVisible({ timeout: 15_000 });
    const publish = page.getByRole("button", { name: "Publish the form" });
    await expect(publish).toBeVisible();
    const steps = page.getByRole("tablist", { name: "The steps of the form" });
    expect((await publish.boundingBox())!.y).toBeLessThan((await steps.boundingBox())!.y);
    await noPageOverflow(page);
  });

  test("a stakeholder books through all four steps on a phone", async ({ page }) => {
    await page.goto("/workspace/rmit/book");
    await page.getByTestId("portal-tab-book").click();
    const link = page.getByTestId("booking-public-link");
    await expect(link).toHaveAttribute("href", /\/book\/rmit\/[a-z0-9]{24}$/, { timeout: 15_000 });
    const publicUrl = (await link.getAttribute("href"))!;
    // A stakeholder has no account here: signed in, the session would answer for them.
    await page.goto("/workspace/rmit/more");
    await page.getByTestId("more-sign-out").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto(publicUrl);
    await expect(page.getByTestId("booking-card")).toBeVisible();
    await noPageOverflow(page);

    await page.getByTestId("booking-name").fill("Mai Pham");
    await page.getByTestId("booking-email").fill("mai.pham@rmit.edu.au");
    await page.getByTestId("booking-department").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("booking-title").fill("Careers fair banners");
    await page.getByTestId("booking-priority").click();
    await page.getByTestId("booking-priority-high").click();
    await page.getByTestId("booking-due").fill("2026-12-01");
    await page.getByTestId("booking-service-design").click();
    await page.getByTestId("booking-sub-print").click();
    await page.getByTestId("booking-next").click();

    await expect(page.getByTestId("booking-step-brief")).toBeVisible();
    await page.getByTestId("booking-answer-design-what").fill("Two pull-up banners for the careers fair.");
    await page.getByTestId("booking-answer-design-specs").fill("850 × 2000 mm, print ready.");
    await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
    await page.getByTestId("booking-next").click();

    await expect(page.getByTestId("booking-step-assets")).toBeVisible();
    await noPageOverflow(page);
    await page.getByTestId("booking-next").click();

    await expect(page.getByTestId("booking-step-review")).toContainText("Two pull-up banners");
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-receipt")).toBeVisible();
    await expect(page.getByTestId("booking-ticket")).toHaveText(/^CP_\d{3,}$/);
    await noPageOverflow(page);
  });
});
