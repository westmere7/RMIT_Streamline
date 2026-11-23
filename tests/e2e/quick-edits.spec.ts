import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * Quick successive edits (v0.161): a board checkbox, asset lines and checklist
 * ticks clicked in bursts — some faster than the save delay, some slower, a
 * second burst while the first is still saving. The screen must never step
 * back to an older state, and after a reload it must show exactly what was
 * last clicked.
 */
const TASK = "/workspace/rmit/boards/dooh-production?item=000000f1-0000-4000-8000-000000000232";
const LINES = ["Portrait loop", "Landscape loop", "Static slide", "Large format"];

async function openTask(page: Page) {
  await page.goto(TASK);
  await expect(page.getByTestId("item-panel")).toBeVisible({ timeout: 20_000 });
}

/** Waits until nothing is left to save (the leave-page guard is off). */
async function allSaved(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const event = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      { timeout: 20_000 },
    )
    .toBe(false);
}

const panel = (page: Page) => page.getByTestId("item-panel");
const tab = (page: Page, name: RegExp) => panel(page).getByRole("tab", { name });
const line = (page: Page, name: string) => panel(page).getByRole("checkbox", { name: new RegExp(`^Mark ${name} as (not )?done$`) });
const lineDone = async (locator: Locator) => (await locator.getAttribute("aria-label"))!.endsWith("not done");

/**
 * Clicks `targets` in turn, `gap` ms apart, while sampling the screen; returns
 * every state seen after the last click. The page does the clicking and the
 * sampling itself, so the timings are the page's, not the test runner's.
 */
async function burst(page: Page, kind: "line" | "check", names: string[], clicks: number[], gap: number, settle: number) {
  return page.evaluate(
    async ({ kind, names, clicks, gap, settle }) => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const box = (name: string): HTMLElement | undefined =>
        kind === "line"
          ? ([...document.querySelectorAll("[aria-label]")].find((el) => new RegExp(`^Mark ${name} as (not )?done$`).test(el.getAttribute("aria-label") ?? "")) as HTMLElement | undefined)
          : ([...document.querySelectorAll('[data-testid="checklist-item"]')].find((el) => el.textContent?.trim() === name)?.querySelector('[role="checkbox"]') as HTMLElement | undefined);
      const on = (name: string) => {
        const el = box(name);
        return kind === "line" ? !!el?.getAttribute("aria-label")?.endsWith("not done") : el?.getAttribute("aria-checked") === "true";
      };
      const state = () => names.map((n) => (on(n) ? "1" : "0")).join("");
      const seen: Array<[number, string]> = [];
      let stop = false;
      void (async () => {
        while (!stop) {
          seen.push([Date.now(), state()]);
          await wait(25);
        }
      })();
      for (const index of clicks) {
        box(names[index]!)!.click();
        await wait(gap);
      }
      const last = Date.now();
      await wait(settle);
      stop = true;
      return { final: state(), after: [...new Set(seen.filter(([t]) => t > last + 60).map(([, s]) => s))] };
    },
    { kind, names, clicks, gap, settle },
  );
}

/** What `clicks` leave behind, starting from `start` ("0101"). */
const expected = (start: string, clicks: number[]) => {
  const bits = start.split("");
  for (const i of clicks) bits[i] = bits[i] === "1" ? "0" : "1";
  return bits.join("");
};

test.describe("quick successive edits", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Admin");
  });

  test("asset lines ticked in overlapping bursts end exactly as last clicked, on screen and after a reload", async ({ page }) => {
    await openTask(page);
    await tab(page, /Assets/).click();
    await expect(line(page, LINES[0]!)).toBeVisible();
    let start = "";
    for (const name of LINES) start += (await lineDone(line(page, name))) ? "1" : "0";

    const bursts: Array<[number[], number, number]> = [
      [[0, 1, 2, 3, 1, 0], 70, 1500],
      [[3, 2, 2, 1], 40, 100],
      [[0, 3, 1, 2, 0], 120, 2500],
    ];
    let want = start;
    for (const [clicks, gap, settle] of bursts) {
      want = expected(want, clicks);
      const { final, after } = await burst(page, "line", LINES, clicks, gap, settle);
      expect(final).toBe(want);
      expect(after).toEqual([want]);
    }
    await allSaved(page);
    await openTask(page);
    await tab(page, /Assets/).click();
    await expect(line(page, LINES[0]!)).toBeVisible();
    let saved = "";
    for (const name of LINES) saved += (await lineDone(line(page, name))) ? "1" : "0";
    expect(saved).toBe(want);
  });

  test("checklist ticks in quick bursts keep every box as last clicked", async ({ page }) => {
    await openTask(page);
    await tab(page, /Updates/).click();
    await page.getByTestId("comment-input").click();
    await page.getByRole("button", { name: "Checklist" }).click();
    for (const [i, name] of ["Box one", "Box two", "Box three"].entries()) {
      if (i > 0) await page.keyboard.press("Enter");
      await page.keyboard.type(name);
    }
    await page.keyboard.press("Control+Enter");
    const names = ["Box one", "Box two", "Box three"];
    await expect(page.getByTestId("checklist-item")).toHaveCount(3);

    let want = "000";
    for (const [clicks, gap, settle] of [
      [[0, 1, 2, 1, 0, 0, 2], 80, 1500],
      [[1, 1, 1, 2, 0], 40, 100],
      [[0, 2, 1], 150, 2500],
    ] as Array<[number[], number, number]>) {
      want = expected(want, clicks);
      const { final, after } = await burst(page, "check", names, clicks, gap, settle);
      expect(final).toBe(want);
      expect(after).toEqual([want]);
    }
    await allSaved(page);
    await openTask(page);
    await tab(page, /Updates/).click();
    await expect(page.getByTestId("checklist-item")).toHaveCount(3);
    const saved = await page.getByTestId("checklist-item").evaluateAll((items) => items.map((el) => (el.querySelector('[role="checkbox"]')!.getAttribute("aria-checked") === "true" ? "1" : "0")).join(""));
    expect(saved).toBe(want);
  });

  test("a board checkbox flicked on and off at every speed keeps the last value", async ({ page }) => {
    await openTask(page);
    const cell = panel(page).getByLabel("Specs confirmed for Colour calibration test card");
    await expect(cell).toBeVisible();
    const result = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const button = () => {
        const el = document.querySelector('[aria-label="Specs confirmed for Colour calibration test card"]') as HTMLElement;
        return (el.matches("button") ? el : el.querySelector("button")) as HTMLElement;
      };
      const on = () => button().getAttribute("aria-checked") === "true";
      let want = on();
      const seen: Array<[number, boolean]> = [];
      let stop = false;
      void (async () => {
        while (!stop) {
          seen.push([Date.now(), on()]);
          await wait(25);
        }
      })();
      for (const gap of [100, 100, 500, 100, 450, 50, 700, 60, 60, 30, 30, 30, 420, 380, 410]) {
        button().click();
        want = !want;
        await wait(gap);
      }
      const last = Date.now();
      await wait(2000);
      stop = true;
      return { want, final: on(), wrong: seen.filter(([t, v]) => t > last + 60 && v !== want).length };
    });
    expect(result.final).toBe(result.want);
    expect(result.wrong).toBe(0);
    await allSaved(page);
    await openTask(page);
    await expect(cell).toBeVisible();
    const saved = await cell.evaluate((el) => ((el.matches("button") ? el : el.querySelector("button"))!.getAttribute("aria-checked") === "true"));
    expect(saved).toBe(result.want);
  });
});
