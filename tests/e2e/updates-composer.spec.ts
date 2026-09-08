import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchAccount } from "./helpers";

const ITEM = "RMITinerary Explorer";

async function openUpdates(page: Page, item = ITEM) {
  await openBoard(page);
  await row(page, item).getByRole("button", { name: `Open ${item}` }).click();
  await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
  await expect(page.getByTestId("comment-input")).toBeVisible({ timeout: 15000 });
}

/** The composer is a contenteditable: fill() replaces its text, and what it shows is the formatted result. */
const composer = (page: Page) => page.getByTestId("comment-input");

test.describe("writing an update", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openUpdates(page);
  });

  test("typing @ offers people and inserts the one chosen", async ({ page }) => {
    await composer(page).fill("Morning @tuy");
    await expect(page.getByTestId("mention-list")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("option", { name: /Tuyet Le/ })).toBeVisible();
    await page.getByRole("option", { name: /Tuyet Le/ }).click();
    await expect(composer(page).getByTestId("mention")).toHaveText("@Tuyet Le");
    await expect(composer(page)).toHaveText(/Morning @Tuyet Le/);

    // The keyboard alone gets there too.
    await composer(page).fill("Also @Jun");
    await expect(page.getByTestId("mention-list")).toBeVisible();
    await composer(page).press("Enter");
    await expect(composer(page).getByTestId("mention")).toHaveText("@Jun Tanaka");
    await expect(page.getByTestId("mention-list")).toHaveCount(0);

    // Escape closes the list and leaves the text alone.
    await composer(page).fill("Nobody @Tuy");
    await expect(page.getByTestId("mention-list")).toBeVisible();
    await composer(page).press("Escape");
    await expect(page.getByTestId("mention-list")).toHaveCount(0);
    await expect(composer(page)).toHaveText("Nobody @Tuy");
  });

  test("a posted mention is highlighted and reaches the person", async ({ page }) => {
    await composer(page).fill("@Tuyet Le could you look at the cover?");
    await page.getByTestId("comment-submit").click();
    const posted = page.getByTestId("comment").first();
    await expect(posted).toBeVisible({ timeout: 15000 });
    await expect(posted.getByTestId("mention")).toHaveText("@Tuyet Le");

    // Tuyet has it in her inbox.
    await page.goto("/workspace/rmit");
    await switchAccount(page, "Tuyet");
    await page.goto("/workspace/rmit/inbox");
    await expect(page.getByTestId("notification-row").filter({ hasText: "mentioned you" }).first()).toBeVisible({ timeout: 20000 });
  });

  test("formatting shows as you write: bold, headings, lists and colour", async ({ page }) => {
    await composer(page).fill("plan");
    await composer(page).selectText();
    await page.getByTestId("format-bold").click();
    await expect(composer(page).locator("strong")).toHaveText("plan");
    await expect(page.getByTestId("format-bold")).toHaveAttribute("aria-pressed", "true");

    await composer(page).fill("Heading here");
    await page.getByTestId("format-h1").click();
    await expect(composer(page).locator("h1")).toHaveText("Heading here");

    await composer(page).fill("");
    await page.keyboard.type("one");
    await composer(page).press("Enter");
    await page.keyboard.type("two");
    await composer(page).selectText();
    await page.getByTestId("format-numbers").click();
    await expect(composer(page).locator("ol li")).toHaveCount(2);

    await composer(page).fill("urgent");
    await composer(page).selectText();
    await page.getByTestId("format-color").click();
    await page.getByTestId("color-red").click();
    await expect(composer(page).locator('span[data-color="red"]')).toHaveText("urgent");
  });

  test("the link window checks the address, and a link can be edited or removed", async ({ page }) => {
    await composer(page).fill("");
    await page.getByTestId("format-link").click();
    await expect(page.getByTestId("link-popover")).toBeVisible();

    // Not an address: nothing is inserted and the window says why.
    await page.getByTestId("link-href").fill("not a link");
    await page.getByTestId("link-apply").click();
    await expect(page.getByTestId("link-error")).toBeVisible();
    await expect(composer(page).getByRole("link")).toHaveCount(0);

    // A bare domain is understood as https.
    await page.getByTestId("link-href").fill("example.com/brief");
    await page.getByTestId("link-label").fill("the brief");
    await page.getByTestId("link-apply").click();
    await expect(page.getByTestId("link-popover")).toHaveCount(0);
    const link = composer(page).getByRole("link", { name: "the brief" });
    await expect(link).toHaveAttribute("href", "https://example.com/brief");

    // Hovering the link offers to edit or remove it.
    await link.hover();
    await expect(page.getByTestId("link-card")).toBeVisible();
    await page.getByTestId("link-card-edit").click();
    await expect(page.getByTestId("link-popover")).toBeVisible();
    await expect(page.getByTestId("link-href")).toHaveValue("https://example.com/brief");
    await page.getByTestId("link-href").fill("https://example.com/brief-v2");
    await page.getByTestId("link-apply").click();
    await expect(composer(page).getByRole("link", { name: "the brief" })).toHaveAttribute("href", "https://example.com/brief-v2");

    await composer(page).getByRole("link", { name: "the brief" }).hover();
    await page.getByTestId("link-card-remove").click();
    await expect(composer(page).getByRole("link")).toHaveCount(0);
    await expect(composer(page)).toHaveText(/the brief/);
  });

  test("lists continue themselves and end on an empty item", async ({ page }) => {
    await composer(page).click();
    await page.keyboard.type("- first");
    await expect(composer(page).locator("ul li")).toHaveCount(1);
    await composer(page).press("Enter");
    await page.keyboard.type("second");
    await expect(composer(page).locator("ul li")).toHaveCount(2);
    // An empty item ends the list.
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await page.keyboard.type("after");
    await expect(composer(page).locator("ul li")).toHaveCount(2);
    await expect(composer(page).locator("p").filter({ hasText: "after" })).toHaveCount(1);

    await composer(page).fill("");
    await page.keyboard.type("1. one");
    await composer(page).press("Enter");
    await page.keyboard.type("two");
    await expect(composer(page).locator("ol li")).toHaveCount(2);
  });

  test("what was written is what is shown", async ({ page }) => {
    await composer(page).click();
    await page.keyboard.type("Cover plan");
    await page.getByTestId("format-h1").click();
    await composer(page).press("End");
    await composer(page).press("Enter");
    await page.keyboard.type("Print and digital both need it.");
    await composer(page).press("Home");
    for (let i = 0; i < 5; i++) await composer(page).press("Shift+ArrowRight");
    await page.getByTestId("format-bold").click();
    await composer(page).press("End");
    await composer(page).press("Enter");
    await page.keyboard.type("- artwork");
    await composer(page).press("Enter");
    await page.keyboard.type("proof");
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await page.getByTestId("format-link").click();
    await page.getByTestId("link-href").fill("https://example.com/brief");
    await page.getByTestId("link-label").fill("the brief");
    await page.getByTestId("link-apply").click();
    await composer(page).press("End");
    await composer(page).press("Enter");
    await page.keyboard.type("blocked on photography");
    await composer(page).press("Shift+Home");
    await page.getByTestId("format-color").click();
    await page.getByTestId("color-red").click();
    await page.getByTestId("comment-submit").click();

    const posted = page.getByTestId("comment").first();
    await expect(posted).toBeVisible({ timeout: 15000 });
    await expect(posted.getByText("Cover plan")).toBeVisible();
    await expect(posted.locator("strong", { hasText: "Print" })).toBeVisible();
    await expect(posted.locator("li")).toHaveCount(2);
    const link = posted.getByRole("link", { name: "the brief" });
    await expect(link).toHaveAttribute("href", "https://example.com/brief");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(posted.getByText("blocked on photography")).toBeVisible();

    // And it survives a reload, because it is what was stored.
    await page.reload();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await expect(page.getByTestId("comment").first().locator("strong", { hasText: "Print" })).toBeVisible({ timeout: 20000 });
  });

  test("editing shows the update formatted, not as markup", async ({ page }) => {
    await composer(page).fill("plain");
    await composer(page).selectText();
    await page.getByTestId("format-bold").click();
    await page.getByTestId("comment-submit").click();
    const posted = page.getByTestId("comment").first();
    await expect(posted.locator("strong", { hasText: "plain" })).toBeVisible({ timeout: 15000 });

    await posted.hover();
    await posted.getByRole("button", { name: "Edit update" }).click();
    const editor = page.getByTestId("comment-edit-input");
    await expect(editor.locator("strong")).toHaveText("plain");
    await expect(editor).not.toContainText("**");
  });

  test("markup that is not a real address stays text", async ({ page }) => {
    await composer(page).fill("[click](javascript:alert(1))");
    await page.getByTestId("comment-submit").click();
    const posted = page.getByTestId("comment").first();
    await expect(posted).toContainText("[click](javascript:alert(1))", { timeout: 15000 });
    await expect(posted.getByRole("link")).toHaveCount(0);
  });
});

