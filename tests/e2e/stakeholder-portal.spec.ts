import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The portal end to end, on the local provider.
 *
 * The same service, gate and projection the Supabase path uses — only the
 * transport differs, and it is absent here, so these drive the real thing
 * rather than a stand-in. What cannot be proved this way is row level security
 * and the service-role route handlers, which need a Supabase environment; that
 * limitation is recorded in the portal's documentation.
 */

/**
 * Walks the portal's four-step booking wizard and sends it.
 *
 * The wizard does not open at all until a stakeholder is selected: one link
 * serves all of them and a request has to be raised for somebody. The Design
 * service is picked because the built-in form gives it three required
 * questions, which is what makes this exercise the gating between steps.
 */
async function bookThroughPortal(page: Page, title: string, brief: string): Promise<Page> {
  // The form opens in a tab of its own; the board stays put behind it.
  const [form] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("portal-book-button").click()]);
  await expect(form.getByTestId("portal-book")).toBeVisible({ timeout: 20000 });
  // Signed in, the account answers the name and email; booking for a stakeholder brings the boxes back.
  const someoneElse = form.getByTestId("booking-not-you");
  if (await someoneElse.isVisible().catch(() => false)) await someoneElse.click();
  await form.getByTestId("booking-name").fill("Priya Nair");
  await form.getByTestId("booking-email").fill("priya@rmit.edu.vn");
  await form.getByTestId("booking-title").fill(title);
  await form.getByTestId("booking-service-design").click();
  await form.getByTestId("booking-next").click();

  await expect(form.getByTestId("booking-step-brief")).toBeVisible();
  await form.getByTestId("booking-answer-design-what").fill(brief);
  await form.getByTestId("booking-answer-design-specs").fill("A1 portrait for print.");
  await form.getByTestId("booking-answer-design-copy-yes-final-and-approved").click();
  await form.getByTestId("booking-next").click();

  await expect(form.getByTestId("booking-step-assets")).toBeVisible();
  await form.getByTestId("booking-skip-assets").click();
  await expect(form.getByTestId("booking-step-review")).toBeVisible();
  await form.getByTestId("booking-submit").click();
  // The ticket stays on screen with its reference and somewhere to go.
  await expect(form.getByTestId("booking-receipt")).toBeVisible({ timeout: 20000 });
  await expect(form.getByTestId("portal-view-request")).toBeVisible();
  return form;
}

/** Done with the booking tab: close it and let the board re-read. */
async function backToTasks(page: Page, form: Page): Promise<void> {
  await form.getByTestId("portal-back-to-tasks").click();
  await expect(form.getByTestId("portal-board")).toBeVisible({ timeout: 20000 });
  await form.close();
  await page.reload();
  await expect(page.getByTestId("portal-board")).toBeVisible({ timeout: 20000 });
}

/** The workspace's one portal, on the management screen. */
async function portalCard(page: Page) {
  await page.goto("/workspace/rmit/book");
  await expect(page.getByRole("heading", { name: "Stakeholder Portal" })).toBeVisible();
  const card = page.getByTestId("portal-card");
  await expect(card).toBeVisible();
  // The settings fold away under the links; every test here reaches for one of them.
  const settings = card.getByTestId("portal-settings-toggle");
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await expect(card.getByTestId("portal-settings")).toBeVisible();
  return card;
}

/** Opens the portal from the management screen and returns its link. */
async function openPortal(page: Page): Promise<string> {
  const card = await portalCard(page);
  if ((await card.getByTestId("portal-state").innerText()) !== "Open") {
    await card.getByTestId("portal-toggle").click();
  }
  await expect(card.getByTestId("portal-state")).toHaveText("Open");
  const link = await card.getByTestId("portal-link").innerText();
  expect(link).toContain("/portal/");
  return new URL(link).pathname;
}

