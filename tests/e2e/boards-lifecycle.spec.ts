import { expect, test } from "@playwright/test";
import { openBoard, resetLocalData, row, signInAs } from "./helpers";

async function createBoard(page: import("@playwright/test").Page, name: string, template: string) {
  await page.getByTestId("sidebar-add-new").click();
  await page.getByTestId("sidebar-add-board").click();
  await page.getByLabel("Board name").fill(name);
  await page.getByRole("radio", { name: new RegExp(template, "i") }).click().catch(async () => {
    await page.getByText(template, { exact: false }).first().click();
  });
  await page.getByRole("button", { name: /create board/i }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 15000 });
}

test.describe("board lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await resetLocalData(page);
    await signInAs(page, "Danh");
  });

  test("each template builds the groups and columns it promises", async ({ page }) => {
    const expected: Record<string, { groups: string[]; columns: string[] }> = {
      Blank: { groups: ["Group 1"], columns: ["Owner", "Status", "Due Date"] },
      Campaign: {
        groups: ["Planning", "Production", "Review", "Live", "Completed"],
        columns: ["Owner", "Status", "Priority", "Timeline", "Channel"],
      },
      "Creative Production": {
        groups: ["Briefing", "Design", "Internal Review", "Stakeholder Review", "Approved", "Delivered"],
        columns: ["Designer", "Status", "Priority", "Due Date", "Format", "Market"],
      },
    };
    for (const [template, want] of Object.entries(expected)) {
      await createBoard(page, `T ${template}`, template);
      for (const group of want.groups) {
        await expect(page.getByTestId(`group-${group}`), `${template} should have group ${group}`).toBeVisible();
      }
      const headers = await page.getByRole("columnheader").allTextContents();
      expect(headers.slice(0, want.columns.length + 1).join("|"), `${template} column order`).toBe(["Item", ...want.columns].join("|"));

      // A brand-new board is usable straight away.
      const firstGroup = (await page.getByTestId(/^group-/).first().getAttribute("data-testid"))!.replace("group-", "");
      const input = page.getByTestId(`add-item-${firstGroup}`);
      await input.fill(`First task on ${template}`);
      await input.press("Enter");
      await expect(row(page, `First task on ${template}`)).toBeVisible();
      await page.reload();
      await expect(row(page, `First task on ${template}`)).toBeVisible();
    }
  });

  test("duplicating a board deep-copies groups, columns, items and values", async ({ page }) => {
    await openBoard(page);
    const before = await page.getByTestId("item-row").count();
    await page.getByTestId("board-menu").click();
    await page.getByRole("menuitem", { name: /duplicate board/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("copy", { timeout: 20000 });
    const copyUrl = page.url();
    await expect(page.getByTestId("item-row")).toHaveCount(before, { timeout: 20000 });
    await expect(page.getByTestId("group-Design")).toBeVisible();

    // Editing the copy must not touch the original.
    const item = row(page, "RMITinerary Independent");
    await item.getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Done" }).click();
    await expect(item.getByTestId("status-cell")).toContainText("Done");
    await openBoard(page);
    await expect(row(page, "RMITinerary Independent").getByTestId("status-cell")).toContainText("Not Started");
    await page.goto(copyUrl);
    await expect(row(page, "RMITinerary Independent").getByTestId("status-cell")).toContainText("Done", { timeout: 15000 });
  });

  test("archive hides a board from the sidebar and restore brings it back", async ({ page }) => {
    await createBoard(page, "Archive me", "Blank");
    const url = page.url();
    await page.getByTestId("board-menu").click();
    await page.getByRole("menuitem", { name: /archive board/i }).click();
    await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 15000 });
    await page.goto("/workspace/rmit");
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByText("Archive me")).toHaveCount(0);

    // The board is still reachable by URL, and says it is archived.
    await page.goto(url);
    await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /restore board/i }).click();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Archive me" })).toBeVisible();
  });

  test("deleting a board removes it and its URL stops working", async ({ page }) => {
    await createBoard(page, "Delete me", "Blank");
    const url = page.url();
    await page.getByTestId("board-menu").click();
    await page.getByRole("menuitem", { name: /delete board/i }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("textbox").fill("Delete me").catch(() => {});
    await dialog.getByRole("button", { name: /delete/i }).click();
    await expect(page).toHaveURL(/\/workspace\/rmit$/, { timeout: 15000 });
    await page.goto(url);
    await expect(page.getByText(/board not found/i)).toBeVisible({ timeout: 15000 });
  });

  test("favourite pins to the sidebar and survives a reload", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/dooh-production");
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    await page.getByTestId("favourite-toggle").click();
    // The sidebar listing it under Favourites means the write came back.
    await expect(nav.getByRole("link", { name: "DOOH Production" })).toHaveCount(2, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("favourite-toggle")).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    await page.getByTestId("favourite-toggle").click();
    await expect(nav.getByRole("link", { name: "DOOH Production" })).toHaveCount(1, { timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId("favourite-toggle")).toHaveAttribute("aria-pressed", "false", { timeout: 15000 });
  });

  test("an unknown board slug shows not-found, not a blank page", async ({ page }) => {
    await page.goto("/workspace/rmit/boards/no-such-board");
    await expect(page.getByText(/board not found/i)).toBeVisible({ timeout: 15000 });
  });

  test("rapid board switching lands on the right board", async ({ page }) => {
    const slugs = ["rmitinerary-2026", "social-content-calendar-q4", "open-day-2026", "brand-guidelines-refresh"];
    for (let pass = 0; pass < 2; pass++) {
      for (const slug of slugs) {
        await page.goto(`/workspace/rmit/boards/${slug}`);
      }
    }
    await expect(page.getByTestId("board-table")).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/brand-guidelines-refresh/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Brand Guidelines");
  });
});
