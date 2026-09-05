import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

const OUT = "C:/Users/nguye/AppData/Local/Temp/claude/E--WORK-OFFLINE-apps-RMIT-Streamline/e94ae357-f1d5-40ee-91b7-d7887197e9f2/scratchpad/shots";

test("inbox and settings", async ({ page }) => {
  test.setTimeout(120000);
  await resetLocalData(page);
  await signInAs(page, "Danh");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workspace/rmit/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/n-inbox.png` });

  await page.getByTestId("inbox-tab-updates").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/n-inbox-updates.png` });

  await page.getByTestId("inbox-tab-all").click();
  await page.getByTestId("notification-settings-button").click();
  await expect(page.getByTestId("notification-settings")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/n-settings.png` });
  await page.getByTestId("notification-settings").locator("div.overflow-y-auto").first().evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/n-settings-boards.png` });
});