/** Points the portal at one stakeholder, the way the selector does. */
async function showOnly(page: Page, stakeholder: string): Promise<void> {
  await page.getByTestId("portal-stakeholder-picker").click();
  await page.getByRole("menuitem", { name: new RegExp(`^${stakeholder}`) }).click();
  await expect(page.getByTestId("portal-stakeholder-name")).toContainText(stakeholder);
}

test.describe("the stakeholder portal", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("renames the destination without moving it, and keeps internal booking", async ({ page }) => {
    await page.goto("/workspace/rmit");
    // The sidebar says the new name and still points at the old URL.
    const nav = page.getByTestId("sidebar-book-task");
    await expect(nav).toContainText("Stakeholder Portal");
    await expect(nav).toHaveAttribute("href", "/workspace/rmit/book");

    await nav.click();
    await expect(page).toHaveURL(/\/workspace\/rmit\/book$/);
    await page.getByTestId("portal-tab-book").click();
    await expect(page.getByTestId("book-task-card")).toBeVisible();
  });

  test("gives the team one link, closed until somebody opens it, and names who it shows", async ({ page }) => {
    await page.goto("/workspace/rmit/book");
    await expect(page.getByTestId("portal-card")).toBeVisible();
    // One portal, not one per stakeholder.
    expect(await page.getByTestId("portal-card").count()).toBe(1);
    // Nothing is published by existing: the portal starts shut.
    await expect(page.getByTestId("portal-state")).toHaveText("Closed");
    // And the stakeholders it carries are listed, for reference only.
    const rows = page.getByTestId("portal-stakeholder-row");
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test("a stakeholder books, sees the receipt, and finds the request waiting", async ({ page }) => {
    const portalPath = await openPortal(page);

    await page.goto(portalPath);
    await showOnly(page, "Comm.");
    await expect(page.getByTestId("portal-totals")).toContainText("0");

    const form = await bookThroughPortal(page, "Open Day wayfinding posters", "Six A1 posters for Brunswick, print ready.");

    // And the request is on the board straight away, which is what "submitted"
    // means. The board is the workspace's own, so the row is an ordinary one.
    await backToTasks(page, form);
    await expect(page.getByRole("button", { name: "Open Day wayfinding posters", exact: true })).toBeVisible();
    await expect(page.getByTestId("portal-totals")).toContainText("1");
  });

  test("shows one stakeholder only their own work, and everybody's together", async ({ page }) => {
    const portalPath = await openPortal(page);

    await page.goto(portalPath);
    await showOnly(page, "Comm.");
    await backToTasks(page, await bookThroughPortal(page, "Comm only request", "Should never appear under Event."));

    // Switching the selector is what separates them now, not a second link.
    await showOnly(page, "Event");
    await expect(page.getByTestId("portal-totals")).toContainText("0");
    await expect(page.getByRole("button", { name: "Comm only request", exact: true })).toHaveCount(0);

    // And with nobody selected the same link shows both, each row saying who it
    // is for.
    await page.getByTestId("portal-stakeholder-picker").click();
    await page.getByTestId("portal-stakeholder-all").click();
    await expect(page.getByRole("button", { name: "Comm only request", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "For" })).toBeVisible();
  });

  test("opens on the last three months, and offers the windows either side of it", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);

    // Three months unless somebody says otherwise: the whole archive on the
    // first read would be the slowest page in the product.
    await expect(page.getByTestId("portal-range-picker")).toHaveText(/Last 3 months/);
    await page.getByTestId("portal-range-picker").click();
    await expect(page.getByTestId("portal-range-1m")).toBeVisible();
    await expect(page.getByTestId("portal-range-6m")).toBeVisible();

    // All time is offered, and says what it costs before it is chosen.
    const everything = page.getByTestId("portal-range-all");
    await expect(everything).toContainText(/Loads every request/i);
    await everything.click();
    // Chosen, it keeps saying so, because the cost is being paid.
    await expect(page.getByTestId("portal-all-time-warning")).toBeVisible();
    await expect(page).toHaveURL(/range=all/);
  });

  test("searches past the window it is showing", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    await showOnly(page, "Comm.");
    await backToTasks(page, await bookThroughPortal(page, "Findable by search", "A request to look for."));

    // A search is not a question about a date, so the window steps aside and
    // says that it has.
    await page.getByTestId("search-input").fill("Findable by search");
    await expect(page.getByTestId("portal-all-years")).toBeVisible();
    await expect(page.getByTestId("portal-range-picker")).toHaveText(/Searching everything/);
    await expect(page.getByRole("button", { name: "Findable by search", exact: true })).toBeVisible();
  });

  test("will not book for nobody", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);

    // Showing every department, there is none to raise the request for. The
    // form opens in its own tab either way; the department is one of step
    // one's questions, and step one will not let anybody past without it.
    const [form] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("portal-book-button").click()]);
    await expect(form.getByTestId("portal-book")).toBeVisible({ timeout: 20000 });
    await expect(form.getByTestId("booking-department")).toBeVisible();
    await expect(form.getByTestId("booking-department")).not.toHaveAttribute("data-department", /.+/);
    await form.getByTestId("booking-next").click();
    await expect(form.getByText(/school or department is required/i)).toBeVisible();
  });

  test("stops opening the moment the link is replaced", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    await expect(page.getByTestId("portal-stakeholder-name")).toBeVisible();

    const card = await portalCard(page);
    await card.getByTestId("portal-regenerate").click();
    await page.getByRole("alertdialog").getByRole("button", { name: /issue new link/i }).click();
    await expect(card.getByTestId("portal-link")).not.toHaveText(new RegExp(portalPath.split("/").pop()!));

    // The old address is dead, and says so without naming the department.
    await page.goto(portalPath);
    await expect(page.getByRole("heading", { name: "This link does not open a portal" })).toBeVisible();
    await expect(page.getByTestId("portal-stakeholder-name")).toHaveCount(0);
  });

  test("closing a portal shuts both reading and booking", async ({ page }) => {
    const portalPath = await openPortal(page);
    const card = await portalCard(page);
    await card.getByTestId("portal-toggle").click();
    await expect(card.getByTestId("portal-state")).toHaveText("Closed");

    await page.goto(portalPath);
    await expect(page.getByRole("heading", { name: "This link does not open a portal" })).toBeVisible();
  });

  test("asks for a password on the way in, and refuses a wrong one", async ({ page }) => {
    const portalPath = await openPortal(page);
    const card = await portalCard(page);
    await card.getByTestId("portal-password-toggle").click();
    await card.getByTestId("portal-password-input").fill("open sesame");
    await card.getByRole("button", { name: "Set password" }).click();
    // The badge is the evidence the write landed, not the form closing.
    await expect(card.getByText("Password", { exact: true })).toBeVisible();

    // The address is unchanged — a password is not a new link — but every grant
    // issued before it was set is dead, so the page asks again.
    const freshPath = new URL(await card.getByTestId("portal-link").innerText()).pathname;
    expect(freshPath).toBe(portalPath);
    await page.goto(freshPath);
    await expect(page.getByTestId("portal-password")).toBeVisible();

    await page.getByTestId("portal-password").fill("wrong");
    await page.getByRole("button", { name: "Open the portal" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    await page.getByTestId("portal-password").fill("open sesame");
    await page.getByRole("button", { name: "Open the portal" }).click();
    await expect(page.getByTestId("portal-stakeholder-name")).toBeVisible();
  });

  test("carries the team's settings through to the link", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    await bookThroughPortal(page, "Settings ride along", "One request, to see the board with.");

    const card = await portalCard(page);
    // Hiding a column is about clutter on the page, not about access.
    await card.getByTestId("portal-column-priority").click();
    await expect(card.getByTestId("portal-column-priority")).toHaveAttribute("aria-checked", "false");
    // And a link can be set to reading only.
    await card.getByTestId("portal-allow-booking").click();
    await expect(card.getByTestId("portal-allow-booking")).toHaveAttribute("aria-checked", "false");

    await page.goto(portalPath);
    await expect(page.getByRole("columnheader", { name: "Priority" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(page.getByTestId("portal-book-button")).toHaveCount(0);
  });

  test("keeps its theme to itself", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    await page.getByTestId("portal-theme-dark").click();
    await expect(page.locator("div.dark").first()).toBeVisible();

    // The application's own preference is untouched.
    const appTheme = await page.evaluate(() => window.localStorage.getItem("streamline.theme"));
    expect(appTheme).not.toBe("dark");
    await page.goto("/workspace/rmit");
    await expect(page.locator("html.dark")).toHaveCount(0);
  });

  test("deep-links a request, and Back leaves it", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    const form = await bookThroughPortal(page, "Deep link me", "A request to open by URL.");

    // "View request" takes the booking tab to the board with the request open.
    await form.getByTestId("portal-view-request").click();
    await expect(form.getByTestId("item-panel")).toBeVisible({ timeout: 20000 });
    await expect(form).toHaveURL(/[?&]task=/);

    await form.reload();
    await expect(form.getByTestId("item-panel")).toBeVisible();
    await form.goBack();
    await expect(form.getByTestId("item-panel")).toHaveCount(0);
  });

  test("gives the portal the board's own views", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    await backToTasks(page, await bookThroughPortal(page, "Something to look at", "One request, seven ways of looking at it."));

    // The search sits above the board rather than inside the toolbar, so it is
    // there on every view — which is the point of moving it.
    await expect(page.getByTestId("search-input")).toBeVisible();
    for (const view of ["kanban", "calendar", "chart"]) {
      await page.goto(`${portalPath}?view=${view}`);
      await expect(page.getByTestId("portal-board")).toBeVisible();
      await expect(page.getByTestId("search-input")).toBeVisible();
    }

    // And it filters, on a view that never had a search box of its own.
    await page.getByTestId("search-input").fill("Something to look at");
    await expect(page.getByTestId("search-input")).toHaveValue("Something to look at");
    await page.getByTestId("search-input").fill("nothing matches this");
    await expect(page.getByRole("button", { name: "Something to look at", exact: true })).toHaveCount(0);
  });

  test("offers a stakeholder nothing to write with", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    const form = await bookThroughPortal(page, "Read only please", "Nothing here should be editable by a visitor.");
    await form.getByTestId("portal-view-request").click();
    await expect(form.getByTestId("item-panel")).toBeVisible({ timeout: 20000 });
    await form.close();

    // A stakeholder holding nothing but the link. The data stays put; only the
    // session goes.
    await page.evaluate(() => {
      window.localStorage.removeItem("streamline.local-session");
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("sb-")) window.localStorage.removeItem(key);
      }
    });
    await page.goto(portalPath);
    await page.getByRole("button", { name: "Open Read only please" }).click();
    await expect(page.getByTestId("item-panel")).toBeVisible();

    // Nothing on the panel or the board writes: the repositories behind this
    // page refuse to, and the board context says the visitor cannot edit.
    await expect(page.getByTestId("item-panel").getByRole("textbox")).toHaveCount(0);
    await expect(page.getByTestId("link-item-button")).toHaveCount(0);
    await expect(page.getByTestId("portal-signin")).toBeVisible();
  });

  test("publishes the brief and never the internal description", async ({ page }) => {
    const portalPath = await openPortal(page);
    await page.goto(portalPath);
    const form = await bookThroughPortal(page, "Brief only", "The words the requester actually typed.");
    await form.getByTestId("portal-view-request").click();

    const panel = form.getByTestId("item-panel");
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel).toContainText("The words the requester actually typed.");
    // The booking writer appends contact details to items.description; that
    // field must never reach a portal.
    await expect(panel).not.toContainText("priya@rmit.edu.vn");
    await expect(panel).not.toContainText("Request details");
  });
});
