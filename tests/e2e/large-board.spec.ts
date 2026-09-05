import { expect, test, type Page } from "@playwright/test";
import { resetLocalData, row, signInAs } from "./helpers";

/**
 * A board far bigger than the seed: 8 groups, 300 items, 12 columns with a value
 * on every cell. Built straight into IndexedDB so the fixture costs a second
 * rather than ten minutes of clicking.
 */
async function buildLargeBoard(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("rmit-streamline");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = <T,>(store: string): Promise<T[]> =>
      new Promise((resolve) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => resolve([]);
      });

    const boards = await read<{ id: string; workspaceId: string; teamId: string | null; ownerId: string }>("boards");
    const template = boards[0]!;
    const now = new Date().toISOString();
    const uuid = () => crypto.randomUUID();

    const boardId = uuid();
    const board = {
      ...template,
      id: boardId,
      name: "Stress board",
      slug: "stress-board",
      description: "300 items, 12 columns",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const colors = ["red", "orange", "amber", "green", "teal", "sky", "violet", "pink"] as const;
    const groups = colors.map((color, index) => ({
      id: uuid(),
      boardId,
      name: `Group ${index + 1}`,
      color,
      position: index,
      collapsed: false,
      createdAt: now,
    }));

    const statusSettings = {
      kind: "status",
      labels: [
        { id: "not_started", name: "Not Started", color: "gray" },
        { id: "working", name: "Working On It", color: "orange" },
        { id: "stuck", name: "Stuck", color: "red" },
        { id: "done", name: "Done", color: "green" },
      ],
      doneLabelIds: ["done"],
      stuckLabelIds: ["stuck"],
      progressLabelIds: ["working"],
      defaultLabelId: "not_started",
    };
    const prioritySettings = {
      kind: "priority",
      labels: [
        { id: "critical", name: "Critical", color: "rose" },
        { id: "high", name: "High", color: "orange" },
        { id: "medium", name: "Medium", color: "blue" },
        { id: "low", name: "Low", color: "gray" },
      ],
    };

    const columnSpecs: Array<[string, string, unknown]> = [
      ["Owner", "PERSON", { kind: "person", allowMultiple: true }],
      ["Status", "STATUS", statusSettings],
      ["Priority", "PRIORITY", prioritySettings],
      ["Due Date", "DATE", { kind: "none" }],
      ["Timeline", "TIMELINE", { kind: "none" }],
      ["Budget", "NUMBER", { kind: "number", unit: null, decimals: 0 }],
      ["Notes", "TEXT", { kind: "none" }],
      ["Brief", "LONG_TEXT", { kind: "none" }],
      ["Signed off", "CHECKBOX", { kind: "none" }],
      ["Link", "LINK", { kind: "none" }],
      ["Channels", "TAGS", { kind: "tags", options: [{ name: "Print", color: "sky" }, { name: "Digital", color: "violet" }] }],
      ["Blocked by", "DEPENDENCY", { kind: "none" }],
    ];
    const columns = columnSpecs.map(([name, type, settings], index) => ({
      id: uuid(),
      boardId,
      name,
      type,
      settings,
      position: index,
      width: 160,
      hidden: false,
      createdAt: now,
    }));

    const users = await read<{ id: string }>("users");
    const items: unknown[] = [];
    const values: unknown[] = [];
    for (let i = 0; i < 300; i++) {
      const group = groups[i % groups.length]!;
      const itemId = uuid();
      items.push({
        id: itemId,
        boardId,
        groupId: group.id,
        parentItemId: null,
        name: `Stress item ${String(i + 1).padStart(3, "0")} — a realistically long task name for wrapping`,
        description: null,
        position: i,
        createdBy: template.ownerId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const value = (columnIndex: number, v: unknown) =>
        values.push({ id: uuid(), itemId, columnId: columns[columnIndex]!.id, value: v, updatedAt: now });
      value(0, { type: "PERSON", userIds: [users[i % users.length]!.id] });
      value(1, { type: "STATUS", labelId: ["not_started", "working", "stuck", "done"][i % 4] });
      value(2, { type: "PRIORITY", labelId: ["critical", "high", "medium", "low"][i % 4] });
      value(3, { type: "DATE", date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` });
      value(4, { type: "TIMELINE", start: "2026-09-01", end: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` });
      value(5, { type: "NUMBER", number: i * 137 });
      value(6, { type: "TEXT", text: `Note ${i}` });
      value(7, { type: "LONG_TEXT", text: `Brief for item ${i}. `.repeat(3) });
      value(8, { type: "CHECKBOX", checked: i % 3 === 0 });
      value(9, { type: "LINK", url: `https://example.com/${i}`, text: null });
      value(10, { type: "TAGS", tags: i % 2 ? ["Print"] : ["Print", "Digital"] });
      value(11, { type: "DEPENDENCY", itemIds: [] });
    }

    const write = (store: string, rows: unknown[]) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        for (const r of rows) tx.objectStore(store).put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    await write("boards", [board]);
    await write("boardGroups", groups);
    await write("boardColumns", columns);
    await write("items", items);
    await write("itemColumnValues", values);
    db.close();
    return { boardId, items: items.length, columns: columns.length, groups: groups.length };
  });
}

