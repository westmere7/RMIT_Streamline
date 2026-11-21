import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { assetPeopleOf, emptyAssetMapping, planLineMove, type Item, type ItemAsset, type ItemAssetInput, type TrackerAssetMapping, type TrackerColumn, type TrackerRow } from "@/domain";
import { createServices } from "@/services";

/**
 * A task whose assets are partly in its tracker sheet and partly its own: the
 * own ones move into the sheet (v0.134.0). Each becomes a row below what the
 * sheet holds and keeps its id and its dates; nothing already in the sheet is
 * written over, and nothing a line holds goes without being listed first.
 */
describe("moving a task's own assets into its linked sheet", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let item: Item;
  const actor = SEED_USER_IDS.jun;
  const B1 = "00000000-0000-4000-8000-0000000000b1";

  const columns: TrackerColumn[] = [
    { id: "n", name: "Asset", type: "text", width: 200 },
    { id: "t", name: "Type", type: "list", width: 120, options: ["Print"] },
    { id: "q", name: "Qty", type: "number", width: 80 },
    { id: "p", name: "Platform", type: "list", width: 120, options: ["Web", "Print"] },
    { id: "d", name: "Due", type: "date", width: 100 },
    { id: "s", name: "Status", type: "list", width: 100, options: ["Doing", "Done"] },
  ];
  const rows: TrackerRow[] = [
    { id: "e1", kind: "data", cells: { n: "Existing one", t: "Print", q: 1, p: "Web", d: "2026-12-10", s: "Done" } },
    { id: "e2", kind: "data", cells: { n: "Existing two", p: "Print" } },
    { id: "x1", kind: "data", cells: {} },
    { id: "b1", kind: "section", label: "Print run", cells: {} },
    { id: "e3", kind: "data", cells: { n: "Existing poster", t: "Print" } },
  ];
  const baseMapping = (patch: Partial<TrackerAssetMapping> = {}): TrackerAssetMapping => ({ ...emptyAssetMapping(), name: "n", type: { columnId: "t", value: null }, quantity: { columnId: "q", value: null }, due: { columnId: "d", value: null }, done: { columnId: "s", values: ["Done"] }, spec: ["p"], ...patch });

  const own = (lines: Array<Partial<ItemAssetInput> & { name: string }>) =>
    repos.itemAssets.createMany(lines.map((line, i) => ({ itemId: item.id, boardId: item.boardId, position: i, createdBy: actor, ...line })));

  /** A linked sheet beside the task's own lines. */
  const linked = async (patch: { columns?: TrackerColumn[]; rows?: TrackerRow[]; mapping?: TrackerAssetMapping } = {}) => {
    const { sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Kit", layout: "blank", sheets: [{ name: "Kit", frozenColumns: 1, columns: patch.columns ?? columns, rows: patch.rows ?? rows }] }, actor);
    const { sheet } = await services.trackers.linkSheet(sheets[0]!.id, item.id, patch.mapping ?? baseMapping(), actor);
    return sheet;
  };

  const linesOf = async () => repos.itemAssets.listByItem(item.id);
  const sheetOf = (id: string) => services.trackers.getSheet(id);

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `move-into-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const board = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system)!;
    item = (await repos.items.listByBoard(board.id)).find((i) => !i.parentItemId)!;
    const existing = await repos.itemAssets.listByItem(item.id);
    if (existing.length) await repos.itemAssets.deleteMany(existing.map((a) => a.id));
  });

  it("each own line becomes a row below the sheet's, keeping its id and dates; the sheet's rows and lines stay as they were", async () => {
    const before = await own([
      { name: "Story tile", assetType: "Social", quantity: 2, dueDate: "2026-12-01", completedAt: "2026-11-01T00:00:00.000Z" },
      { name: "A1 poster", assetType: "Print", quantity: 6, blockId: B1, blockName: "Print run" },
    ]);
    const sheet = await linked();
    const sheetLinesBefore = (await linesOf()).filter((l) => l.trackerSheetId);
    expect(sheetLinesBefore.map((l) => l.name).sort()).toEqual(["Existing one", "Existing poster", "Existing two"]);

    const { moved, kept } = await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    expect([moved, kept]).toEqual([2, 0]);

    const after = await linesOf();
    expect(after.every((l) => l.trackerSheetId === sheet.id)).toBe(true);
    expect(after).toHaveLength(5);
    // The same lines, not copies: ids, when added, when done.
    for (const line of before) {
      const now = after.find((l) => l.id === line.id)!;
      expect(now).toBeDefined();
      expect(now.createdAt).toBe(line.createdAt);
      expect(now.completedAt).toBe(line.completedAt);
    }
    // The sheet's own lines are untouched too.
    for (const line of sheetLinesBefore) expect(after.find((l) => l.id === line.id)?.name).toBe(line.name);

    const saved = await sheetOf(sheet.id);
    const byId = new Map(saved.rows.map((r) => [r.id, r]));
    for (const row of rows) expect(byId.get(row.id)?.cells).toEqual(row.cells);
    const name = (r: TrackerRow) => (r.kind === "data" ? ((r.cells.n as string) ?? "·") : `band:${r.label}`);
    expect(saved.rows.map(name)).toEqual(["Existing one", "Existing two", "Story tile", "·", "band:Print run", "Existing poster", "A1 poster"]);
    // The type the dropdown lacked joins it; a done line writes the done choice.
    expect(saved.columns.find((c) => c.id === "t")!.options).toEqual(["Print", "Social"]);
    const tile = saved.rows.find((r) => r.cells.n === "Story tile")!;
    expect(tile.cells).toMatchObject({ t: "Social", q: 2, d: "2026-12-01", s: "Done" });
    const poster = after.find((l) => l.name === "A1 poster")!;
    expect(poster.blockName).toBe("Print run");
    // Nothing left to move: a second go does nothing.
    expect(await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor)).toMatchObject({ moved: 0, kept: 0 });
  });

  it("a part the sheet fills for every row gets a column only for lines that differ; the rest take the value, as the plan says", async () => {
    await own([
      { name: "Course page", quantity: 1 },
      { name: "Banner", assetType: "Display ads", quantity: 1 },
    ]);
    const mapping = baseMapping({ type: { columnId: null, value: "Website Copy" }, quantity: { columnId: null, value: 1 } });
    const cols = columns.filter((c) => c.id !== "t" && c.id !== "q");
    const sheet = await linked({ columns: cols, rows: [{ id: "e1", kind: "data", cells: { n: "Existing page" } }], mapping });

    const plan = planLineMove(sheet, sheet.assetMapping!, (await linesOf()).filter((l) => !l.trackerSheetId), []);
    expect(plan.blockers).toEqual([]);
    expect(plan.newColumns).toEqual(["Type"]); // no Quantity: every line has the 1 the sheet gives anyway
    expect(plan.fills).toEqual([{ part: "type", count: 1, value: "Website Copy" }]);

    await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    const lines = await linesOf();
    const typeOf = (n: string) => lines.find((l) => l.name === n)!.assetType;
    expect([typeOf("Existing page"), typeOf("Course page"), typeOf("Banner")]).toEqual(["Website Copy", "Website Copy", "Display ads"]);
    expect(lines.every((l) => l.quantity === 1)).toBe(true);
    const saved = await sheetOf(sheet.id);
    expect(saved.columns.map((c) => c.name)).toEqual([...cols.map((c) => c.name), "Type"]);
    expect(saved.assetMapping!.type).toMatchObject({ value: "Website Copy" });
  });

  it("refuses, writing nothing, when a column cannot hold what the lines have", async () => {
    await own([{ name: "Poster", dueDate: "2026-12-01" }]);
    const cols = columns.map((c) => (c.id === "d" ? { ...c, name: "Approved", type: "checkbox" as const } : c));
    const sheet = await linked({ columns: cols, rows: [{ id: "e1", kind: "data", cells: { n: "Existing", d: true } }] });
    const before = await sheetOf(sheet.id);
    await expect(services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor)).rejects.toThrow("“Approved” is a Checkbox column and can't hold dates. Change it in the sheet first.");
    const after = await sheetOf(sheet.id);
    expect(after.rows).toEqual(before.rows);
    expect(after.columns).toEqual(before.columns);
    expect((await linesOf()).filter((l) => !l.trackerSheetId).map((l) => l.name)).toEqual(["Poster"]);
  });

  it("refuses a done line when no choice of the Done dropdown means done", async () => {
    await own([{ name: "Poster", completedAt: "2026-11-01T00:00:00.000Z" }]);
    const sheet = await linked({ mapping: baseMapping({ done: { columnId: "s", values: [] } }) });
    await expect(services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor)).rejects.toThrow(/No choice in “Status” means done/);
  });

  it("writes people by name into a text PIC column, and says who it cannot name", async () => {
    await own([{ name: "Poster", assigneeIds: [SEED_USER_IDS.emily, SEED_USER_IDS.jun] }]);
    const cols = [...columns, { id: "w", name: "Writer", type: "text" as const, width: 120 }];
    const sheet = await linked({ columns: cols, mapping: baseMapping({ pic: { columnId: "w", value: null } }) });
    const people = assetPeopleOf(await repos.users.list());
    const line = (await linesOf()).find((l) => !l.trackerSheetId)!;
    expect(planLineMove(sheet, sheet.assetMapping!, [line], people).unnamedPeople).toBeNull();
    expect(planLineMove(sheet, sheet.assetMapping!, [{ ...line, assigneeIds: ["00000000-0000-4000-8000-00000000dead"] }], people).unnamedPeople).toEqual({ column: "Writer", count: 1 });

    await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    const moved = (await linesOf()).find((l) => l.id === line.id)!;
    expect(moved.trackerSheetId).toBe(sheet.id);
    expect([...moved.assigneeIds].sort()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.jun].sort());
    const row = (await sheetOf(sheet.id)).rows.find((r) => r.cells.n === "Poster")!;
    expect(typeof row.cells.w).toBe("string");
  });

  it("keeps every link, a column each, and puts notes in a column of their own rather than the Platform", async () => {
    await own([
      {
        name: "Poster",
        notes: "CMYK, 3mm bleed",
        links: [
          { id: "l1", label: "Drive", url: "https://example.com/a", icon: "link" },
          { id: "l2", label: "Proof", url: "https://example.com/b", icon: "link" },
        ],
      },
    ]);
    const sheet = await linked();
    const lines = (await linesOf()).filter((l) => !l.trackerSheetId);
    const plan = planLineMove(sheet, sheet.assetMapping!, lines, []);
    expect(plan.newColumns).toEqual(["Link", "Link 2", "Notes"]);
    expect(plan.renamedLinks).toBe(2);

    await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    const saved = await sheetOf(sheet.id);
    const row = saved.rows.find((r) => r.cells.n === "Poster")!;
    expect(row.cells.p).toBeUndefined();
    const moved = (await linesOf()).find((l) => l.name === "Poster")!;
    expect(moved.links.map((l) => l.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(moved.notes).toContain("CMYK, 3mm bleed");
    // The existing rows' spec reads as before: the new Notes cell is empty for them.
    expect((await linesOf()).find((l) => l.name === "Existing one")!.notes).toBe("Platform: Web");
  });

  it("lists block links, which a band cannot hold", async () => {
    await own([{ name: "Poster", blockId: B1, blockName: "Print run", blockLinks: [{ id: "k", label: "Folder", url: "https://example.com/f", icon: "folder" }] }]);
    const sheet = await linked();
    const plan = planLineMove(sheet, sheet.assetMapping!, (await linesOf()).filter((l) => !l.trackerSheetId), []);
    expect(plan.blockLinks).toEqual(["Print run"]);
    expect(plan.blockers).toEqual([]);
  });

  it("a line changed while it moves stays on the task as it now is, and its row leaves the sheet", async () => {
    const [first, second] = await own([{ name: "Stays" }, { name: "Moves" }]);
    const sheet = await linked();
    const attach = repos.itemAssets.attachToSheet.bind(repos.itemAssets);
    repos.itemAssets.attachToSheet = async (sheetId, pairs) => {
      // Somebody renames a line on the task just before it is taken.
      await new Promise((r) => setTimeout(r, 5));
      await repos.itemAssets.update(first!.id, { name: "Renamed meanwhile" });
      return attach(sheetId, pairs);
    };
    const { moved, kept } = await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    expect([moved, kept]).toEqual([1, 1]);
    const lines = await linesOf();
    expect(lines.find((l) => l.id === first!.id)).toMatchObject({ name: "Renamed meanwhile", trackerSheetId: null });
    expect(lines.find((l) => l.id === second!.id)?.trackerSheetId).toBe(sheet.id);
    const names = (await sheetOf(sheet.id)).rows.map((r) => r.cells.n).filter(Boolean);
    expect(names).toEqual(["Existing one", "Existing two", "Moves", "Existing poster"]);
    // No line was made for the row that went.
    expect(lines.filter((l) => l.name === "Stays")).toHaveLength(0);
  });

  it("a save of the sheet in the middle of the move leaves no duplicates", async () => {
    const before = await own([{ name: "Poster" }, { name: "Flyer" }]);
    const sheet = await linked();
    const update = repos.trackers.updateSheetIfCurrent.bind(repos.trackers);
    let once = true;
    repos.trackers.updateSheetIfCurrent = async (...args) => {
      const saved = await update(...args);
      // Somebody else's save reads the new rows into fresh lines before the move hands them the task's.
      if (saved && once) {
        once = false;
        await services.assets.syncFromSheet(saved, actor);
      }
      return saved;
    };
    const { moved } = await services.trackers.moveTaskAssetsIntoSheet(sheet.id, actor);
    expect(moved).toBe(2);
    const lines = await linesOf();
    expect(lines.map((l) => l.name).sort()).toEqual(["Existing one", "Existing poster", "Existing two", "Flyer", "Poster"]);
    expect(before.every((b) => lines.some((l) => l.id === b.id && l.trackerSheetId === sheet.id))).toBe(true);
  });

  it("only the task's own lines move: a sheet's lines and nothing else are touched, and a sheet holding no task refuses", async () => {
    const { sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Loose", layout: "blank", sheets: [{ name: "S", frozenColumns: 1, columns, rows }] }, actor);
    await expect(services.trackers.moveTaskAssetsIntoSheet(sheets[0]!.id, actor)).rejects.toThrow("This sheet holds no task's assets.");
  });

  it("linking with the move keeps the lines too: same ids, same dates", async () => {
    const before = await own([{ name: "Poster", completedAt: "2026-10-01T00:00:00.000Z" }]);
    const { sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Kit", layout: "blank", sheets: [{ name: "Kit", frozenColumns: 1, columns, rows }] }, actor);
    const { moved } = await services.trackers.linkSheet(sheets[0]!.id, item.id, baseMapping(), actor, { moveAssets: true });
    expect(moved).toBe(1);
    const line = (await linesOf()).find((l) => l.id === before[0]!.id) as ItemAsset;
    expect(line).toMatchObject({ trackerSheetId: sheets[0]!.id, completedAt: "2026-10-01T00:00:00.000Z", createdAt: before[0]!.createdAt });
  });
});
