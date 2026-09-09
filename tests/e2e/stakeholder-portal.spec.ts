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
  await page.getByTestId("portal-tab-book").click();
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

/** Opens a department's portal from the management screen and returns its link. */
async function openPortal(page: Page, department: string): Promise<string> {
  await page.goto("/workspace/rmit/book");
  await expect(page.getByRole("heading", { name: "Stakeholder Portal" })).toBeVisible();
  const card = page.locator(`[data-testid=portal-department][data-department="${department}"]`);
  await expect(card).toBeVisible();
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
    await expect(page.getByText("No requests yet")).toBeVisible();

    await bookThroughPortal(page, "Open Day wayfinding posters", "Six A1 posters for Brunswick, print ready.");

    // And the request is in the list straight away, which is what "submitted" means.
    await page.getByTestId("portal-back-to-tasks").click();
    const task = page.getByTestId("portal-task").filter({ hasText: "Open Day wayfinding posters" });
    await expect(task).toHaveCount(1);
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
    await expect(page.getByText("No requests yet")).toBeVisible();
    await expect(page.getByTestId("portal-task")).toHaveCount(0);
  });

  test("stops opening the moment the link is replaced", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await expect(page.getByTestId("portal-department-name")).toBeVisible();

    await page.goto("/workspace/rmit/book");
    const card = page.locator('[data-testid=portal-department][data-department="Comm."]');
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
    await page.goto("/workspace/rmit/book");
    const card = page.locator('[data-testid=portal-department][data-department="Comm."]');
    await card.getByTestId("portal-toggle").click();
    await expect(card.getByTestId("portal-state")).toHaveText("Closed");

    await page.goto(portalPath);
    await expect(page.getByRole("heading", { name: "This link does not open a portal" })).toBeVisible();
  });

  test("asks for a password on the way in, and refuses a wrong one", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto("/workspace/rmit/book");
    const card = page.locator('[data-testid=portal-department][data-department="Comm."]');
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
    await expect(page.getByTestId("portal-task-detail")).toBeVisible();
    await expect(page).toHaveURL(/[?&]task=/);

    await page.reload();
    await expect(page.getByTestId("portal-task-detail")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("portal-task-detail")).toHaveCount(0);
  });

  test("offers a stakeholder nothing to write with", async ({ page }) => {
    const portalPath = await openPortal(page, "Comm.");
    await page.goto(portalPath);
    await bookThroughPortal(page, "Read only please", "Nothing here should be editable by a visitor.");

    // Signed in, the same person may write: they own or edit the board.
    await page.getByTestId("portal-view-request").click();
    await expect(page.getByTestId("portal-comment")).toBeVisible();

    // Signed out — a stakeholder holding nothing but the link — the same page
    // offers no way to write at all. The data stays put; only the session goes.
    await page.evaluate(() => {
      window.localStorage.removeItem("streamline.local-session");
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("sb-")) window.localStorage.removeItem(key);
      }
    });
    await page.goto(portalPath);
    await page.getByTestId("portal-task").first().click();
    await expect(page.getByTestId("portal-task-detail")).toBeVisible();
    await expect(page.getByTestId("portal-comment")).toHaveCount(0);
    await expect(page.getByTestId("portal-task-detail").getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByTestId("portal-signin")).toBeVisible();
  });
});
