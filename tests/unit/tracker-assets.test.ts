import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { asUuid, coercePeople, emptyAssetMapping, mergeSheets, setTrackerPeople, sheetAssetLines, suggestAssetMapping, type TrackerColumn, type TrackerRow, type TrackerSheet } from "@/domain";
import { createServices } from "@/services";
import { TrackerService } from "@/services/tracker-service";
import { sheetsToWorkbook, workbookToSheets } from "@/services/tracker-xlsx";

const col = (id: string, name: string, type: TrackerColumn["type"], extra: Partial<TrackerColumn> = {}): TrackerColumn => ({ id, name, type, width: 120, ...extra });
const data = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
const band = (id: string, label: string, kind: "section" | "subsection" = "section"): TrackerRow => ({ id, kind, label, cells: {} });

const COLUMNS = [
  col("c-asset", "Asset", "text"),
  col("c-type", "Type", "list", { options: ["Social post", "Banner"] }),
  col("c-qty", "Qty", "number"),
  col("c-pic", "PIC", "person"),
  col("c-due", "Due date", "date"),
  col("c-status", "Status", "list", { options: ["Not started", "In progress", "Approved", "Delivered"] }),
  col("c-format", "Format", "text"),
  col("c-link", "Final artwork", "url"),
];

describe("a sheet as assets", () => {
  it("guesses the mapping from the usual column names", () => {
    const m = suggestAssetMapping({ columns: COLUMNS });
    expect(m.name).toBe("c-asset");
    expect(m.type.columnId).toBe("c-type");
    expect(m.quantity.columnId).toBe("c-qty");
    expect(m.pic.columnId).toBe("c-pic");
    expect(m.due.columnId).toBe("c-due");
    expect(m.done).toEqual({ columnId: "c-status", values: ["Approved", "Delivered"] });
    expect(m.spec).toEqual(["c-format"]);
    expect(m.links).toEqual(["c-link"]);
  });

  it("turns rows into lines: bands as blocks, blank rows skipped, values filling empty cells", () => {
    const mapping = { ...suggestAssetMapping({ columns: COLUMNS }), pic: { columnId: "c-pic", value: ["u-jane"] }, due: { columnId: "c-due", value: "2026-11-30" }, quantity: { columnId: "c-qty", value: 1 } };
    const rows = [
      band("b1", "Phase 1"),
      data("r1", { "c-asset": "Hero tile", "c-type": "Social post", "c-qty": 3.4, "c-pic": "u-tom,u-mai", "c-due": "2026-11-02", "c-status": "Delivered", "c-format": "1080x1080", "c-link": "https://x.test/a" }),
      data("r2", { "c-asset": "Banner A" }),
      data("r3", {}),
      band("b2", "Channel: Web", "subsection"),
      data("r4", { "c-type": "Banner", "c-status": "In progress" }),
    ];
    const lines = sheetAssetLines({ columns: COLUMNS, rows }, mapping);
    expect(lines.map((l) => l.rowId)).toEqual(["r1", "r2", "r4"]);
    expect(lines[0]).toMatchObject({ name: "Hero tile", assetType: "Social post", quantity: 3, assigneeIds: ["u-tom", "u-mai"], dueDate: "2026-11-02", done: true, notes: "Format: 1080x1080", blockId: asUuid("b1"), blockName: "Phase 1" });
    // A band's id is stored as a uuid, the same one every time.
    expect(lines[0]!.blockId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(asUuid("b1")).toBe(asUuid("b1"));
    expect(asUuid("b1")).not.toBe(asUuid("b2"));
    expect(lines[0]!.links).toEqual([{ id: "col-c-link", label: "Final artwork", url: "https://x.test/a", icon: "link" }]);
    expect(lines[1]).toMatchObject({ name: "Banner A", assetType: null, quantity: 1, assigneeIds: ["u-jane"], dueDate: "2026-11-30", done: false });
    // A row with only a type is named by it.
    expect(lines[2]).toMatchObject({ name: "Banner", assetType: "Banner", blockId: asUuid("b2"), blockName: "Channel: Web", done: false });
  });

  it("reads people from a text column by name, first name or email", () => {
    const columns = [col("n", "Asset", "text"), col("p", "Designer", "text"), col("d", "Done", "checkbox")];
    const mapping = { ...emptyAssetMapping(), name: "n", pic: { columnId: "p", value: null }, done: { columnId: "d", values: [] } };
    const people = [
      { id: "u1", name: "Jane Morrison", email: "jane@x.test" },
      { id: "u2", name: "Tom Hartley", email: "tom@x.test" },
    ];
    const lines = sheetAssetLines({ columns, rows: [data("a", { n: "One", p: "jane, TOM", d: true }), data("b", { n: "Two", p: "tom@x.test & Nobody" })] }, mapping, people);
    expect(lines.map((l) => [l.assigneeIds, l.done])).toEqual([
      [["u1", "u2"], true],
      [["u2"], false],
    ]);
    expect(coercePeople("Jane Morrison, u2", people)).toBe("u1,u2");
  });

  it("knows the usual other names for quantity and done", () => {
    const m = suggestAssetMapping({ columns: [col("a", "Deliverable", "text"), col("v", "Versions", "number"), col("s", "Signed off", "checkbox")] });
    expect(m.name).toBe("a");
    expect(m.quantity.columnId).toBe("v");
    expect(m.done.columnId).toBe("s");
  });

  it("is used only when it can name a line", () => {
    expect(sheetAssetLines({ columns: COLUMNS, rows: [data("r", { "c-asset": "X" })] }, emptyAssetMapping())).toEqual([]);
  });
});

describe("merging two people's edits to one sheet", () => {
  const base: Pick<TrackerSheet, "columns" | "rows" | "frozenColumns"> = {
    columns: [col("a", "A", "text"), col("b", "B", "text")],
    rows: [data("1", { a: "one" }), data("2", { a: "two" }), data("3", { a: "three" })],
    frozenColumns: 1,
  };

  it("keeps both sides' cells, rows and columns", () => {
    const mine = { ...base, rows: [data("1", { a: "ONE" }), data("2", { a: "two" }), data("3", { a: "three" }), data("4", { a: "mine" })] };
    const theirs = { ...base, columns: [...base.columns, col("c", "C", "number")], rows: [data("1", { a: "one", b: "theirs" }), data("2", { a: "TWO" }), data("3", { a: "three" })] };
    const merged = mergeSheets(base, mine, theirs);
    expect(merged.columns.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(merged.rows.map((r) => [r.id, r.cells])).toEqual([
      ["1", { a: "ONE", b: "theirs" }],
      ["2", { a: "TWO" }],
      ["3", { a: "three" }],
      ["4", { a: "mine" }],
    ]);
  });

  it("lets a deletion on either side stand, with the deleted column's cells", () => {
    const mine = { ...base, rows: base.rows.filter((r) => r.id !== "2") };
    const theirs = { ...base, columns: [base.columns[0]!], rows: [data("1", { a: "one" }), data("2", { a: "two" }), data("3", { a: "three", b: "gone" })] };
    const merged = mergeSheets(base, mine, theirs);
    expect(merged.rows.map((r) => r.id)).toEqual(["1", "3"]);
    expect(merged.columns.map((c) => c.id)).toEqual(["a"]);
    expect(merged.rows[1]!.cells).toEqual({ a: "three" });
  });

  it("prefers this side when both changed the same cell, and keeps a reorder", () => {
    const mine = { ...base, rows: [data("3", { a: "three" }), data("1", { a: "mine" }), data("2", { a: "two" })] };
    const theirs = { ...base, rows: [data("1", { a: "theirs" }), data("2", { a: "two" }), data("3", { a: "three" })] };
    const merged = mergeSheets(base, mine, theirs);
    expect(merged.rows.map((r) => [r.id, r.cells.a])).toEqual([
      ["3", "three"],
      ["1", "mine"],
      ["2", "two"],
    ]);
  });
});

let counter = 0;

describe("a linked sheet keeps the task's assets", () => {
  let services: ReturnType<typeof createServices>;
  let itemId: string;
  let otherItemId: string;
  let sheet: TrackerSheet;

  beforeEach(async () => {
    counter += 1;
    const repos = createLocalRepositories({ databaseName: `tracker-assets-${Date.now()}-${counter}` });
    services = createServices(repos);
    const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.system);
    const items = await repos.items.listByBoard(boards[0]!.id);
    const top = items.filter((i) => !i.parentItemId);
    itemId = top[0]!.id;
    otherItemId = top[1]!.id;
    const created = await services.trackers.create(
      {
        workspaceId: SEED_WORKSPACE_ID,
        teamId: SEED_TEAM_IDS.digital,
        name: "Kit",
        layout: "blank",
        sheets: [
          {
            name: "Assets",
            columns: COLUMNS,
            frozenColumns: 1,
            rows: [
              band("b1", "Social"),
              data("r1", { "c-asset": "Tile 1", "c-type": "Social post", "c-qty": 2, "c-pic": SEED_USER_IDS.jun, "c-due": "2026-11-02", "c-status": "In progress" }),
              data("r2", { "c-asset": "Tile 2", "c-type": "Social post" }),
              data("r3", {}),
            ],
          },
        ],
      },
      SEED_USER_IDS.jun,
    );
    sheet = created.sheets[0]!;
  });

  const sheetLines = async () => (await services.assets.list(itemId)).filter((a) => a.trackerSheetId === sheet.id);

  it("links, writes one line a row, and keeps them in step with every save", async () => {
    const { sync } = await services.trackers.linkSheet(sheet.id, itemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun);
    expect(sync).toEqual({ added: 2, updated: 0, removed: 0 });
    let lines = await sheetLines();
    expect(lines.map((l) => [l.trackerRowId, l.name, l.quantity, l.assigneeIds, l.blockName, l.completedAt])).toEqual([
      ["r1", "Tile 1", 2, [SEED_USER_IDS.jun], "Social", null],
      ["r2", "Tile 2", null, [], "Social", null],
    ]);
    const firstId = lines[0]!.id;

    // Rename a row, finish it, drop the other, add a third.
    let current = (await services.trackers.getSheet(sheet.id))!;
    const edited = TrackerService.applyEdits(current, [
      { rowId: "r1", columnId: "c-asset", value: "Tile one" },
      { rowId: "r1", columnId: "c-status", value: "Delivered" },
      { rowId: "r3", columnId: "c-asset", value: "Story" },
    ]);
    const result = await services.trackers.saveSheetDraft(sheet.id, { rows: edited.rows.filter((r) => r.id !== "r2") }, current.updatedAt, SEED_USER_IDS.jun);
    expect("sync" in result && result.sync).toEqual({ added: 1, updated: 1, removed: 1 });
    lines = await sheetLines();
    expect(lines.map((l) => [l.trackerRowId, l.name, !!l.completedAt])).toEqual([
      ["r1", "Tile one", true],
      ["r3", "Story", false],
    ]);
    expect(lines[0]!.id).toBe(firstId);

    // A save that changes nothing a line shows writes nothing.
    current = (await services.trackers.getSheet(sheet.id))!;
    const again = await services.trackers.saveSheetDraft(sheet.id, { frozenColumns: 2 }, current.updatedAt, SEED_USER_IDS.jun);
    expect("sync" in again && again.sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("refuses a stale save and hands back the sheet to merge with", async () => {
    const stale = (await services.trackers.getSheet(sheet.id))!;
    await services.trackers.saveSheetDraft(sheet.id, { frozenColumns: 3 }, stale.updatedAt, SEED_USER_IDS.jun);
    const result = await services.trackers.saveSheetDraft(sheet.id, { frozenColumns: 4 }, stale.updatedAt, SEED_USER_IDS.jun);
    expect("conflict" in result && result.conflict.frozenColumns).toBe(3);
  });

  it("ticks the sheet's row when the line is ticked on the task, and refuses other edits there", async () => {
    await services.trackers.linkSheet(sheet.id, itemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun);
    const [line] = await sheetLines();
    await services.assets.update(line!.id, { completedAt: new Date().toISOString() }, SEED_USER_IDS.jun);
    const after = (await services.trackers.getSheet(sheet.id))!;
    expect(after.rows.find((r) => r.id === "r1")!.cells["c-status"]).toBe("Approved");
    expect((await sheetLines())[0]!.completedAt).not.toBeNull();
    await services.assets.update(line!.id, { completedAt: null }, SEED_USER_IDS.jun);
    expect((await services.trackers.getSheet(sheet.id))!.rows.find((r) => r.id === "r1")!.cells["c-status"]).toBeUndefined();

    await expect(services.assets.update(line!.id, { name: "Renamed" }, SEED_USER_IDS.jun)).rejects.toThrow(/tracker sheet/);
    await expect(services.assets.remove(line!.id, itemId, line!.boardId, SEED_USER_IDS.jun)).rejects.toThrow(/tracker sheet/);
  });

  it("keeps one task a sheet and one sheet a task", async () => {
    await services.trackers.linkSheet(sheet.id, itemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun);
    await expect(services.trackers.linkSheet(sheet.id, otherItemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun)).rejects.toThrow(/already holds the assets/);
    const second = await services.trackers.addSheet(sheet.trackerId, "Second", "duplicate", sheet.id);
    expect(second.itemId ?? null).toBeNull();
    expect(second.rows.find((r) => r.kind === "data")!.cells["c-asset"]).toBe("Tile 1");
    await expect(services.trackers.linkSheet(second.id, itemId, suggestAssetMapping(second), SEED_USER_IDS.jun)).rejects.toThrow(/already takes its assets/);
  });

  it("takes the lines off when the sheet is unlinked or deleted, and leaves the task's own lines alone", async () => {
    await services.assets.add({ itemId, boardId: (await services.repos.items.getById(itemId))!.boardId, name: "Hand-made line" }, SEED_USER_IDS.jun);
    await services.trackers.linkSheet(sheet.id, itemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun);
    expect(await sheetLines()).toHaveLength(2);
    await services.trackers.unlinkSheet(sheet.id, SEED_USER_IDS.jun);
    expect(await sheetLines()).toHaveLength(0);
    expect((await services.assets.list(itemId)).map((a) => a.name)).toContain("Hand-made line");

    await services.trackers.linkSheet(sheet.id, itemId, suggestAssetMapping(sheet), SEED_USER_IDS.jun);
    await services.trackers.addSheet(sheet.trackerId, "Spare", "blank");
    await services.trackers.deleteSheet(sheet.id, SEED_USER_IDS.jun);
    expect(await sheetLines()).toHaveLength(0);
  });

  it("feeds the task's PIC from the sheet's people, as lines added by hand do", async () => {
    await services.trackers.linkSheet(sheet.id, itemId, { ...suggestAssetMapping(sheet), pic: { columnId: "c-pic", value: [SEED_USER_IDS.emily] } }, SEED_USER_IDS.jun);
    const people = new Set((await sheetLines()).flatMap((l) => l.assigneeIds));
    expect([...people].sort()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.jun].sort());
  });
});

describe("an asset sheet in Excel", () => {
  it("exports People as names, and the names map back to the same people on import", async () => {
    const people = [
      { id: "00000001-0000-4000-8000-0000000000a1", name: "Jane Morrison", email: "jane@x.test" },
      { id: "00000001-0000-4000-8000-0000000000b2", name: "Tom Hartley", email: "tom@x.test" },
    ];
    setTrackerPeople(people);
    const sheet = {
      id: "s",
      trackerId: "t",
      name: "Assets",
      position: 0,
      createdAt: "",
      updatedAt: "",
      frozenColumns: 1,
      columns: COLUMNS,
      rows: [band("b1", "Social"), data("r1", { "c-asset": "Tile", "c-type": "Social post", "c-qty": 4, "c-pic": `${people[0]!.id},${people[1]!.id}`, "c-due": "2026-11-02", "c-status": "Delivered", "c-link": "https://x.test/a" })],
    } as TrackerSheet;
    const bytes = await sheetsToWorkbook("Kit", [sheet]);
    const { sheets } = await workbookToSheets(bytes);
    const back = sheets[0]!;
    const pic = back.columns.find((c) => c.name === "PIC")!;
    const row = back.rows.find((r) => r.kind === "data")!;
    // Readable in Excel: names, not ids.
    expect(row.cells[pic.id]).toBe("Jane Morrison, Tom Hartley");
    expect(back.rows.find((r) => r.kind !== "data")?.label).toBe("Social");
    // …and still an asset sheet once imported: the guessed mapping reads the names as people.
    const lines = sheetAssetLines(back, suggestAssetMapping(back), people);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Tile", assetType: "Social post", quantity: 4, assigneeIds: people.map((p) => p.id), dueDate: "2026-11-02", done: true });
    setTrackerPeople([]);
  });
});
