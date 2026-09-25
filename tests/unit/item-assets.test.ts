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
        { quantity: 6, assetType: "Print", assigneeIds: ["u1"], dueDate: "2026-09-10", completedAt: null },
        { quantity: null, assetType: "print", assigneeIds: ["u1"], dueDate: "2026-09-01", completedAt: null },
        { quantity: 3, assetType: "Social", assigneeIds: ["u2"], dueDate: null, completedAt: "2026-09-05T00:00:00.000Z" },
        { quantity: 2, assetType: null, assigneeIds: [], dueDate: "2026-09-07", completedAt: null },
      ],
      TODAY,
    );
    expect(recap.lines).toBe(4);
    expect(recap.quantity).toBe(12);
    expect(recap.types).toEqual(["print", "Print", "Social"]);
    expect(recap.assigneeIds).toEqual(["u1", "u2"]);
    expect(recap.unassigned).toBe(1);
    expect(recap.done).toBe(1);
    expect(recap.doneQuantity).toBe(3);
    expect(recap.nextDue).toBe("2026-09-07");
    expect(recap.overdue).toBe(1);
    // The count is the deliverable lines; the copies ordered ride alongside as
    // a multiplier, so this never disagrees with "N of M done".
    expect(formatAssetsRecap({ lines: recap.lines, quantity: recap.quantity, types: recap.types, people: recap.assigneeIds })).toBe(`${recap.lines} assets ×12 · 2 PIC`);
    expect(formatAssetsRecap({ lines: 1, quantity: 1, types: 0, people: 0 })).toBe("1 asset · 0 PIC");
    expect(formatAssetsRecap({ lines: 1, quantity: 25, types: 0, people: 0 })).toBe("1 asset ×25 · 0 PIC");
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
    const value = recapColumnValue(recapAssets([{ quantity: 4, assetType: "Print", assigneeIds: ["u1"], dueDate: null, completedAt: null }], TODAY));
    expect(isEmptyValue(value)).toBe(false);
    expect(displayValue(column, value, [])).toBe("1 asset ×4 · 1 PIC");
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

  /** A board from before every board held a recap: its seeded one taken out at the data level. */
  async function withoutRecap(boardId: string) {
    for (const c of await repos.boards.listColumns(boardId)) if (c.type === "ASSETS_RECAP") await repos.boards.deleteColumn(c.id);
  }

  it("are listed per item in order, edited, removed, and keep the board's recap column in step", async () => {
    const boardId = SEED_BOARD_IDS.rmitinerary;
    const item = await firstItemOf(boardId);
    await withoutRecap(boardId);
    const column = await services.boards.addColumn({ boardId, name: "Assets recap", type: "ASSETS_RECAP" });

    const poster = await services.assets.add({ itemId: item.id, boardId, name: "A1 poster", assetType: "Print", quantity: 6, dueDate: "2026-09-20" }, SEED_USER_IDS.danh);
    const tile = await services.assets.add({ itemId: item.id, boardId, name: "Instagram tile", assetType: "Social", assigneeIds: [SEED_USER_IDS.tuyet] }, SEED_USER_IDS.danh);
    expect(poster.boardId).toBe(boardId);
    expect(tile.position).toBeGreaterThan(poster.position);

    let lines = await services.assets.list(item.id);
    expect(lines.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
    let stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ type: "ASSETS_RECAP", lines: 2, quantity: 7, types: 2, people: 1 });

    await services.assets.update(poster.id, { quantity: 10, assigneeIds: [SEED_USER_IDS.tuyet] }, SEED_USER_IDS.danh);
    stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ quantity: 11, people: 1 });

    await services.assets.remove(tile.id, item.id, boardId, SEED_USER_IDS.danh);
    lines = await services.assets.list(item.id);
    expect(lines).toHaveLength(1);
    stored = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === column.id)?.value;
    expect(stored).toMatchObject({ lines: 1, quantity: 10, types: 1 });

    // The whole board's lines come back in one read, for the cells.
    expect((await services.assets.listByBoard(boardId)).filter((l) => l.itemId === item.id).map((l) => l.id)).toEqual([poster.id]);

    // Nonsense is refused.
    await expect(services.assets.add({ itemId: item.id, boardId, name: "   " }, SEED_USER_IDS.danh)).rejects.toThrow(/what the asset is/);
    await expect(services.assets.update(poster.id, { quantity: -1 }, SEED_USER_IDS.danh)).rejects.toThrow(/zero or more/);
  });

  /**
   * The deliverables of a linked pair are one set seen from two boards, and
   * every place that counts them has to reach the same number. The panel always
   * did — it reads the shared list — but the board read only the lines stored on
   * it, so the same task said "2 of 3 done" on one board, "0 of 1" on the other
   * and "2 of 4" in the panel of either.
   */
  it("counts the pair's deliverables the same from both boards", async () => {
    const here = SEED_BOARD_IDS.rmitinerary;
    const there = SEED_BOARD_IDS.masterclass;
    const mine = await firstItemOf(here);
    const theirs = await firstItemOf(there);
    await services.links.link(mine.id, theirs.id, SEED_USER_IDS.danh);

    const a = await services.assets.add({ itemId: mine.id, boardId: here, name: "A1 poster" }, SEED_USER_IDS.danh);
    await services.assets.add({ itemId: mine.id, boardId: here, name: "Instagram tile" }, SEED_USER_IDS.danh);
    const far = await services.assets.add({ itemId: theirs.id, boardId: there, name: "Lecture slides" }, SEED_USER_IDS.danh);
    await services.assets.update(a.id, { completedAt: new Date().toISOString() }, SEED_USER_IDS.danh);

    // The panel: one list of three, wherever it is opened from.
    expect((await services.assets.list(mine.id)).map((l) => l.name)).toEqual(["A1 poster", "Instagram tile", "Lecture slides"]);
    expect((await services.assets.list(theirs.id)).map((l) => l.name).sort()).toEqual(["A1 poster", "Instagram tile", "Lecture slides"]);

    // And the board, from either side. `lines` stays what each board stores —
    // its own totals must not count the other board's work twice — while
    // `byItem` is what the row shows.
    const hereAssets = await services.assets.loadBoard(here, SEED_WORKSPACE_ID);
    const thereAssets = await services.assets.loadBoard(there, SEED_WORKSPACE_ID);
    // (The seeded boards carry lines of their own; these are the two items' own.)
    expect(hereAssets.lines.filter((l) => l.itemId === mine.id)).toHaveLength(2);
    expect(thereAssets.lines.filter((l) => l.itemId === theirs.id)).toHaveLength(1);
    expect(hereAssets.byItem.get(mine.id)!.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile", "Lecture slides"]);
    expect(thereAssets.byItem.get(theirs.id)!.map((l) => l.name).sort()).toEqual(["A1 poster", "Instagram tile", "Lecture slides"]);

    // Which is the number the progress bar is drawn from: 1 of 3, both sides.
    for (const [assets, itemId] of [
      [hereAssets, mine.id],
      [thereAssets, theirs.id],
    ] as const) {
      const lines = assets.byItem.get(itemId)!;
      expect(lines.filter((l) => l.completedAt).length).toBe(1);
      expect(lines).toHaveLength(3);
    }

    // Each side is told where the other's lines live, so it can watch that
    // board for changes it would otherwise never hear about.
    expect(hereAssets.linkedBoardIds).toContain(there);
    expect(thereAssets.linkedBoardIds).toContain(here);

    // Ticking the far side off moves both.
    await services.assets.update(far.id, { completedAt: new Date().toISOString() }, SEED_USER_IDS.danh);
    const after = await services.assets.loadBoard(here, SEED_WORKSPACE_ID);
    expect(after.byItem.get(mine.id)!.filter((l) => l.completedAt)).toHaveLength(2);

    // Unlinked, each goes back to its own.
    const links = await repos.links.listByItem(mine.id);
    await services.links.unlink(links[0]!.id, SEED_USER_IDS.danh);
    const apart = await services.assets.loadBoard(here, SEED_WORKSPACE_ID);
    expect(apart.byItem.get(mine.id)!.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
  });

  it("reaches the third task in a chain, the way the panel does", async () => {
    const first = await firstItemOf(SEED_BOARD_IDS.rmitinerary);
    const second = await firstItemOf(SEED_BOARD_IDS.masterclass);
    const third = await firstItemOf(SEED_BOARD_IDS.openday);
    await services.links.link(first.id, second.id, SEED_USER_IDS.danh);
    await services.links.link(second.id, third.id, SEED_USER_IDS.danh);
    await services.assets.add({ itemId: third.id, boardId: third.boardId, name: "Run sheet" }, SEED_USER_IDS.danh);

    const board = await services.assets.loadBoard(SEED_BOARD_IDS.rmitinerary, SEED_WORKSPACE_ID);
    expect(board.byItem.get(first.id)!.map((l) => l.name)).toEqual(["Run sheet"]);
    expect(board.linkedBoardIds).toContain(third.boardId);
  });

  it("fills a recap column added later from the lines that already exist, and go when the item goes", async () => {
    const boardId = SEED_BOARD_IDS.masterclass;
    const item = await firstItemOf(boardId);
    await services.assets.add({ itemId: item.id, boardId, name: "Hero", assetType: "Digital", quantity: 2 }, SEED_USER_IDS.danh);
    await withoutRecap(boardId);
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
        department: "Comm.",
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
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus, print ready." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
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

    // Allocating moves the request, so its deliverables move with it rather
    // than being copied onto a second item.
    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const target = boards.find((b) => b.slug === "rmitinerary-2026")!;
    const { item: moved } = await services.booking.allocate(receipt.itemId, target.id, owner);
    expect(moved.id).toBe(receipt.itemId);
    const travelled = await services.assets.list(receipt.itemId);
    expect(travelled.map((l) => l.name)).toEqual(["A1 poster", "Instagram tile"]);
    expect(travelled.every((l) => l.boardId === target.id)).toBe(true);
  });
});
