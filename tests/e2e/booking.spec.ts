import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, row, signInAs } from "./helpers";

/**
 * Task booking: the built-in Admin team and Task Allocation board, the four-step
 * booking wizard on the public link, the form editor's draft-and-publish, and a
 * manager allocating a request to a team board.
 */

const TASK_ALLOCATION_URL = "/workspace/rmit/boards/task-allocation";

/**
 * The destination is the Stakeholder Portal now, at the same URL. An
 * administrator lands on the portal, so booking is one tab across; a member
 * without those controls still lands straight on the wizard.
 */
async function openBookPage(page: Page) {
  await page.getByTestId("sidebar-book-task").click();
  await expect(page).toHaveURL(/\/workspace\/rmit\/book$/);
  await openEditorTab(page);
  // A manager lands in the editor, because shaping the form is what the tab is
  // for them; the form itself is one click away.
  const done = page.getByTestId("booking-editor-close");
  if (await done.isVisible().catch(() => false)) await done.click();
  await expect(page.getByTestId("booking-wizard")).toBeVisible();
}

/** The Booking Form tab, which opens the editor for anyone who may shape it. */
async function openEditorTab(page: Page) {
  const bookTab = page.getByTestId("portal-tab-book");
  if (await bookTab.isVisible().catch(() => false)) await bookTab.click();
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

  test("a stakeholder walks the four steps and the request lands on Task Allocation", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    const link = page.getByTestId("booking-public-link");
    await expect(link).toHaveValue(/\/book\/rmit\/[a-z0-9]{24}$/, { timeout: 15_000 });
    const publicUrl = await link.inputValue();

    await page.goto(publicUrl);
    await expect(page.getByTestId("booking-card")).toBeVisible();

    // Step one: who is asking, and what kind of work it is. Nothing moves on
    // until the questions the form insists on are answered.
    await expect(page.getByTestId("booking-progress")).toHaveAccessibleName("Step 1 of 4: Details");
    await page.getByTestId("booking-next").click();
    await expect(page.getByText("Pick the kind of work this is")).toBeVisible();
    await page.getByTestId("booking-name").fill("Priya Nair");
    await page.getByTestId("booking-email").fill("priya.nair@rmit.edu.au");
    await page.getByTestId("booking-department").fill("School of Design");
    await page.getByTestId("booking-title").fill("Open Day wayfinding posters");
    await page.getByTestId("booking-priority").click();
    await page.getByTestId("booking-priority-high").click();
    await page.getByTestId("booking-due").fill("2026-12-01");
    await page.getByTestId("booking-service-design").click();
    await page.getByTestId("booking-sub-print").click();
    await expect(page.getByTestId("booking-routing")).toContainText("allocation queue");
    await page.getByTestId("booking-next").click();

    // Step two: the Design brief, which nobody who picked Production would see.
    await expect(page.getByTestId("booking-step-brief")).toBeVisible();
    await expect(page.getByTestId("booking-answer-prod-where")).toHaveCount(0);
    await page.getByTestId("booking-next").click();
    await expect(page.getByText("What are you asking for? is required")).toBeVisible();
    await page.getByTestId("booking-answer-design-what").fill("Six A1 posters for the Brunswick campus, brand compliant and print ready.");
    await page.getByTestId("booking-answer-design-specs").fill("A1 portrait for print, plus 1080x1350 for Instagram.");
    await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
    await page.getByTestId("booking-next").click();

    // Step three: the deliverables, optional, one line each.
    await expect(page.getByTestId("booking-step-assets")).toBeVisible();
    const assets = page.getByTestId("booking-assets");
    await assets.getByTestId("asset-add-input").fill("A1 poster");
    await assets.getByTestId("asset-add-submit").click();
    const poster = assets.locator('[data-testid="asset-line"][data-asset-name="A1 poster"]');
    await expect(poster.getByTestId("asset-quantity")).toBeVisible({ timeout: 15_000 });
    await poster.getByTestId("asset-quantity").fill("6");
    await poster.getByTestId("asset-notes").fill("594×841 mm, CMYK, print ready");
    await assets.getByTestId("asset-add-input").fill("Instagram tile");
    await assets.getByTestId("asset-add-input").press("Enter");
    await expect(assets.getByTestId("asset-line")).toHaveCount(2, { timeout: 15_000 });
    await page.getByTestId("booking-next").click();

    // Step four: the recap, and only then is anything sent.
    const review = page.getByTestId("booking-step-review");
    await expect(review).toBeVisible();
    await expect(review).toContainText("Design — Print");
    await expect(review).toContainText("Six A1 posters for the Brunswick campus");
    // The wizard settles the reference before it sends, and the ticket keeps it.
    const promised = (await page.getByTestId("booking-reference-preview").textContent())?.trim();
    expect(promised).toMatch(/^TA-[0-9A-F]{4}$/);
    await page.getByTestId("booking-submit").click();

    await expect(page.getByTestId("booking-receipt")).toBeVisible();
    await expect(page.getByTestId("booking-reference")).toHaveText(promised!);
    await expect(page.getByTestId("booking-receipt")).toContainText("allocation queue");
    await expect(page.getByTestId("booking-receipt")).toContainText("2 assets");
    // Whatever the team wrote back is on the ticket.
    await expect(page.getByTestId("booking-auto-reply")).toContainText("we have your request");

    // Back inside: the request is on Task Allocation with its answers in the columns.
    await page.goto(TASK_ALLOCATION_URL);
    const request = row(page, "Open Day wayfinding posters");
    await expect(request).toBeVisible();
    await expect(request).toContainText("Priya Nair");
    await expect(request).toContainText("Design");
    await expect(request).toContainText("High");
    // The asset lines are deliverables on the Assets tab, not subitems on the board.
    await expect(request.getByRole("button", { name: /subitems/i })).toHaveCount(0);
    await request.getByRole("button", { name: "Open Open Day wayfinding posters" }).click();
    const panel = page.getByTestId("item-panel");
    // The brief is the description, composed from the service and the answers.
    await expect(panel).toContainText("Service: Design");
    await expect(panel).toContainText("1. What are you asking for?");
    await panel.getByTestId("tab-assets").click();
    await expect(panel.getByTestId("asset-line")).toHaveCount(2, { timeout: 20_000 });
    await expect(panel.locator('[data-testid="asset-line"][data-asset-name="A1 poster"]')).toBeVisible();
    await expect(panel.locator('[data-testid="asset-line"][data-asset-name="Instagram tile"]')).toBeVisible();
  });

  test("the recap goes back to the step that owns each answer", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await page.getByTestId("booking-title").fill("Alumni magazine cover");
    await page.getByTestId("booking-service-design").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-answer-design-what").fill("Cover artwork for the spring alumni magazine.");
    await page.getByTestId("booking-answer-design-specs").fill("Portrait, with masthead space at the top.");
    await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-skip-assets").click();

    await expect(page.getByTestId("booking-step-review")).toBeVisible();
    await page.getByTestId("booking-recap-edit-the-request").click();
    await expect(page.getByTestId("booking-step-basics")).toBeVisible();
    // The bar walks back to the recap, because that step has already been reached.
    await page.getByTestId("booking-progress-review").click();
    await expect(page.getByTestId("booking-step-review")).toBeVisible();
  });

  test("a stakeholder needs the right key", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await expect(page.getByTestId("booking-public-link")).toHaveValue(/\/book\/rmit\//, { timeout: 15_000 });
    await page.goto("/book/rmit/nottherightkeynottherightkey");
    await expect(page.getByTestId("booking-unusable")).toBeVisible();
    await expect(page.getByTestId("booking-wizard")).toHaveCount(0);
  });

  test("a member books from inside the app and a manager allocates it to a team board", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await expect(page.getByTestId("booking-name")).toHaveValue("Danh Nguyen");
    await page.getByTestId("booking-title").fill("Alumni magazine cover");
    await page.getByTestId("booking-service-design").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-answer-design-what").fill("Cover artwork for the spring alumni magazine.");
    await page.getByTestId("booking-answer-design-specs").fill("Portrait, with masthead space at the top.");
    await page.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-skip-assets").click();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-receipt")).toBeVisible();
    await page.getByRole("link", { name: /Open on Task Allocation/ }).click();

    await expect(page.getByTestId("item-panel")).toBeVisible();
    await expect(page.getByTestId("allocation-section")).toBeVisible();
    await page.getByTestId("allocation-target").click();
    await page.getByTestId("allocation-board-rmitinerary-2026").click();
    await page.getByTestId("allocation-submit").click();
    // The request moves rather than being copied, so the panel showing it on
    // Task Allocation has nothing left to show and closes behind it.
    await expect(page.getByTestId("item-panel")).toHaveCount(0, { timeout: 15_000 });
    await expect(row(page, "Alumni magazine cover")).toHaveCount(0);

    // It is on the team board, and it kept its name.
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(row(page, "Alumni magazine cover")).toBeVisible();
  });

  test("an admin builds a service in a draft, and nothing changes until it is published", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    const publicUrl = await page.getByTestId("booking-public-link").inputValue();
    await page.getByTestId("booking-edit").click();
    await expect(page.getByTestId("booking-editor")).toBeVisible();

    // A service of the workspace's own, with a question of its own. Adding one
    // picks it, and its settings open under the cards.
    await page.getByTestId("editor-add-service").click();
    const panel = page.getByTestId("editor-service-panel-new-service");
    await expect(panel).toBeVisible();
    await panel.getByTestId("editor-service-name-new-service").fill("Web");
    await page.getByTestId("editor-service-subs-web-add").click();
    await page.getByLabel("Choice").last().fill("Landing page");
    await page.keyboard.press("Enter");
    await page.getByLabel("Choice").last().fill("Microsite");
    await page.getByTestId("editor-service-brief-web").click();
    await expect(page.getByTestId("brief-builder")).toBeVisible();
    // Step two shows the branches as tabs, and Web is the one open.
    await expect(page.getByTestId("editor-brief-service-web")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("brief-add-short").click();
    const block = page.locator('[data-testid^="editor-block-"]').first();
    await block.getByLabel("Question").fill("Which page is it?");
    await block.getByRole("switch").click();

    // Saved, but not served: the public link is still on the form it was on.
    await page.getByTestId("booking-editor-save-draft").click();
    await expect(page.getByTestId("booking-editor-draft-waiting")).toBeVisible({ timeout: 15_000 });
    await page.goto(publicUrl);
    await expect(page.getByTestId("booking-services")).toBeVisible();
    await expect(page.getByTestId("booking-service-web")).toHaveCount(0);

    // Published, and now everybody has it.
    await page.goto("/workspace/rmit/book");
    await expect(page.getByTestId("portal-tab-book")).toBeVisible({ timeout: 15_000 });
    await openEditorTab(page);
    await expect(page.getByTestId("booking-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("booking-editor-publish").click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByTestId("booking-wizard")).toBeVisible({ timeout: 15_000 });

    await page.goto(publicUrl);
    await page.getByTestId("booking-name").fill("Priya Nair");
    await page.getByTestId("booking-email").fill("priya.nair@rmit.edu.au");
    await page.getByTestId("booking-title").fill("Open Day landing page");
    await page.getByTestId("booking-service-web").click();
    await page.getByTestId("booking-sub-landing-page").click();
    await page.getByTestId("booking-next").click();

    // Its one question is required, and its answer becomes the brief.
    await page.getByTestId("booking-next").click();
    await expect(page.getByText("Which page is it? is required")).toBeVisible();
    await page.locator('[data-testid^="booking-answer-"]').first().fill("The Open Day hub page");
    await page.getByTestId("booking-next").click();
    await page.getByTestId("booking-skip-assets").click();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-receipt")).toBeVisible();

    await page.goto(TASK_ALLOCATION_URL);
    await expect(page.getByTestId("board-table")).toBeVisible();
    const request = row(page, "Open Day landing page");
    await expect(request).toContainText("Web");
    await request.getByRole("button", { name: "Open Open Day landing page" }).click();
    await expect(page.getByTestId("item-panel")).toContainText("The Open Day hub page");
  });

  test("an admin keeps forms as templates, with a word about what each is for", async ({ page }) => {
    await signInAs(page, "Danh");
    await openBookPage(page);
    await page.getByTestId("booking-edit").click();
    await page.getByTestId("booking-editor-templates").click();
    await page.getByTestId("template-save").click();
    await page.getByTestId("template-name").fill("Built-in copy");
    await page.getByTestId("template-description").fill("The form as it shipped.");
    await page.getByTestId("template-save-submit").click();
    await expect(page.getByTestId("template-save-dialog")).toHaveCount(0);

    // Change the form, then load the template back over it.
    await page.getByTestId("editor-basics-title").fill("Your request");
    await page.getByTestId("booking-editor-templates").click();
    await page.getByTestId("template-load").click();
    await expect(page.getByText("The form as it shipped.")).toBeVisible();
    await page.getByRole("button", { name: "Load", exact: true }).first().click();
    await expect(page.getByTestId("editor-basics-title")).toHaveValue("About you and your request");

    // And delete it again.
    await page.getByTestId("booking-editor-templates").click();
    await page.getByTestId("template-load").click();
    await page.getByRole("button", { name: "Delete template Built-in copy" }).click();
    await page.getByRole("button", { name: "Delete template", exact: true }).click();
    await expect(page.getByText("No templates saved yet.")).toBeVisible();
  });
});
