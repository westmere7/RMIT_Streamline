import { expect, test, type Page } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

/** Controls with no accessible name, inputs with no label, duplicate ids. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const name = (el: Element) => {
      const label = el.getAttribute("aria-label") ?? "";
      const text = (el.textContent ?? "").trim();
      const labelled = el.getAttribute("aria-labelledby");
      const byId = labelled ? (document.getElementById(labelled)?.textContent ?? "") : "";
      const title = el.getAttribute("title") ?? "";
      // A <label for> names a labelable element, which includes <button>.
      const id = el.getAttribute("id");
      const forLabel = id ? (document.querySelector(`label[for="${id}"]`)?.textContent ?? "") : "";
      return (label || text || byId || title || forLabel).trim();
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const namelessControls = [...document.querySelectorAll("button, a[href], [role=button]")]
      .filter(visible)
      .filter((el) => !name(el))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`);
    const unlabelledInputs = [...document.querySelectorAll("input, textarea, select")]
      .filter(visible)
      .filter((el) => {
        const id = el.getAttribute("id");
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
        return !hasLabel && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.getAttribute("placeholder");
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.getAttribute("id") ?? "?"}`);
    const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(visible).filter((img) => img.getAttribute("alt") === null).length;
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    return { namelessControls, unlabelledInputs, imagesWithoutAlt, duplicateIds };
  });
}

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("every visible control on the main pages has a name", async ({ page }) => {
    for (const route of ["/workspace/rmit", "/workspace/rmit/my-work", "/workspace/rmit/boards/rmitinerary-2026", "/workspace/rmit/members", "/workspace/rmit/inbox"]) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      const result = await audit(page);
      expect(result.namelessControls, `${route}: controls with no accessible name`).toEqual([]);
      expect(result.unlabelledInputs, `${route}: inputs with no label`).toEqual([]);
      expect(result.imagesWithoutAlt, `${route}: images with no alt`).toBe(0);
      expect(result.duplicateIds, `${route}: duplicate ids`).toEqual([]);
    }
  });

  test("the board can be driven from the keyboard", async ({ page }) => {
    await openBoard(page);
    // Tab from the top of the page and check focus is always visible somewhere sane.
    await page.keyboard.press("Tab");
    for (let i = 0; i < 25; i++) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
          focusable: el.tabIndex >= 0 || ["a", "button", "input", "textarea", "select"].includes(el.tagName.toLowerCase()),
          hidden: style.display === "none" || style.visibility === "hidden",
        };
      });
      expect(focused, `tab stop ${i} landed on nothing`).not.toBeNull();
      expect(focused!.hidden, `tab stop ${i} (${focused!.name}) is hidden`).toBe(false);
      await page.keyboard.press("Tab");
    }
  });

  test("a status cell opens, chooses and closes with the keyboard alone", async ({ page }) => {
    await openBoard(page);
    const cell = row(page, "RMITinerary Explorer").getByTestId("status-cell");
    await cell.focus();
    await expect(cell).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Done", exact: true })).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: "Done", exact: true })).toHaveCount(0);
    // Focus comes back to the cell, so the keyboard user has not lost their place.
    await expect(cell).toBeFocused();
  });

  test("dialogs trap focus, close on Escape and return focus", async ({ page }) => {
    await openBoard(page);
    await page.getByTestId("board-menu").click();
    await page.getByRole("menuitem", { name: /board settings/i }).click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    // Focus is inside the dialog.
    const inside = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      return !!dialogEl && dialogEl.contains(document.activeElement);
    });
    expect(inside, "focus should move into the dialog").toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId("board-menu")).toBeFocused();
  });

  test("the command palette is reachable and dismissable from the keyboard", async ({ page }) => {
    await page.goto("/workspace/rmit");
    await expect(page.getByText("Recently visited")).toBeVisible({ timeout: 20000 });
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Search/).first();
    await expect(input).toBeFocused({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
  });

  test("headings describe each page", async ({ page }) => {
    const expected: Array<[string, RegExp]> = [
      ["/workspace/rmit", /Good (morning|afternoon|evening)/],
      ["/workspace/rmit/my-work", /My Work/],
      ["/workspace/rmit/members", /Members/],
      ["/workspace/rmit/inbox", /Inbox/],
      ["/workspace/rmit/boards/rmitinerary-2026", /RMITinerary 2026/],
    ];
    for (const [route, heading] of expected) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first(), route).toContainText(heading, { timeout: 20000 });
    }
  });
});
