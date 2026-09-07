import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { COLUMN_TYPE_LABELS, DEFAULT_COLUMN_WIDTHS, countByType, emptyValueFor, formatAssetsRecap, isEmptyValue, recapAssets, recapColumnValue } from "@/domain";
import { createServices } from "@/services";
import { displayValue } from "@/services/column-display";
import { sortItems } from "@/features/boards/board-filtering";
import type { BoardColumn, Item } from "@/domain";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `assets-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

const TODAY = "2026-09-07";

describe("asset recap maths", () => {
  it("adds up quantities, counts a line without one as a single asset, and lists distinct types and people", () => {
    const recap = recapAssets(
      [
        { quantity: 6, assetType: "Print", assigneeId: "u1", dueDate: "2026-09-10" },
        { quantity: null, assetType: "print", assigneeId: "u1", dueDate: "2026-09-01" },
        { quantity: 3, assetType: "Social", assigneeId: "u2", dueDate: null },
        { quantity: 2, assetType: null, assigneeId: null, dueDate: "2026-09-07" },
      ],
      TODAY,
    );
    expect(recap.lines).toBe(4);
    expect(recap.quantity).toBe(12);
    expect(recap.types).toEqual(["print", "Print", "Social"]);
    expect(recap.assigneeIds).toEqual(["u1", "u2"]);
    expect(recap.unassigned).toBe(1);
    expect(recap.nextDue).toBe("2026-09-07");
    expect(recap.overdue).toBe(1);
    expect(formatAssetsRecap({ lines: recap.lines, quantity: recap.quantity, types: recap.types, people: recap.assigneeIds })).toBe("12 assets · 3 types · 2 PIC");
    expect(formatAssetsRecap({ lines: 1, quantity: 1, types: 0, people: 0 })).toBe("1 asset · 0 PIC");
    expect(formatAssetsRecap({ lines: 0, quantity: 0, types: 0, people: 0 })).toBe("");
    expect(countByType([{ quantity: 2, assetType: "Print" }, { quantity: 1, assetType: "Print" }, { quantity: null, assetType: null }])).toEqual([
      { type: "Print", quantity: 3, lines: 2 },
      { type: null, quantity: 1, lines: 1 },
    ]);
  });

  it("is a first-class, read-only column type with an empty stored value", () => {
    expect(COLUMN_TYPE_LABELS.ASSETS_RECAP).toBe("Assets recap");
    expect(DEFAULT_COLUMN_WIDTHS.ASSETS_RECAP).toBeGreaterThan(0);
    const empty = emptyValueFor("ASSETS_RECAP");
    expect(isEmptyValue(empty)).toBe(true);
    const column: BoardColumn = { id: "c", boardId: "b", name: "Assets recap", type: "ASSETS_RECAP", settings: { kind: "none" }, position: 0, width: 200, hidden: false, createdAt: "" };
    const value = recapColumnValue(recapAssets([{ quantity: 4, assetType: "Print", assigneeId: "u1", dueDate: null }], TODAY));
    expect(isEmptyValue(value)).toBe(false);
    expect(displayValue(column, value, [])).toBe("4 assets · 1 type · 1 PIC");
    expect(displayValue(column, empty, [])).toBeNull();

    // Sorts by how much is being produced, blanks last.
    const item = (id: string, position: number): Item => ({ id, boardId: "b", groupId: "g", parentItemId: null, name: id, description: null, position, createdBy: "u", archivedAt: null, createdAt: "", updatedAt: "" });
    const quantities: Record<string, number | null> = { a: 9, b: 2, c: null, d: 5 };
    const ctx = { columns: [column], getValue: (itemId: string) => (quantities[itemId] === null ? empty : { ...value, quantity: quantities[itemId]!, lines: 1 }) };
    const items = Object.keys(quantities).map((id, i) => item(id, i));
    expect(sortItems(items, { field: "column:c", direction: "asc" }, ctx).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("asset lines on an item", () => {
  let repos: ReturnType<typeof freshServices>["repos"];
  let services: ReturnType<typeof freshServices>["services"];

  beforeEach(() => {
    ({ repos, services } = freshServices());
  });

  async function firstItemOf(boardId: string) {
    const items = await repos.items.listByBoard(boardId);
    return items.find((i) => i.parentItemId === null)!;
  }

  it("are listed per item in order, edited, removed, and keep the board's recap column in step", async () => {
    const boardId = SEED_BOARD_IDS.rmitinerary;
    const item = await firstItemOf(boardId);
    const column = await services.boards.addColumn({ boardId, name: "Assets recap", type: "ASSETS_RECAP" });

    const poster = await services.assets.add({ itemId: item.id, boardId, name: "A1 poster", assetType: "Print", quantity: 6, dueDate: "2026-09-20" }, SEED_USER_IDS.danh);
    const tile = await services.assets.add({ itemId: item.id, boardId, name: "Instagram tile", assetType: "Social", assigneeId: SEED_USER_IDS.tuyet }, SEED_USER_IDS.danh);
    expect(poster.boardId).toBe(boardId);
    expect(tile.position).toBeGreaterThan(poster.position);

    let lines = await services.assets.list(item.id);
    expect(lines.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
    let stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ type: "ASSETS_RECAP", lines: 2, quantity: 7, types: 2, people: 1 });

    await services.assets.update(poster.id, { quantity: 10, assigneeId: SEED_USER_IDS.tuyet });
    stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ quantity: 11, people: 1 });

    await services.assets.remove(tile.id, item.id, boardId);
    lines = await services.assets.list(item.id);
    expect(lines).toHaveLength(1);
    stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ lines: 1, quantity: 10, types: 1 });

    // The whole board's lines come back in one read, for the cells.
    expect((await services.assets.listByBoard(boardId)).filter((l) => l.itemId === item.id).map((l) => l.id)).toEqual([poster.id]);

    // Nonsense is refused.
    await expect(services.assets.add({ itemId: item.id, boardId, name: "   " }, SEED_USER_IDS.danh)).rejects.toThrow(/what the asset is/);
    await expect(services.assets.update(poster.id, { quantity: -1 })).rejects.toThrow(/zero or more/);
  });

  it("fills a recap column added later from the lines that already exist, and go when the item goes", async () => {
    const boardId = SEED_BOARD_IDS.masterclass;
    const item = await firstItemOf(boardId);
    await services.assets.add({ itemId: item.id, boardId, name: "Hero", assetType: "Digital", quantity: 2 }, SEED_USER_IDS.danh);
    const column = await services.boards.addColumn({ boardId, name: "Deliverables", type: "ASSETS_RECAP" });
    const stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ type: "ASSETS_RECAP", lines: 1, quantity: 2 });

    await services.items.deleteItems(boardId, [item.id], SEED_USER_IDS.danh);
    expect(await services.assets.list(item.id)).toHaveLength(0);
    expect((await services.assets.listByBoard(boardId)).some((l) => l.itemId === item.id)).toBe(false);
  });

  it("come from a booking's asset lines and travel with an allocation", async () => {
    const owner = SEED_USER_IDS.danh;
    const receipt = await services.booking.submit({
      workspaceSlug: "rmit",
      key: null,
      request: {
        requesterName: "Alex Stakeholder",
        requesterEmail: "alex@rmit.edu.au",
        department: "School of Design",
        title: "Graduate show wayfinding",
        brief: "Signage for the graduate show across two buildings, plus a social tile.",
        assetTypes: ["Print"],
        assets: [
          { name: "A1 poster", quantity: 6, spec: "594×841 mm" },
          { name: "Instagram tile", quantity: 1, spec: null },
        ],
        teamId: null,
        dueDate: "2026-10-01",
        priority: "High",
        referenceUrl: null,
        extra: {},
      },
      actorId: owner,
    });
    const lines = await services.assets.list(receipt.itemId);
    expect(lines.map((l) => [l.name, l.quantity, l.assetType, l.dueDate, l.notes])).toEqual([
      ["A1 poster", 6, "Print", "2026-10-01", "594×841 mm"],
      ["Instagram tile", 1, "Print", "2026-10-01", null],
    ]);
    // The Task Allocation board carries a recap column, so the cell is filled in.
    const columns = await repos.boards.listColumns(receipt.boardId);
    const recap = columns.find((c) => c.type === "ASSETS_RECAP")!;
    expect(recap).toBeDefined();
    const stored = (await repos.items.listValuesByItem(receipt.itemId)).find((v) => v.columnId === recap.id)?.value;
    expect(stored).toMatchObject({ lines: 2, quantity: 7, types: 1 });

    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const target = boards.find((b) => b.slug === "rmitinerary-2026")!;
    const { created } = await services.booking.allocate(receipt.itemId, target.id, owner);
    const copied = await services.assets.list(created.id);
    expect(copied.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
    expect(copied.every((l) => l.boardId === target.id)).toBe(true);
  });
});
