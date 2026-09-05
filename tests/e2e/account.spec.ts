import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

test.describe("signing in and out", () => {
  test("rejects an unknown email with a message and stays on login", async ({ page }) => {
    await resetLocalData(page);
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByRole("button", { name: /continue|sign in/i }).click();
    await expect(page.getByText(/no account|not found|unable/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in with a typed email", async ({ page }) => {
    await resetLocalData(page);
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("emily@rmit.local");
    await page.getByRole("button", { name: /continue|sign in/i }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 10000 });
  });

  test("session survives reload and deep links", async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await page.goto("/workspace/rmit/my-work");
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
  });

  test("protected routes redirect when signed out", async ({ page }) => {
    await resetLocalData(page);
    for (const path of ["/workspace/rmit", "/workspace/rmit/my-work", "/workspace/rmit/inbox", "/workspace/rmit/members", "/workspace/rmit/settings", "/workspace/rmit/trackers"]) {
      await page.goto(path);
      await expect(page, `expected ${path} to redirect to login`).toHaveURL(/\/login$/, { timeout: 10000 });
    }
  });

  test("signing out clears the session and the previous user's data", async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
    await page.goto("/workspace/rmit");
    await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
    // Back button must not restore the signed-in shell.
    await page.goBack();
    await expect(page.getByTestId("board-table")).toHaveCount(0);
  });

  test("switching user in the dev menu swaps the whole workspace view", async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /switch user/i }).click();
    await page.getByRole("menuitem", { name: /Emily Carter/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Emily", { timeout: 10000 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Emily");
  });

  test("an empty email cannot be submitted", async ({ page }) => {
    await resetLocalData(page);
    await page.goto("/login");
    const submit = page.getByRole("button", { name: /continue|sign in/i });
    await expect(submit).toBeDisabled();
  });
});
