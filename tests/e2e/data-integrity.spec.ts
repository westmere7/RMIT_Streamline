import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const ITEM = "RMITinerary Explorer";

async function names(page: Page) {
  return page.getByTestId("item-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-item-name")!));
}

test.describe("data integrity under stress", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("ten status changes in a row leave the last one stored", async ({ page }) => {
    await openBoard(page);
    const cell = row(page, ITEM).getByTestId("status-cell");
    const wanted = ["Done", "Stuck", "Working On It", "Waiting", "Not Started", "Done", "Waiting", "Stuck", "Working On It", "Done"];
    for (const status of wanted) {
      await cell.click();
      await page.getByRole("option", { name: status, exact: true }).click();
      await expect(cell).toContainText(status);
    }
    await page.reload();
    await expect(row(page, ITEM).getByTestId("status-cell")).toContainText("Done", { timeout: 15000 });

    // Exactly one value row for that cell — no duplicates from the churn.
    const values = await page.evaluate(async () => {
      const open = indexedDB.open("rmit-streamline");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const all: unknown[] = await new Promise((resolve) => {
        const req = db.transaction("itemColumnValues").objectStore("itemColumnValues").getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => resolve([]);
      });
      db.close();
      const rows = all as Array<{ itemId: string; columnId: string }>;
      const seen = new Map<string, number>();
      for (const v of rows) seen.set(`${v.itemId}:${v.columnId}`, (seen.get(`${v.itemId}:${v.columnId}`) ?? 0) + 1);
      return [...seen.values()].filter((n) => n > 1).length;
    });
    expect(values, "no item/column pair may have two value rows").toBe(0);
  });

  test("create then delete immediately leaves nothing behind", async ({ page }) => {
    await openBoard(page);
    const before = (await names(page)).length;
    const input = page.getByTestId("add-item-Design");
    await input.fill("Ephemeral");
    await input.press("Enter");
    const created = row(page, "Ephemeral");
    await expect(created).toBeVisible({ timeout: 15000 });
    await created.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(created).toHaveCount(0, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("item-row")).toHaveCount(before, { timeout: 15000 });
    await expect(page.getByText("Ephemeral")).toHaveCount(0);
  });

  test("switching boards straight after an edit keeps the edit", async ({ page }) => {
    await openBoard(page);
    await row(page, ITEM).getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Stuck", exact: true }).click();
    // Client-side navigation, the way a person moves between boards.
    await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Open Day 2026" }).first().click();
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
    await openBoard(page);
    await expect(row(page, ITEM).getByTestId("status-cell")).toContainText("Stuck", { timeout: 15000 });
  });

  test("archived items stay out of the board, kanban, My Work and search", async ({ page }) => {
    await openBoard(page);
    await row(page, ITEM).getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(row(page, ITEM)).toHaveCount(0, { timeout: 15000 });

    await page.getByTestId("search-input").fill("Explorer");
    await expect(page.getByText(/no tasks match/i)).toBeVisible({ timeout: 15000 });
    await page.getByTestId("search-input").fill("");

    await page.getByTestId("view-switcher").click();
    await page.getByTestId("view-kanban").click();
    await expect(page.getByTestId("lane-Waiting")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ITEM)).toHaveCount(0);

    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("my-work-today")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ITEM)).toHaveCount(0);

    // The global search does not offer it either.
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Search boards, items, teams and people…").fill("RMITinerary Explorer");
    await page.waitForTimeout(800);
    await expect(page.getByRole("option", { name: /RMITinerary Explorer/ })).toHaveCount(0);
  });

  test("deleting a group with items removes exactly those items", async ({ page }) => {
    await openBoard(page);
    const production = page.getByTestId("group-Production");
    const doomed = await production.getByTestId("item-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-item-name")!));
    expect(doomed.length).toBeGreaterThan(2);
    const survivors = (await names(page)).filter((n) => !doomed.includes(n));

    await production.getByRole("heading").click({ button: "right" });
    await page.getByRole("menuitem", { name: /delete group/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(page.getByTestId("group-Production")).toHaveCount(0, { timeout: 15000 });

    await page.reload();
    await expect.poll(() => names(page), { timeout: 15000 }).toEqual(survivors);

    // Nothing points at the deleted rows any more.
    await page.goto("/workspace/rmit/my-work");
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 15000 });
    for (const name of doomed) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test("a second tab sees the first tab's change", async ({ page, context }) => {
    await openBoard(page);
    const other = await context.newPage();
    await other.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(other.getByTestId("board-table")).toBeVisible({ timeout: 20000 });

    await row(page, ITEM).getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Stuck", exact: true }).click();
    await expect(row(page, ITEM).getByTestId("status-cell")).toContainText("Stuck");

    await expect(row(other, ITEM).getByTestId("status-cell")).toContainText("Stuck", { timeout: 20000 });
    await other.close();
  });

  test("a corrupted local database is rebuilt instead of breaking the app", async ({ page }) => {
    await openBoard(page);
    // Simulate a half-written store: wipe the items table but leave everything else.
    await page.evaluate(async () => {
      const open = indexedDB.open("rmit-streamline");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("items", "readwrite");
        tx.objectStore("items").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    });
    await page.reload();
    // The board still renders, with no rows and no crash.
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("item-row")).toHaveCount(0);

    // And the developer reset puts the demo data back.
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: /reset demo data/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /reset/i }).click();
    await page.goto("/workspace/rmit/boards/rmitinerary-2026");
    await expect(page.getByTestId("item-row").first()).toBeVisible({ timeout: 20000 });
  });

  test("localStorage rubbish does not stop the app from starting", async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem("streamline-ui", "{not json at all");
    });
    await page.goto("/workspace/rmit");
    await expect(page.getByText("Recently visited")).toBeVisible({ timeout: 20000 });
  });
});
