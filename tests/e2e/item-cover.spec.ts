import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs, switchView } from "./helpers";

const ITEM = "RMITinerary Explorer";

/** A real PNG drawn by the browser itself, so decoding it is never in doubt. */
async function pngFile(page: Page, name: string) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e61e2a";
    context.fillRect(0, 0, 64, 40);
    return canvas.toDataURL("image/png");
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1]!, "base64") };
}

async function openItem(page: Page, item = ITEM) {
  await row(page, item).getByRole("button", { name: `Open ${item}` }).click();
  await expect(page.getByTestId("item-panel")).toBeVisible();
}

test.describe("item covers", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
    await openBoard(page);
  });

  test("a cover can be added, shows on the kanban card, and can be replaced and removed", async ({ page }) => {
    await openItem(page);
    const panel = page.getByTestId("item-panel");
    await expect(panel.getByTestId("item-cover")).toHaveCount(0);

    await panel.getByTestId("cover-input").setInputFiles(await pngFile(page, "cover.png"));
    await expect(panel.getByTestId("item-cover")).toBeVisible({ timeout: 15000 });
    const src = await panel.getByTestId("item-cover").locator("img").getAttribute("src");
    expect(src).toMatch(/^data:image\/webp/);

    // The card carries it too; the table does not.
    await expect(row(page, ITEM).locator("img")).toHaveCount(0);
    await switchView(page, "kanban");
    const card = page.getByTestId("kanban-card").filter({ hasText: ITEM });
    await expect(card.getByTestId("card-cover")).toBeVisible({ timeout: 15000 });
    await switchView(page, "table");

    // Replace keeps a cover; remove clears it, and the change survives a reload.
    await openItem(page);
    await panel.getByTestId("item-cover").hover();
    await panel.getByTestId("cover-input").setInputFiles(await pngFile(page, "cover2.png"));
    await expect(panel.getByTestId("item-cover")).toBeVisible();
    await panel.getByTestId("item-cover").hover();
    await panel.getByTestId("cover-remove").click();
    await expect(panel.getByTestId("item-cover")).toHaveCount(0, { timeout: 15000 });
    await expect(panel.getByTestId("cover-add")).toBeVisible();

    await page.reload();
    await openItem(page);
    await expect(page.getByTestId("item-panel").getByTestId("item-cover")).toHaveCount(0);
  });

  test("files that are not images or are over 3MB are refused with a message", async ({ page }) => {
    await openItem(page);
    const panel = page.getByTestId("item-panel");
    await panel.getByTestId("cover-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByText("That file is not an image.")).toBeVisible();
    await panel.getByTestId("cover-input").setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
    await expect(page.getByText("Cover images must be under 3MB.")).toBeVisible();
    await expect(panel.getByTestId("item-cover")).toHaveCount(0);
  });
});