test.describe("a board far bigger than the seed", () => {
  test("stays responsive with 300 items and 12 columns", async ({ page }) => {
    test.setTimeout(180_000);
    await resetLocalData(page);
    await signInAs(page, "Danh");
    const built = await buildLargeBoard(page);
    expect(built.items).toBe(300);

    // 1. First paint of the board.
    const openedAt = Date.now();
    await page.goto("/workspace/rmit/boards/stress-board");
    await expect(page.getByTestId("item-row").first()).toBeVisible({ timeout: 60_000 });
    const firstRow = Date.now() - openedAt;

    await expect.poll(() => page.getByTestId("item-row").count(), { timeout: 60_000 }).toBe(300);
    const allRows = Date.now() - openedAt;

    // 2. Typing into a cell.
    const target = row(page, "Stress item 001 — a realistically long task name for wrapping");
    const notes = target.locator('[aria-label^="Notes"]').first();
    await notes.click();
    const typedAt = Date.now();
    await page.keyboard.type("performance check", { delay: 0 });
    await expect(target.getByRole("textbox")).toHaveValue(/performance check/);
    const typing = Date.now() - typedAt;
    await page.keyboard.press("Escape");

    // 3. Changing a status.
    const statusAt = Date.now();
    await target.getByTestId("status-cell").click();
    await page.getByRole("option", { name: "Done", exact: true }).click();
    await expect(target.getByTestId("status-cell")).toContainText("Done");
    const status = Date.now() - statusAt;

    // 4. Filtering.
    const filterAt = Date.now();
    await page.getByTestId("search-input").fill("item 02");
    await expect.poll(() => page.getByTestId("item-row").count(), { timeout: 30_000 }).toBeLessThan(300);
    const filtering = Date.now() - filterAt;
    await page.getByTestId("search-input").fill("");
    await expect.poll(() => page.getByTestId("item-row").count(), { timeout: 30_000 }).toBe(300);

    // 5. Opening the detail panel. The first open also compiles the panel's
    // chunk in dev, so the second one is the number that reflects the app.
    // Let the refetch from the edits above settle first, or its cost lands here.
    await page.waitForTimeout(1500);
    const firstPanelAt = Date.now();
    await target.getByRole("button", { name: /^Open Stress item 001/ }).click();
    await expect(page.getByTestId("item-panel")).toBeVisible({ timeout: 30_000 });
    const firstPanel = Date.now() - firstPanelAt;
    await page.getByTestId("close-panel").click();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);

    const panelAt = Date.now();
    await row(page, "Stress item 002 — a realistically long task name for wrapping")
      .getByRole("button", { name: /^Open Stress item 002/ })
      .click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    const panel = Date.now() - panelAt;
    await page.getByTestId("close-panel").click();

    // 6. Switching to kanban and back.
    const viewAt = Date.now();
    await page.getByTestId("view-switcher").click();
    await page.getByTestId("view-kanban").click();
    await expect(page.getByTestId("lane-Done")).toBeVisible({ timeout: 30_000 });
    const kanban = Date.now() - viewAt;

    console.log(
      `PERF firstRow=${firstRow}ms allRows=${allRows}ms typing=${typing}ms status=${status}ms filter=${filtering}ms firstPanel=${firstPanel}ms panel=${panel}ms kanban=${kanban}ms`,
    );

    // Generous ceilings: this is a smoke alarm for a regression, not a benchmark.
    expect(firstRow, "first row painted").toBeLessThan(20_000);
    expect(typing, "typing into a cell").toBeLessThan(5_000);
    expect(status, "changing a status").toBeLessThan(8_000);
    expect(filtering, "filtering").toBeLessThan(8_000);
    expect(panel, "opening the item panel").toBeLessThan(8_000);
    expect(kanban, "switching to kanban").toBeLessThan(20_000);
  });
});
