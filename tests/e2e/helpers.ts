import { expect, type Page } from "@playwright/test";

export const BOARD_URL = "/workspace/rmit/boards/rmitinerary-2026";

/** Wipes IndexedDB + localStorage so every test starts from the seed. */
export async function resetLocalData(page: Page): Promise<void> {
  await page.goto("/login");
  await page.evaluate(async () => {
    window.localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("rmit-streamline");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

export async function signInAs(page: Page, firstName: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(`login-${firstName.toLowerCase()}`).click();
  await expect(page).toHaveURL(/\/workspace\/rmit$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(firstName);
}

/**
 * Sign out and sign in as someone else. Tests that need the work attributed to
 * another person have to actually be them; "View as" only changes what is shown.
 */
export async function switchAccount(page: Page, firstName: string): Promise<void> {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  await signInAs(page, firstName);
}

export async function openBoard(page: Page, url = BOARD_URL): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("board-table")).toBeVisible();
  await expect(page.getByTestId("item-row").first()).toBeVisible();
}

/** Picks a view from the board bar's view switcher and waits for the menu to close. */
export async function switchView(page: Page, kind: "table" | "kanban" | "timeline" | "calendar" | "gantt" | "workload" | "chart"): Promise<void> {
  await page.getByTestId("view-switcher").click();
  await page.getByTestId(`view-${kind}`).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

export function row(page: Page, name: string) {
  return page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
}