test.describe("an update posted to a linked task", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);

    // Link this item to one on another board.
    await row(page, ITEM).getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: /link to another item/i }).click();
    await expect(page.getByTestId("link-item-dialog")).toBeVisible({ timeout: 20000 });
    await page.getByTestId("link-search").fill("Campus banner");
    await page.getByTestId("link-candidate").filter({ hasText: "Campus banner artwork" }).first().click();
    await page.getByTestId("link-submit").click();
    await expect(page.getByTestId("link-item-dialog")).toHaveCount(0, { timeout: 20000 });
  });

  test("is marked as linked, and editing it changes the copy too", async ({ page }) => {
    await openUpdates(page);
    await expect(page.getByTestId("comment-also-linked")).toHaveAttribute("aria-checked", "true");
    await composer(page).fill("Shared across both boards");
    await page.getByTestId("comment-submit").click();

    const posted = page.getByTestId("comment").filter({ hasText: "Shared across both boards" }).first();
    await expect(posted).toBeVisible({ timeout: 20000 });
    await expect(posted.getByTestId("comment-linked-badge")).toBeVisible();

    // The copy is on the other task.
    await page.goto("/workspace/rmit/boards/open-day-2026");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20000 });
    // Linking keeps the two items in sync, name included, so the copy is on the
    // item that now carries this name.
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    const copy = page.getByTestId("comment").filter({ hasText: "Shared across both boards" }).first();
    await expect(copy).toBeVisible({ timeout: 20000 });
    await expect(copy.getByTestId("comment-linked-badge")).toBeVisible();

    // Edit it here; the original changes as well.
    await copy.hover();
    await copy.getByRole("button", { name: "Edit update" }).click();
    await page.getByTestId("comment-edit-input").fill("Edited on the linked task");
    await page.locator("form", { has: page.getByTestId("comment-edit-input") }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("comment").filter({ hasText: "Edited on the linked task" })).toBeVisible({ timeout: 20000 });

    await openUpdates(page);
    await expect(page.getByTestId("comment").filter({ hasText: "Edited on the linked task" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("comment").filter({ hasText: "Shared across both boards" })).toHaveCount(0);
  });

  test("an update posted with the toggle off stays on this task only", async ({ page }) => {
    await openUpdates(page);
    await page.getByTestId("comment-also-linked").click();
    await expect(page.getByTestId("comment-also-linked")).toHaveAttribute("aria-checked", "false");
    await composer(page).fill("Only here");
    await page.getByTestId("comment-submit").click();
    const posted = page.getByTestId("comment").filter({ hasText: "Only here" }).first();
    await expect(posted).toBeVisible({ timeout: 20000 });
    await expect(posted.getByTestId("comment-linked-badge")).toHaveCount(0);

    await page.goto("/workspace/rmit/boards/open-day-2026");
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20000 });
    await row(page, ITEM).getByRole("button", { name: `Open ${ITEM}` }).click();
    await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
    await expect(page.getByText("Only here")).toHaveCount(0);
  });
});
