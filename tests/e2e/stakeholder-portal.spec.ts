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

/** Fills the portal's booking form and sends it. */
async function bookThroughPortal(page: Page, title: string, brief: string): Promise<void> {
  await page.getByTestId("portal-book-button").click();
  const form = page.getByTestId("portal-book");
  await expect(form).toBeVisible();
  await form.getByLabel(/Your name/).fill("Priya Nair");
  await form.getByLabel(/Email/).fill("priya@rmit.edu.vn");
  await form.getByLabel(/What is it/i).first().fill(title);
  await form.getByLabel(/Tell us more/i).first().fill(brief);
  await form.getByRole("button", { name: /Book this task/i }).click();
  // The receipt stays on screen with its reference and somewhere to go.
  await expect(page.getByTestId("booking-receipt")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("portal-view-request")).toBeVisible();
}

/**
 * A department's card on the management screen, unfolded.
 *
 * The cards are collapsed by default — a workspace with a dozen departments is
 * otherwise a page of settings — so anything but the name, the state and the
 * two buttons most used has to be opened first.
 */
async function departmentCard(page: Page, department: string) {
  await page.goto("/workspace/rmit/book");
  await expect(page.getByRole("heading", { name: "Stakeholder Portal" })).toBeVisible();
  const card = page.locator(`[data-testid=portal-department][data-department="${department}"]`);
  await expect(card).toBeVisible();
  const expander = card.getByTestId("portal-department-expand");
  if ((await expander.getAttribute("aria-expanded")) !== "true") await expander.click();
  return card;
}

/** Opens a department's portal from the management screen and returns its link. */
async function openPortal(page: Page, department: string): Promise<string> {
  const card = await departmentCard(page, department);
  if ((await card.getByTestId("portal-state").innerText()) !== "Open") {
    await card.getByTestId("portal-toggle").click();
  }
  await expect(card.getByTestId("portal-state")).toHaveText("Open");
  const link = await card.getByTestId("portal-link").innerText();
  expect(link).toContain("/portal/");
  return new URL(link).pathname;
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

  test("gives each department its own link, closed until somebody opens it", async ({ page }) => {
    await page.goto("/workspace/rmit/book");
    const cards = page.getByTestId("portal-department");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(1);
    // Nothing is published by existing: every portal starts shut.
    for (const state of await page.getByTestId("portal-state").allInnerTexts()) {
      expect(state).toBe("Closed");
    }
  });

  test("a stakeholder books, sees the receipt, and finds the request waiting", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");

    await page.goto(portalPath);
    await expect(page.getByTestId("portal-department-name")).toContainText("Comm.");
    await expect(page.getByTestId("portal-totals")).toContainText("0");

    await bookThroughPortal(page, "Open Day wayfinding posters", "Six A1 posters for Brunswick, print ready.");

    // And the request is on the board straight away, which is what "submitted"
    // means. The board is the workspace's own, so the row is an ordinary one.
    await page.getByTestId("portal-book").getByTestId("portal-back-to-tasks").click();
    await expect(page.getByTestId("portal-board")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Day wayfinding posters", exact: true })).toBeVisible();
    await expect(page.getByTestId("portal-totals")).toContainText("1");
  });

  test("shows a department only its own work", async ({ page }) => {
    const commPath = await openPortal(page, "Comm.");
    const eventPath = await openPortal(page, "Event");

    // Book into Comm.
    await page.goto(commPath);
    await bookThroughPortal(page, "Comm only request", "Should never appear under Event.");

    // Event's portal knows nothing about it.
    await page.goto(eventPath);
    await expect(page.getByTestId("portal-department-name")).toContainText("Event");
    await expect(page.getByTestId("portal-totals")).toContainText("0");
    await expect(page.getByRole("button", { name: "Comm only request", exact: true })).toHaveCount(0);
  });

  test("stops opening the moment the link is replaced", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await expect(page.getByTestId("portal-department-name")).toBeVisible();

    const card = await departmentCard(page, "Comm.");
    await card.getByTestId("portal-regenerate").click();
    await page.getByRole("alertdialog").getByRole("button", { name: /issue new link/i }).click();
    await expect(card.getByTestId("portal-link")).not.toHaveText(new RegExp(portalPath.split("/").pop()!));

    // The old address is dead, and says so without naming the department.
    await page.goto(portalPath);
    await expect(page.getByRole("heading", { name: "This link does not open a portal" })).toBeVisible();
    await expect(page.getByTestId("portal-department-name")).toHaveCount(0);
  });

  test("closing a portal shuts both reading and booking", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    const card = await departmentCard(page, "Comm.");
    await card.getByTestId("portal-toggle").click();
    await expect(card.getByTestId("portal-state")).toHaveText("Closed");

    await page.goto(portalPath);
    await expect(page.getByRole("heading", { name: "This link does not open a portal" })).toBeVisible();
  });

  test("asks for a password on the way in, and refuses a wrong one", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    const card = await departmentCard(page, "Comm.");
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
    await expect(page.getByTestId("portal-department-name")).toContainText("Comm.");
  });

  test("carries the team's settings through to the link", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Settings ride along", "One request, to see the board with.");

    const card = await departmentCard(page, "Comm.");
    await card.getByTestId("portal-description").fill("Everything the Marketing team is making for you.");
    await card.getByTestId("portal-description-save").click();
    // Hiding a column is about clutter on the page, not about access.
    await card.getByTestId("portal-column-priority").click();
    await expect(card.getByTestId("portal-column-priority")).toHaveAttribute("aria-checked", "false");
    // And a link can be set to reading only.
    await card.getByTestId("portal-allow-booking").click();
    await expect(card.getByTestId("portal-allow-booking")).toHaveAttribute("aria-checked", "false");

    await page.goto(portalPath);
    await expect(page.getByText("Everything the Marketing team is making for you.")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Priority" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(page.getByTestId("portal-book-button")).toHaveCount(0);
  });

  test("keeps its theme to itself", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
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
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Deep link me", "A request to open by URL.");

    await page.getByTestId("portal-view-request").click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await expect(page).toHaveURL(/[?&]task=/);

    await page.reload();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);
  });

  test("gives the department the board's own views", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Something to look at", "One request, seven ways of looking at it.");
    await page.getByTestId("portal-book").getByTestId("portal-back-to-tasks").click();

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
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Read only please", "Nothing here should be editable by a visitor.");
    await page.getByTestId("portal-view-request").click();
    await expect(page.getByTestId("item-panel")).toBeVisible();

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
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Brief only", "The words the requester actually typed.");
    await page.getByTestId("portal-view-request").click();

    const panel = page.getByTestId("item-panel");
    await expect(panel).toContainText("The words the requester actually typed.");
    // The booking writer appends contact details to items.description; that
    // field must never reach a portal.
    await expect(panel).not.toContainText("priya@rmit.edu.vn");
    await expect(panel).not.toContainText("Request details");
  });
});
