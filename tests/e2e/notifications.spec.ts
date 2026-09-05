import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

const INBOX = "/workspace/rmit/inbox";

async function openInbox(page: Page) {
  await page.goto(INBOX);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("notification-row").first()).toBeVisible({ timeout: 20_000 });
}

async function openSettings(page: Page) {
  await openInbox(page);
  await page.getByTestId("notification-settings-button").click();
  await expect(page.getByTestId("notification-settings")).toBeVisible({ timeout: 20_000 });
}

async function switchTo(page: Page, name: string) {
  await page.goto("/workspace/rmit");
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /switch user/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]!, { timeout: 20_000 });
}

/** Posts an update mentioning someone, as whoever is signed in. */
async function mention(page: Page, itemName: string, displayName: string, text: string) {
  await openBoard(page);
  await row(page, itemName).getByRole("button", { name: `Open ${itemName}` }).click();
  await page.getByTestId("item-panel").getByRole("tab", { name: /updates/i }).click();
  await page.getByTestId("comment-input").fill(`@${displayName} ${text}`);
  await page.getByTestId("comment-submit").click();
  await expect(page.getByTestId("comment").first()).toContainText(text, { timeout: 20_000 });
  await page.getByTestId("close-panel").click();
}

const badges = (page: Page) => ({
  notifications: page.getByTestId("badge-notifications"),
  updates: page.getByTestId("badge-updates"),
});

