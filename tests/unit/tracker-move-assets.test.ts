import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Item } from "@/domain";
import { isFreshSheet, suggestAssetMapping } from "@/domain";
import { TrackerService } from "@/services/tracker-service";
import { createServices } from "@/services";

/**
 * "New tracker for this task" with the task's own assets moved into it
 * (v0.130.0): every line becomes a row in its order, blocks become bands, the
 * sheet is linked at once, and the old lines go only once the sheet's are in.
 */
describe("a new tracker that takes a task's assets", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let item: Item;
  const actor = SEED_USER_IDS.jun;

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `move-assets-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const board = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system)!;
    item = (await repos.items.listByBoard(board.id)).find((i) => !i.parentItemId)!;
    // Start from a task with nothing on it but what this test puts there.
    const existing = await repos.itemAssets.listByItem(item.id);
    if (existing.length) await repos.itemAssets.deleteMany(existing.map((a) => a.id));
    await repos.itemAssets.createMany([
      { itemId: item.id, boardId: item.boardId, name: "A1 poster", assetType: "Print", quantity: 6, notes: "CMYK", dueDate: "2026-12-01", assigneeIds: [SEED_USER_IDS.emily], blockId: "00000000-0000-4000-8000-0000000000b1", blockName: "Print run", position: 0, createdBy: actor },
      { itemId: item.id, boardId: item.boardId, name: "A4 flyer", assetType: "Print", quantity: 200, blockId: "00000000-0000-4000-8000-0000000000b1", blockName: "Print run", position: 1, completedAt: "2026-11-01T00:00:00.000Z", createdBy: actor },
      { itemId: item.id, boardId: item.boardId, name: "Story tile", assetType: "Social", links: [{ id: "l1", label: "Drive", url: "https://example.com/tile", icon: "link" }], position: 2, createdBy: actor },
    ]);
  });

  const input = (moveAssets: boolean) => ({ workspaceId: SEED_WORKSPACE_ID, teamId: null, itemId: item.id, name: "Kit", assetTypes: ["Print"], moveAssets });

  it("moves every line into the sheet, in order, with blocks as bands, and links it", async () => {
    const { sheet, moved } = await services.trackers.createForItem(input(true), actor);
    expect(moved).toBe(3);
    expect(sheet.itemId).toBe(item.id);
    expect(sheet.columns.map((c) => c.name)).toEqual(["Asset", "Type", "Quantity", "Spec", "PIC", "Due date", "Done", "Link"]);
    const filled = sheet.rows.filter((r) => r.kind !== "data" || Object.keys(r.cells).length);
    // Lines in no block first: under a band a row would join its block.
    expect(filled.map((r) => (r.kind === "data" ? "row" : `band:${r.label}`))).toEqual(["row", "band:Print run", "row", "row"]);
    expect(sheet.rows.length).toBeGreaterThanOrEqual(20);
    // The Type dropdown offers the workspace's types and the ones the lines used.
    expect(sheet.columns.find((c) => c.name === "Type")?.options).toEqual(["Print", "Social"]);

    const lines = await repos.itemAssets.listByItem(item.id);
    expect(lines.every((l) => l.trackerSheetId === sheet.id)).toBe(true);
    const byName = (n: string) => lines.find((l) => l.name === n)!;
    expect(["A1 poster", "A4 flyer", "Story tile"].map((n) => { const l = byName(n); return [l.name, l.assetType, l.quantity, l.dueDate, !!l.completedAt, l.blockName, l.assigneeIds]; })).toEqual([
      ["A1 poster", "Print", 6, "2026-12-01", false, "Print run", [SEED_USER_IDS.emily]],
      ["A4 flyer", "Print", 200, null, true, "Print run", []],
      ["Story tile", "Social", null, null, false, null, []],
    ]);
    expect(byName("A1 poster").notes).toContain("CMYK");
    expect(byName("Story tile").links.map((l) => l.url)).toEqual(["https://example.com/tile"]);
  });

  it("with moving off, links an empty asset sheet and leaves the task's lines as they were", async () => {
    const { sheet, moved } = await services.trackers.createForItem(input(false), actor);
    expect(moved).toBe(0);
    expect(sheet.itemId).toBe(item.id);
    const lines = await repos.itemAssets.listByItem(item.id);
    expect(lines.map((l) => [l.name, l.trackerSheetId])).toEqual([
      ["A1 poster", null],
      ["A4 flyer", null],
      ["Story tile", null],
    ]);
  });

  it("leaves lines from another sheet alone and refuses a task that already has a sheet", async () => {
    await services.trackers.createForItem(input(true), actor);
    await expect(services.trackers.createForItem(input(true), actor)).rejects.toThrow(/already takes its assets/);
    expect(await repos.itemAssets.listByItem(item.id)).toHaveLength(3);
  });

  it("a task with no lines of its own still gets a linked, empty asset sheet", async () => {
    await repos.itemAssets.deleteMany((await repos.itemAssets.listByItem(item.id)).map((a) => a.id));
    const { sheet, moved } = await services.trackers.createForItem(input(true), actor);
    expect(moved).toBe(0);
    expect(sheet.itemId).toBe(item.id);
    expect(sheet.rows.every((r) => r.kind === "data" && Object.keys(r.cells).length === 0)).toBe(true);
  });

  describe("into a sheet that already holds data", () => {
    // An existing tracker: two filled rows, a "PRINT RUN" band with one row, a "Video" band, and empty rows.
    // Columns for name, type (a dropdown without "Social") and quantity only: no due, done, PIC, spec or link.
    const setup = async () => {
      const { sheets } = await services.trackers.create(
        {
          workspaceId: SEED_WORKSPACE_ID,
          teamId: null,
          name: "Existing",
          layout: "blank",
          sheets: [
            {
              name: "Kit",
              frozenColumns: 1,
              columns: [
                { id: "n", name: "Asset", type: "text", width: 200 },
                { id: "t", name: "Type", type: "list", width: 120, options: ["Print"] },
                { id: "q", name: "Qty", type: "number", width: 80 },
              ],
              rows: [
                { id: "e1", kind: "data", cells: { n: "Existing one", t: "Print", q: 1 } },
                { id: "e2", kind: "data", cells: { n: "Existing two" } },
                { id: "x1", kind: "data", cells: {} },
                { id: "b1", kind: "section", label: "PRINT RUN", cells: {} },
                { id: "e3", kind: "data", cells: { n: "Existing poster", t: "Print" } },
                { id: "x2", kind: "data", cells: {} },
                { id: "b2", kind: "section", label: "Video", cells: {} },
                { id: "e4", kind: "data", cells: { n: "Existing cut" } },
                { id: "x3", kind: "data", cells: {} },
              ],
            },
          ],
        },
        actor,
      );
      return sheets[0]!;
    };

    it("adds the task's lines below what is there, never over it, and keeps every existing row", async () => {
      const sheet = await setup();
      const { sheet: linked, moved } = await services.trackers.linkSheet(sheet.id, item.id, suggestAssetMapping(sheet), actor, { moveAssets: true });
      expect(moved).toBe(3);
      const order = linked.rows.map((r) => (r.kind !== "data" ? `band:${r.label}` : ((r.cells as Record<string, unknown>)[linked.columns.find((c) => c.name === "Asset")!.id] as string | undefined) ?? "·"));
      expect(order).toEqual([
        "Existing one",
        "Existing two",
        "Story tile", // in no block: after the filled rows, above the first band
        "·",
        "band:PRINT RUN",
        "Existing poster",
        "A1 poster", // the block joins the band of the same name, after its last filled row
        "A4 flyer",
        "·",
        "band:Video",
        "Existing cut",
        "·",
      ]);
      // Untouched: the existing rows keep their ids and cells.
      const kept = new Map(linked.rows.map((r) => [r.id, r]));
      expect(kept.get("e1")!.cells).toEqual({ n: "Existing one", t: "Print", q: 1 });
      expect(kept.get("e3")!.cells).toEqual({ n: "Existing poster", t: "Print" });
    });

    it("adds a column for every part the lines hold and the sheet had none for, so nothing is lost", async () => {
      const sheet = await setup();
      const { sheet: linked } = await services.trackers.linkSheet(sheet.id, item.id, suggestAssetMapping(sheet), actor, { moveAssets: true });
      expect(linked.columns.map((c) => c.name)).toEqual(["Asset", "Type", "Qty", "PIC", "Due date", "Done", "Link", "Spec"]);
      // A type the dropdown did not offer joins it.
      expect(linked.columns.find((c) => c.name === "Type")!.options).toEqual(["Print", "Social"]);
      const lines = await repos.itemAssets.listByItem(item.id);
      const byName = (n: string) => lines.find((l) => l.name === n)!;
      expect(byName("A1 poster")).toMatchObject({ assetType: "Print", quantity: 6, dueDate: "2026-12-01", assigneeIds: [SEED_USER_IDS.emily], blockName: "PRINT RUN" });
      expect(byName("A1 poster").notes).toContain("CMYK");
      expect(byName("A4 flyer").completedAt).not.toBeNull();
      expect(byName("Story tile")).toMatchObject({ assetType: "Social", blockName: null });
      expect(byName("Story tile").links.map((l) => l.url)).toEqual(["https://example.com/tile"]);
      // The sheet's own rows are lines too; nothing is left over from the task's own.
      expect(lines.map((l) => l.name).sort()).toEqual(["A1 poster", "A4 flyer", "Existing cut", "Existing one", "Existing poster", "Existing two", "Story tile"].sort());
      expect(lines.every((l) => l.trackerSheetId === sheet.id)).toBe(true);
    });

    it("without moving, the sheet's rows become the task's lines beside its own, which stay as they were", async () => {
      const sheet = await setup();
      const { moved } = await services.trackers.linkSheet(sheet.id, item.id, suggestAssetMapping(sheet), actor);
      expect(moved).toBe(0);
      const lines = await repos.itemAssets.listByItem(item.id);
      expect(lines.filter((l) => !l.trackerSheetId).map((l) => l.name)).toEqual(["A1 poster", "A4 flyer", "Story tile"]);
      expect(lines.filter((l) => l.trackerSheetId).length).toBe(4);
      expect((await services.trackers.getSheet(sheet.id)).rows).toHaveLength(9);
    });
  });

  describe("a fresh sheet (nothing typed, columns still 'Column 1'…)", () => {
    const blank = async () => (await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Fresh", layout: "blank" }, actor)).sheets[0]!;

    it("is told apart from a sheet with anything in it, or with named columns", async () => {
      const sheet = await blank();
      expect(isFreshSheet(sheet)).toBe(true);
      expect(isFreshSheet({ ...sheet, rows: [{ id: "r", kind: "data", cells: { [sheet.columns[0]!.id]: "x" } }] })).toBe(false);
      expect(isFreshSheet({ ...sheet, rows: [{ id: "b", kind: "section", label: "", cells: {} }] })).toBe(false);
      expect(isFreshSheet({ ...sheet, columns: [{ ...sheet.columns[0]!, name: "Deliverable" }, ...sheet.columns.slice(1)] })).toBe(false);
    });

    it("gets the asset columns as it is linked, matched without any mapping, and the task's lines with them", async () => {
      const sheet = await blank();
      const { sheet: linked, moved } = await services.trackers.linkSheet(sheet.id, item.id, suggestAssetMapping(sheet), actor, { setUpColumns: true, moveAssets: true, assetTypes: ["Print"] });
      expect(linked.columns.slice(0, 7).map((c) => c.name)).toEqual(["Asset", "Type", "Quantity", "Spec", "PIC", "Due date", "Done"]);
      expect(linked.assetMapping?.name).toBe(linked.columns[0]!.id);
      expect(linked.assetMapping?.due.columnId).toBe(linked.columns.find((c) => c.name === "Due date")!.id);
      expect(moved).toBe(3);
      expect((await repos.itemAssets.listByItem(item.id)).map((l) => [l.name, l.dueDate ?? null]).sort()).toEqual([
        ["A1 poster", "2026-12-01"],
        ["A4 flyer", null],
        ["Story tile", null],
      ]);
    });

    it("a sheet with data keeps its columns even when asked to set them up", async () => {
      const sheet = await blank();
      const named = TrackerService.applyEdits(sheet, [{ rowId: sheet.rows[0]!.id, columnId: sheet.columns[0]!.id, value: "Already here" }]);
      await services.trackers.saveSheet(sheet.id, { rows: named.rows });
      const { sheet: linked } = await services.trackers.linkSheet(sheet.id, item.id, suggestAssetMapping(sheet), actor, { setUpColumns: true });
      expect(linked.columns.map((c) => c.name)).toEqual(sheet.columns.map((c) => c.name));
    });
  });
});
