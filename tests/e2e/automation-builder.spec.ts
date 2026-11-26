import { expect, test } from "@playwright/test";
import { resetLocalData, signInAs } from "./helpers";

/**
 * The automation builder reads as the rule runs: When, Only if, Then, with the
 * rule spelled out above it and the fill-ins as chips rather than a line of braces.
 */
test.describe("automation builder", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("builds a rule step by step, reads it back in words, and saves it", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/workspace/rmit/automations");
    await page.getByRole("button", { name: /New automation/ }).first().click({ timeout: 30_000 });
    const dialog = page.getByTestId("automation-rule-dialog");
    await expect(dialog).toBeVisible();

    // Three steps, in the order a rule runs.
    await expect(dialog.getByTestId("rule-step-when")).toContainText("When");
    await expect(dialog.getByTestId("rule-step-check")).toContainText("Every time");
    await expect(dialog.getByTestId("rule-step-do")).toContainText("Then");

    // A condition, and the summary says so.
    await dialog.getByTestId("add-condition").click();
    await expect(dialog.getByTestId("automation-summary")).toContainText("only if");

    // A chip adds its placeholder to the message.
    const message = dialog.getByTestId("action-message");
    const before = await message.inputValue();
    await dialog.locator('[data-testid="insert-chip"][data-token="{ticket}"]').click();
    await expect(message).toHaveValue(`${before} {ticket}`);

    await dialog.getByTestId("automation-name").fill("E2E builder rule");
    await dialog.getByTestId("save-automation").click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole("tab", { name: /Board automations/ }).click();
    await expect(page.getByText("E2E builder rule").first()).toBeVisible({ timeout: 15_000 });
  });
});