test.describe("notifications and updates", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("the sidebar shows a red badge and a grey badge side by side", async ({ page }) => {
    await page.goto("/workspace/rmit");
    const { notifications, updates } = badges(page);
    await expect(notifications).toBeVisible({ timeout: 20_000 });
    await expect(updates).toBeVisible();
    // Seeded: three unread notifications and one unread update for Danh.
    await expect(notifications).toHaveText("3");
    await expect(updates).toHaveText("1");

    // The inbox agrees with the sidebar.
    await openInbox(page);
    await expect(page.getByTestId("inbox-tab-notifications")).toContainText("3");
    await expect(page.getByTestId("inbox-tab-updates")).toContainText("1");
    await expect(page.getByRole("heading", { name: "Inbox" }).locator("..")).toContainText("3 unread notifications · 1 unread update");
  });

  test("the tabs separate the loud ones from the quiet ones", async ({ page }) => {
    await openInbox(page);
    const rows = page.getByTestId("notification-row");
    const all = await rows.count();
    expect(all).toBeGreaterThan(2);

    await page.getByTestId("inbox-tab-notifications").click();
    await expect.poll(() => rows.count()).toBeLessThan(all);
    for (const delivery of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-delivery")))) {
      expect(delivery).toBe("NOTIFICATION");
    }

    await page.getByTestId("inbox-tab-updates").click();
    await expect(rows.first()).toBeVisible();
    for (const delivery of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-delivery")))) {
      expect(delivery).toBe("UPDATE");
    }
    // An update says so on the row.
    await expect(rows.first()).toContainText("Update");

    await page.getByTestId("inbox-tab-all").click();
    await expect.poll(() => rows.count()).toBe(all);
  });

  test("marking all read on one tab leaves the other badge alone", async ({ page }) => {
    await openInbox(page);
    await page.getByTestId("inbox-tab-updates").click();
    await page.getByTestId("mark-all-read").click();

    await expect(badges(page).updates).toHaveCount(0, { timeout: 20_000 });
    await expect(badges(page).notifications).toHaveText("3");

    // And it stayed that way in the database.
    await page.reload();
    await expect(badges(page).notifications).toHaveText("3", { timeout: 20_000 });
    await expect(badges(page).updates).toHaveCount(0);
  });

  test("unread only narrows the list without changing the counts", async ({ page }) => {
    await openInbox(page);
    const rows = page.getByTestId("notification-row");
    const all = await rows.count();
    await page.getByTestId("inbox-unread-only").click();
    await expect.poll(() => rows.count()).toBeLessThan(all);
    for (const unread of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-unread")))) {
      expect(unread).toBe("true");
    }
    await expect(badges(page).notifications).toHaveText("3");
  });

  test("a type set to Update arrives quietly instead of interrupting", async ({ page }) => {
    // Danh decides mentions should not interrupt.
    await openSettings(page);
    await page.getByTestId("delivery-MENTION-UPDATE").click();
    await expect(page.getByTestId("delivery-MENTION-UPDATE")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    // It survives a reload — this is stored, not a screen state.
    await openSettings(page);
    await expect(page.getByTestId("delivery-MENTION-UPDATE")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    // Tuyet mentions him.
    await switchTo(page, "Tuyet Le");
    await mention(page, "RMITinerary Explorer", "Danh Nguyen", "quiet mention please");

    // It is in his inbox as an update, not a notification.
    await switchTo(page, "Danh Nguyen");
    await openInbox(page);
    const arrived = page.getByTestId("notification-row").filter({ hasText: "quiet mention please" });
    await expect(arrived).toBeVisible({ timeout: 20_000 });
    await expect(arrived).toHaveAttribute("data-delivery", "UPDATE");
    await expect(badges(page).updates).toHaveText("2");
    await expect(badges(page).notifications).toHaveText("3");
  });

  test("a type set to Off is never written at all", async ({ page }) => {
    await openSettings(page);
    await page.getByTestId("delivery-MENTION-OFF").click();
    await expect(page.getByTestId("delivery-MENTION-OFF")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    const before = await page.getByTestId("notification-row").count();

    await switchTo(page, "Tuyet Le");
    await mention(page, "RMITinerary Explorer", "Danh Nguyen", "this should never arrive");

    await switchTo(page, "Danh Nguyen");
    await openInbox(page);
    await expect(page.getByText("this should never arrive")).toHaveCount(0);
    await expect(page.getByTestId("notification-row")).toHaveCount(before);
  });

  test("unsubscribing from a board silences it, and resubscribing brings it back", async ({ page }) => {
    // Unsubscribe from the board menu.
    await openBoard(page);
    await page.getByTestId("board-menu").click();
    await page.getByTestId("toggle-board-subscription").click();
    // Radix keeps a dismiss layer for a beat after a menu closes.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.getByTestId("board-menu").click();
    await expect(page.getByTestId("toggle-board-subscription")).toContainText("Resume notifications");
    await page.keyboard.press("Escape");

    // The settings screen shows the same thing.
    await openSettings(page);
    const boardRow = page.getByTestId("board-subscription").filter({ hasText: "RMITinerary 2026" });
    await expect(boardRow).toContainText("Unsubscribed");
    await page.keyboard.press("Escape");

    // Nothing from that board reaches him.
    await switchTo(page, "Tuyet Le");
    await mention(page, "RMITinerary Explorer", "Danh Nguyen", "muted board mention");
    await switchTo(page, "Danh Nguyen");
    await openInbox(page);
    await expect(page.getByText("muted board mention")).toHaveCount(0);

    // Resubscribe from the settings screen, and it does again.
    await openSettings(page);
    await page.getByTestId("board-subscription").filter({ hasText: "RMITinerary 2026" }).getByRole("switch").click();
    await expect(page.getByTestId("board-subscription").filter({ hasText: "RMITinerary 2026" })).toContainText(/^(?!.*Unsubscribed).*Subscribed/s);
    await page.keyboard.press("Escape");

    await switchTo(page, "Tuyet Le");
    await mention(page, "RMITinerary Explorer", "Danh Nguyen", "welcome back mention");
    await switchTo(page, "Danh Nguyen");
    await openInbox(page);
    await expect(page.getByTestId("notification-row").filter({ hasText: "welcome back mention" })).toBeVisible({ timeout: 20_000 });
  });

  test("muting a board does not take away access to it", async ({ page }) => {
    await openBoard(page);
    await page.getByTestId("board-menu").click();
    await page.getByTestId("toggle-board-subscription").click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("item-row").first()).toBeVisible();
    // And the menu remembers.
    await page.getByTestId("board-menu").click();
    await expect(page.getByTestId("toggle-board-subscription")).toContainText("Resume notifications");
  });
});

/**
 * Operating-system notifications. `window.Notification` is replaced before the
 * app loads so the test can see exactly what the browser was asked to show, and
 * the page reports itself as hidden — nobody needs a toast for a tab they are
 * looking at.
 */
test.describe("operating-system notifications", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    await page.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const raised: Array<{ title: string; body?: string; tag?: string }> = [];
      (window as unknown as { __osNotifications: typeof raised }).__osNotifications = raised;
      class FakeNotification {
        static permission = "granted";
        static requestPermission = async () => "granted";
        onclick: (() => void) | null = null;
        constructor(title: string, options?: NotificationOptions) {
          raised.push({ title, body: options?.body, tag: options?.tag });
        }
        close() {}
      }
      Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: FakeNotification });
    });
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  const raised = (page: Page) => page.evaluate(() => (window as unknown as { __osNotifications: Array<{ title: string; body?: string }> }).__osNotifications);

  test("the settings screen turns them on and can send a test", async ({ page }) => {
    await openSettings(page);
    const toggle = page.getByTestId("browser-notifications-toggle");
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });

    await page.getByTestId("send-test-notification").click();
    await expect.poll(async () => (await raised(page)).length).toBeGreaterThan(0);
    expect((await raised(page))[0]!.title).toContain("Streamline");

    // The choice is stored, not just on screen.
    await page.reload();
    await openSettings(page);
    await expect(page.getByTestId("browser-notifications-toggle")).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
  });

  test("an arriving notification becomes an OS notification, an update does not", async ({ page }) => {
    test.setTimeout(180_000);
    await openSettings(page);
    await page.getByTestId("browser-notifications-toggle").click();
    await expect(page.getByTestId("browser-notifications-toggle")).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
    await page.keyboard.press("Escape");

    // Nothing has been raised for the backlog that was already there.
    expect(await raised(page)).toEqual([]);

    // Two rows arrive while the app is open: one loud, one quiet.
    await page.evaluate(async () => {
      const open = indexedDB.open("rmit-streamline");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const me = "00000001-0000-4000-8000-000000000001";
      const now = new Date().toISOString();
      const rows = [
        { id: crypto.randomUUID(), userId: me, type: "MENTION", delivery: "NOTIFICATION", title: "Emily mentioned you in the incoming test", body: "please look", entityType: "ITEM", entityId: crypto.randomUUID(), boardId: null, actorId: null, readAt: null, createdAt: now },
        { id: crypto.randomUUID(), userId: me, type: "STATUS_CHANGED", delivery: "UPDATE", title: "A quiet update that must stay quiet", body: null, entityType: "ITEM", entityId: crypto.randomUUID(), boardId: null, actorId: null, readAt: null, createdAt: now },
      ];
      await new Promise<void>((resolve) => {
        const tx = db.transaction("notifications", "readwrite");
        for (const row of rows) tx.objectStore("notifications").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    });

    // The inbox polls; when it sees them, the loud one is announced.
    await expect
      .poll(async () => (await raised(page)).map((n) => n.title), { timeout: 90_000, intervals: [1000] })
      .toContain("Emily mentioned you in the incoming test");
    expect((await raised(page)).map((n) => n.title)).not.toContain("A quiet update that must stay quiet");

    // Both are in the inbox: quiet does not mean lost.
    await openInbox(page);
    await expect(page.getByTestId("notification-row").filter({ hasText: "A quiet update that must stay quiet" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("notification-row").filter({ hasText: "Emily mentioned you in the incoming test" })).toBeVisible();
  });

  test("nothing is raised while the switch is off", async ({ page }) => {
    test.setTimeout(180_000);
    await openInbox(page);
    await page.evaluate(async () => {
      const open = indexedDB.open("rmit-streamline");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const me = "00000001-0000-4000-8000-000000000001";
      await new Promise<void>((resolve) => {
        const tx = db.transaction("notifications", "readwrite");
        tx.objectStore("notifications").put({
          id: crypto.randomUUID(),
          userId: me,
          type: "MENTION",
          delivery: "NOTIFICATION",
          title: "Should not reach the operating system",
          body: null,
          entityType: "ITEM",
          entityId: crypto.randomUUID(),
          boardId: null,
          actorId: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    });

    // The poll brings it into the inbox — and the operating system is never asked.
    await expect(page.getByTestId("notification-row").filter({ hasText: "Should not reach the operating system" })).toBeVisible({ timeout: 90_000 });
    expect(await raised(page)).toEqual([]);
  });
});
