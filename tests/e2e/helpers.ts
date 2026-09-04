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

export async function openBoard(page: Page, url = BOARD_URL): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("board-table")).toBeVisible();
  await expect(page.getByTestId("item-row").first()).toBeVisible();
}

export function row(page: Page, name: string) {
  return page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
}
