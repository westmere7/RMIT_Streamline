import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * Onboarding without email: an admin adds someone, gets a link, the person opens
 * it, sets a password and lands in the workspace as an active member.
 *
 * Local mode keeps everything in this browser context's IndexedDB, so the
 * invited person "opens the link" in the same context after the admin signs
 * out. That is also why the seeded pending members have fixed tokens.
 */
const ANH_TOKEN = "demo-invite-anh-pham-2026";

async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
}

async function memberRow(page: Page, name: string) {
  return page.locator('[data-testid="member-row"]', { hasText: name }).first();
}

test.describe("member onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
  });

  test("pending members are listed, cannot sign in, and are kept out of pickers", async ({ page }) => {
    // Not offered as an account and refused when typed.
    await page.goto("/login");
    await expect(page.getByTestId("login-danh")).toBeVisible();
    await expect(page.getByTestId("login-anh")).toHaveCount(0);
    await page.getByLabel(/email/i).fill("anh@rmit.local");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /onboarding/ })).toContainText(/not finished onboarding/i);

    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/members");
    await expect(page.getByTestId("members-summary")).toContainText(/3 pending onboarding/);
    const anh = await memberRow(page, "Anh Pham");
    await expect(anh.getByTestId("member-status")).toHaveText("Pending onboarding");
    await expect(anh.getByTestId("invite-link-button")).toBeVisible();

    // Not assignable: the owner picker on a board does not offer them.
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(page.getByTestId("item-row").first()).toBeVisible();
    await page.getByTestId("item-row").first().getByTestId("person-cell").click();
    const picker = page.getByPlaceholder("Search people…");
    await expect(picker).toBeVisible();
    await picker.fill("Anh");
    await expect(page.getByRole("option", { name: /Anh Pham/ })).toHaveCount(0);
    await picker.fill("Tuyet");
    await expect(page.getByRole("option", { name: /Tuyet Le/ })).toBeVisible();
  });

  test("an admin adds a member, gets a link, and the person onboards through it", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/members");
    await page.getByTestId("add-member").click();

    const dialog = page.getByTestId("invite-dialog");
    await dialog.getByLabel("Email").fill("Sam.Rivera@rmit.edu.au");
    await dialog.getByLabel("First name").fill("Sam");
    await dialog.getByLabel("Last name").fill("Rivera");
    await dialog.getByLabel("Job title").fill("Producer");
    await dialog.getByRole("checkbox").first().check();
    await page.getByTestId("invite-submit").click();

    // Step two shows the link once; it points at this app.
    await expect(dialog).toContainText("Sam Rivera has been added");
    const link = await page.getByTestId("invite-link").inputValue();
    expect(link).toMatch(/^http:\/\/localhost:\d+\/join\/[A-Za-z0-9_-]{40,}$/);
    await page.getByTestId("invite-done").click();

    // Listed as pending straight away, with the link available again from the row.
    const sam = await memberRow(page, "Sam Rivera");
    await expect(sam.getByTestId("member-status")).toHaveText("Pending onboarding");
    await expect(sam).toContainText("sam.rivera@rmit.edu.au");
    await sam.getByTestId("invite-link-button").click();
    await expect(page.getByTestId("invite-link-dialog").getByTestId("invite-link")).toHaveValue(link);
    await page.getByTestId("invite-link-dialog").getByRole("button", { name: "Done" }).click();

    // Reload: still pending, still there.
    await page.reload();
    await expect((await memberRow(page, "Sam Rivera")).getByTestId("member-status")).toHaveText("Pending onboarding");

    // The invited person opens the link.
    await signOut(page);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: /Welcome to RMIT Creative Team/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("onboarding-card")).toContainText("sam.rivera@rmit.edu.au");
    await expect(page.getByLabel("First name")).toHaveValue("Sam");
    await expect(page.getByLabel("Job title")).toHaveValue("Producer");

    // Validation: mismatched and short passwords are caught before anything is sent.
    await page.getByTestId("onboarding-password").fill("short");
    await page.getByTestId("onboarding-confirm").fill("short");
    await page.getByTestId("onboarding-submit").click();
    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    await page.getByTestId("onboarding-password").fill("correct horse battery");
    await page.getByTestId("onboarding-confirm").fill("different password");
    await page.getByTestId("onboarding-submit").click();
    await expect(page.getByText(/do not match/i)).toBeVisible();

    // Finish: tweak the name and title, add a photo, create the account.
    await page.getByLabel("First name").fill("Samuel");
    await page.getByLabel("Job title").fill("Senior Producer");
    await page.getByTestId("onboarding-avatar-input").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      // A 1x1 PNG is enough to exercise the resize and store path.
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"),
    });
    await page.getByTestId("onboarding-confirm").fill("correct horse battery");
    await page.getByTestId("onboarding-submit").click();

    // Signed in and inside the workspace as the new person.
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Samuel", { timeout: 10000 });

    // Their profile carries the details and the photo; the member list shows them active.
    await page.goto("/workspace/rmit/members");
    const row = await memberRow(page, "Samuel Rivera");
    await expect(row.getByTestId("member-status")).toHaveText("Active");
    await expect(row).toContainText("Senior Producer");
    await expect(row.locator("img")).toHaveCount(1);

    // The link is spent.
    await page.goto(link);
    await expect(page.getByTestId("onboarding-unusable")).toContainText(/already been used/i);

    // Signing out and back in works, and they now appear on the login screen.
    await page.goto("/workspace/rmit");
    await signOut(page);
    await expect(page.getByTestId("login-samuel")).toBeVisible();
    await page.getByLabel(/email/i).fill("sam.rivera@rmit.edu.au");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 10000 });
  });

  test("a seeded pending member onboards with the seeded link, and the admin sees them become active", async ({ page }) => {
    await page.goto(`/join/${ANH_TOKEN}`);
    await expect(page.getByRole("heading", { name: /Welcome to RMIT Creative Team/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Last name")).toHaveValue("Pham");
    await page.getByTestId("onboarding-password").fill("anh-secret-2026");
    await page.getByTestId("onboarding-confirm").fill("anh-secret-2026");
    await page.getByTestId("onboarding-submit").click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Anh");

    // Anh was seeded into the Vietnam Creative team, so that board is reachable.
    await expect(page.getByRole("link", { name: /Vietnam Creative/ }).first()).toBeVisible();

    await signOut(page);
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/members");
    await expect(page.getByTestId("members-summary")).toContainText(/2 pending onboarding/);
    await expect((await memberRow(page, "Anh Pham")).getByTestId("member-status")).toHaveText("Active");
  });

  test("links can be renewed and invitations cancelled", async ({ page }) => {
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/members");

    // Renew: the old seeded link stops working, the new one works.
    const lucas = await memberRow(page, "Lucas Reid");
    await lucas.getByTestId("invite-link-button").click();
    const linkDialog = page.getByTestId("invite-link-dialog");
    const before = await linkDialog.getByTestId("invite-link").inputValue();
    expect(before).toContain("demo-invite-lucas-reid-2026");
    await page.getByTestId("regenerate-invite-link").click();
    await expect(linkDialog.getByTestId("invite-link")).not.toHaveValue(before, { timeout: 10000 });
    const after = await linkDialog.getByTestId("invite-link").inputValue();
    await linkDialog.getByRole("button", { name: "Done" }).click();

    // Cancel Mai's invitation entirely.
    const mai = await memberRow(page, "Mai Tran");
    await mai.getByRole("button", { name: "Actions for Mai Tran" }).click();
    await page.getByTestId("cancel-invitation").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.locator('[data-testid="member-row"]', { hasText: "Mai Tran" })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByTestId("members-summary")).toContainText(/2 pending onboarding/);

    await signOut(page);
    await page.goto(before);
    await expect(page.getByTestId("onboarding-unusable")).toContainText(/replaced or cancelled/i);
    await page.goto(after);
    await expect(page.getByRole("heading", { name: /Welcome to RMIT Creative Team/ })).toBeVisible({ timeout: 10000 });
    await page.goto("/join/demo-invite-mai-tran-2026");
    await expect(page.getByTestId("onboarding-unusable")).toContainText(/not valid/i);
    await page.goto("/join/nonsense");
    await expect(page.getByTestId("onboarding-unusable")).toContainText(/not valid/i);
  });
});
