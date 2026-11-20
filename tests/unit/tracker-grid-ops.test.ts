import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { TRACKER_COLUMN_TYPES, mergeSheets, setTrackerPeople, suggestAssetMapping, type TrackerCellValue, type TrackerColumn, type TrackerRow, type TrackerSheet } from "@/domain";
import { formatCell, frozenOffsets, pasteBlock, rangeToTsv } from "@/features/trackers/grid-model";
import { summarize, summaryKindsFor } from "@/features/trackers/sheet-view";
import { DOMESTIC_CAMPAIGNS_COLUMNS, DOMESTIC_CAMPAIGNS_FROZEN, assetSheet, blankSheet, emptyTemplateSheet } from "@/features/trackers/tracker-template";
import { createServices } from "@/services";
import { TrackerService } from "@/services/tracker-service";

/*
 * The tracker grid's structure edits (rows, columns, types, sheets) and saving.
 * Every pure operation runs on a deep-frozen sheet, so any mutation of its input
 * throws, and is checked against a snapshot taken before.
 *
 * Tests marked `it("was a bug, fixed: …")` document behaviour that is wrong today: they
 * pass while the bug is there and start failing once it is fixed.
 */

// ---- fixtures ---------------------------------------------------------------------

const col = (id: string, name: string, type: TrackerColumn["type"] = "text", extra: Partial<TrackerColumn> = {}): TrackerColumn => ({ id, name, type, width: 120, ...extra });
const data = (id: string, cells: TrackerRow["cells"] = {}): TrackerRow => ({ id, kind: "data", cells });
const band = (id: string, label: string, kind: "section" | "subsection" = "section"): TrackerRow => ({ id, kind, label, cells: {} });

function makeSheet(columns: TrackerColumn[], rows: TrackerRow[], frozenColumns = 1): TrackerSheet {
  return { id: "s", trackerId: "t", name: "Sheet", position: 0, columns, rows, frozenColumns, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** A frozen sheet plus its snapshot, so tests can assert the input never changed. */
function frozenSheet(columns: TrackerColumn[], rows: TrackerRow[], frozenColumns = 1): { sheet: TrackerSheet; snapshot: TrackerSheet } {
  const sheet = makeSheet(columns, rows, frozenColumns);
  const snapshot = structuredClone(sheet);
  return { sheet: deepFreeze(sheet), snapshot };
}

const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);
const allUnique = (list: string[]) => new Set(list).size === list.length;

/** A five-column sheet: name, status (dropdown), qty, done, due; a band, three rows, a subsection, one row. */
function standard() {
  return frozenSheet(
    [
      col("name", "Asset"),
      col("status", "Status", "list", { options: ["Open", "Done"], optionColors: { Open: "FFC7CE", Done: "C6EFCE" } }),
      col("qty", "Qty", "number", { summary: "sum", numberFormat: "integer" }),
      col("done", "Done", "checkbox"),
      col("due", "Due", "date"),
    ],
    [
      band("b1", "Phase 1"),
      data("r1", { name: "Banner", status: "Open", qty: 2, done: true, due: "2026-11-02" }),
      data("r2", { name: "Video", status: "Done", qty: "5" }),
      data("r3", {}),
      band("b2", "Web", "subsection"),
      data("r4", { name: "Poster", qty: 3, done: false }),
    ],
    2,
  );
}

// ---- rows ---------------------------------------------------------------------------

describe("insertRows", () => {
  it("inserts at the start, middle and end without touching the input", () => {
    const { sheet, snapshot } = standard();
    const atStart = TrackerService.insertRows(sheet, 0);
    expect(atStart.rows).toHaveLength(7);
    expect(atStart.rows[0]).toMatchObject({ kind: "data", cells: {} });
    expect(ids(atStart.rows.slice(1))).toEqual(ids(sheet.rows));

    const middle = TrackerService.insertRows(sheet, 3, 2);
    expect(ids(middle.rows).slice(0, 3)).toEqual(["b1", "r1", "r2"]);
    expect(ids(middle.rows).slice(5)).toEqual(["r3", "b2", "r4"]);

    const atEnd = TrackerService.insertRows(sheet, sheet.rows.length);
    expect(atEnd.rows[6]!.kind).toBe("data");
    expect(sheet).toEqual(snapshot);
  });

  it("clamps an out-of-range index to the ends", () => {
    const { sheet } = standard();
    expect(TrackerService.insertRows(sheet, -5).rows[0]!.id).not.toBe("b1");
    expect(TrackerService.insertRows(sheet, -5).rows[1]!.id).toBe("b1");
    const far = TrackerService.insertRows(sheet, 999);
    expect(far.rows).toHaveLength(7);
    expect(ids(far.rows).slice(0, 6)).toEqual(ids(sheet.rows));
  });

  it("gives every new row a fresh, unique id, even many at once", () => {
    const { sheet } = standard();
    let next = TrackerService.insertRows(sheet, 2, 50);
    next = TrackerService.insertRows(next, 0, 25);
    expect(next.rows).toHaveLength(81);
    expect(allUnique(ids(next.rows))).toBe(true);
  });

  it("inserts bands with an empty label and no cells; a count of 0 adds nothing", () => {
    const { sheet } = standard();
    const withBand = TrackerService.insertRows(sheet, 1, 1, "subsection");
    expect(withBand.rows[1]).toMatchObject({ kind: "subsection", label: "", cells: {} });
    const data = TrackerService.insertRows(sheet, 1, 1, "data");
    expect("label" in data.rows[1]!).toBe(false);
    expect(TrackerService.insertRows(sheet, 1, 0).rows).toEqual(sheet.rows);
  });
});

describe("deleteRows", () => {
  it("removes the chosen rows, ignoring unknown ids, and leaves the rest in order", () => {
    const { sheet, snapshot } = standard();
    const next = TrackerService.deleteRows(sheet, ["r2", "b2", "nope"]);
    expect(ids(next.rows)).toEqual(["b1", "r1", "r3", "r4"]);
    expect(sheet).toEqual(snapshot);
  });

  it("never leaves an empty sheet: deleting every row leaves one blank data row", () => {
    const { sheet } = standard();
    const next = TrackerService.deleteRows(sheet, ids(sheet.rows));
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toMatchObject({ kind: "data", cells: {} });
    expect(ids(sheet.rows)).not.toContain(next.rows[0]!.id);
  });

  it("current behaviour: deleting every data row but keeping the bands leaves no data row at all", () => {
    const { sheet } = standard();
    const next = TrackerService.deleteRows(sheet, ["r1", "r2", "r3", "r4"]);
    expect(next.rows.map((r) => r.kind)).toEqual(["section", "subsection"]);
  });
});

describe("duplicateRows", () => {
  it("puts each copy straight after its original with a new id and its own cells", () => {
    const { sheet, snapshot } = standard();
    const next = TrackerService.duplicateRows(sheet, ["r1", "r4"]);
    expect(next.rows).toHaveLength(8);
    expect(ids(next.rows).slice(0, 2)).toEqual(["b1", "r1"]);
    const copy = next.rows[2]!;
    expect(copy.id).not.toBe("r1");
    expect(copy.cells).toEqual(sheet.rows[1]!.cells);
    expect(copy.cells).not.toBe(sheet.rows[1]!.cells);
    expect(next.rows[7]!.cells).toEqual({ name: "Poster", qty: 3, done: false });
    expect(allUnique(ids(next.rows))).toBe(true);
    expect(sheet).toEqual(snapshot);
  });

  it("copies a band with its kind and label, and stays unique when duplicated again", () => {
    const { sheet } = standard();
    let next = TrackerService.duplicateRows(sheet, ["b2"]);
    expect(next.rows[5]).toMatchObject({ kind: "subsection", label: "Web", cells: {} });
    next = TrackerService.duplicateRows(next, ids(next.rows));
    expect(next.rows).toHaveLength(14);
    expect(allUnique(ids(next.rows))).toBe(true);
  });

  it("does nothing for unknown ids, and a repeated id duplicates once", () => {
    const { sheet } = standard();
    expect(ids(TrackerService.duplicateRows(sheet, ["nope"]).rows)).toEqual(ids(sheet.rows));
    expect(TrackerService.duplicateRows(sheet, ["r1", "r1"]).rows).toHaveLength(7);
  });
});

describe("setRowKind and setRowLabel", () => {
  it("turns a data row into a band labelled with its first typed text, dropping its cells", () => {
    const { sheet, snapshot } = frozenSheet([col("a", "A"), col("n", "N", "number"), col("b", "B")], [data("r", { n: 5, a: "  ", b: "Label me" }), data("e", { n: 7 })]);
    const next = TrackerService.setRowKind(sheet, ["r", "e"], "section");
    expect(next.rows[0]).toEqual({ id: "r", kind: "section", label: "Label me", cells: {} });
    // Numbers are never promoted; with nothing to promote the label is empty.
    expect(next.rows[1]).toEqual({ id: "e", kind: "section", label: "", cells: {} });
    expect(sheet).toEqual(snapshot);
  });

  it("was a bug, fixed: promotes the first cell typed, not the leftmost column's cell", () => {
    // Column B was typed into before column A, so it comes first in the cells object.
    const { sheet } = frozenSheet([col("a", "A"), col("b", "B")], [data("r", { b: "right", a: "left" })]);
    const next = TrackerService.setRowKind(sheet, ["r"], "section");
    expect(next.rows[0]!.label).toBe("left");
  });

  it("turns a band back into an empty data row without its label, and keeps the label between band kinds", () => {
    const { sheet } = standard();
    const toData = TrackerService.setRowKind(sheet, ["b1"], "data");
    expect(toData.rows[0]).toEqual({ id: "b1", kind: "data", cells: {} });
    const toSub = TrackerService.setRowKind(sheet, ["b1"], "subsection");
    expect(toSub.rows[0]).toEqual({ id: "b1", kind: "subsection", label: "Phase 1", cells: {} });
  });

  it("relabels a band, ignores unknown ids, and (current behaviour) also labels a data row", () => {
    const { sheet, snapshot } = standard();
    expect(TrackerService.setRowLabel(sheet, "b2", "Social").rows[4]!.label).toBe("Social");
    expect(TrackerService.setRowLabel(sheet, "nope", "x").rows).toEqual(sheet.rows);
    expect(TrackerService.setRowLabel(sheet, "r1", "stray").rows[1]).toMatchObject({ kind: "data", label: "stray" });
    expect(sheet).toEqual(snapshot);
  });
});

describe("moveRows", () => {
  it("moves to the first and last position, with the index counted after the moving rows are taken out", () => {
    const { sheet, snapshot } = standard();
    expect(ids(TrackerService.moveRows(sheet, ["r4"], 0).rows)).toEqual(["r4", "b1", "r1", "r2", "r3", "b2"]);
    expect(ids(TrackerService.moveRows(sheet, ["b1"], 5).rows)).toEqual(["r1", "r2", "r3", "b2", "r4", "b1"]);
    expect(ids(TrackerService.moveRows(sheet, ["r1"], 2).rows)).toEqual(["b1", "r2", "r1", "r3", "b2", "r4"]);
    expect(sheet).toEqual(snapshot);
  });

  it("clamps out-of-range indexes and keeps a multi-row move in sheet order", () => {
    const { sheet } = standard();
    expect(ids(TrackerService.moveRows(sheet, ["r1"], 999).rows)).toEqual(["b1", "r2", "r3", "b2", "r4", "r1"]);
    expect(ids(TrackerService.moveRows(sheet, ["r1"], -3).rows)).toEqual(["r1", "b1", "r2", "r3", "b2", "r4"]);
    // Asked for in reverse, still moved as they stand in the sheet.
    expect(ids(TrackerService.moveRows(sheet, ["r4", "r1"], 0).rows)).toEqual(["r1", "r4", "b1", "r2", "r3", "b2"]);
  });

  it("does nothing for unknown ids and keeps every row exactly once", () => {
    const { sheet } = standard();
    expect(ids(TrackerService.moveRows(sheet, ["nope"], 0).rows)).toEqual(ids(sheet.rows));
    const moved = TrackerService.moveRows(sheet, ["r2", "b2", "r3"], 1);
    expect([...ids(moved.rows)].sort()).toEqual([...ids(sheet.rows)].sort());
  });
});

describe("applyEdits", () => {
  it("sets, overwrites and clears cells; a blank or null value removes the key", () => {
    const { sheet, snapshot } = standard();
    const next = TrackerService.applyEdits(sheet, [
      { rowId: "r1", columnId: "name", value: "Hero" },
      { rowId: "r1", columnId: "status", value: null },
      { rowId: "r2", columnId: "name", value: "" },
      { rowId: "r3", columnId: "qty", value: 0 },
    ]);
    expect(next.rows[1]!.cells).toEqual({ name: "Hero", qty: 2, done: true, due: "2026-11-02" });
    expect("name" in next.rows[2]!.cells).toBe(false);
    expect(next.rows[3]!.cells).toEqual({ qty: 0 });
    expect(sheet).toEqual(snapshot);
  });

  it("keeps an unticked box as false, applies edits to one cell in order, and leaves untouched rows as they were", () => {
    const { sheet } = standard();
    const next = TrackerService.applyEdits(sheet, [
      { rowId: "r1", columnId: "done", value: false },
      { rowId: "r2", columnId: "name", value: "first" },
      { rowId: "r2", columnId: "name", value: "second" },
      { rowId: "ghost", columnId: "name", value: "lost" },
    ]);
    expect(next.rows[1]!.cells.done).toBe(false);
    expect(next.rows[2]!.cells.name).toBe("second");
    expect(next.rows[3]).toBe(sheet.rows[3]);
    expect(next.rows).toHaveLength(sheet.rows.length);
  });

  it("drops an edit aimed at a band row or at a column the sheet has not got", () => {
    const { sheet } = standard();
    const next = TrackerService.applyEdits(sheet, [
      { rowId: "b1", columnId: "name", value: "inside a band" },
      { rowId: "r3", columnId: "deleted-col", value: "orphan" },
    ]);
    expect(next.rows[0]!.cells).toEqual(sheet.rows[0]!.cells);
    expect(next.rows[3]!.cells).toEqual(sheet.rows[3]!.cells);
  });
});

// ---- columns -----------------------------------------------------------------------

describe("insertColumn", () => {
  it("adds a 160px text column named after the column count, at the index asked for", () => {
    const { sheet, snapshot } = standard();
    const next = TrackerService.insertColumn(sheet, 1);
    expect(next.columns[1]).toMatchObject({ name: "Column 6", type: "text", width: 160 });
    expect(ids(next.columns)).toEqual(["name", next.columns[1]!.id, "status", "qty", "done", "due"]);
    expect(next.rows).toBe(sheet.rows);
    expect(sheet).toEqual(snapshot);
  });

  it("clamps the index and gives each new column a unique id", () => {
    const { sheet } = standard();
    let next = TrackerService.insertColumn(sheet, -4, { name: "First" });
    next = TrackerService.insertColumn(next, 999, { name: "Last" });
    expect(next.columns[0]!.name).toBe("First");
    expect(next.columns.at(-1)!.name).toBe("Last");
    for (let i = 0; i < 20; i++) next = TrackerService.insertColumn(next, i);
    expect(allUnique(ids(next.columns))).toBe(true);
  });

  it("carries options and colours, and a summary and number format the type offers", () => {
    const { sheet } = standard();
    const next = TrackerService.insertColumn(sheet, 0, { name: "Cost", type: "number", width: 90, summary: "average", numberFormat: "currency" });
    expect(next.columns[0]).toEqual({ id: next.columns[0]!.id, name: "Cost", type: "number", width: 90, summary: "average", numberFormat: "currency" });
    // A format or footer the type has not got is left off.
    expect(TrackerService.insertColumn(sheet, 0, { type: "text", summary: "sum", numberFormat: "currency" }).columns[0]).not.toHaveProperty("summary");
    expect(TrackerService.insertColumn(sheet, 0, { type: "text", numberFormat: "currency" }).columns[0]).not.toHaveProperty("numberFormat");
    expect(TrackerService.insertColumn(sheet, 0, { width: 5 }).columns[0]!.width).toBe(60);
    const list = TrackerService.insertColumn(sheet, 0, { type: "list", options: ["A"], optionColors: { A: "FFFFFF" } });
    expect(list.columns[0]).toMatchObject({ type: "list", options: ["A"], optionColors: { A: "FFFFFF" } });
  });

  it("was a bug, fixed: the default name can repeat a column that already exists (after a delete)", () => {
    const blank = makeSheet(
      Array.from({ length: 6 }, (_, i) => col(`c${i + 1}`, `Column ${i + 1}`)),
      [data("r")],
    );
    const afterDelete = TrackerService.deleteColumn(blank, "c2"); // Column 1, 3, 4, 5, 6
    const next = TrackerService.insertColumn(afterDelete, afterDelete.columns.length); // named "Column 6" again
    const names = next.columns.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("current behaviour: inserting inside the frozen area keeps the count, so the last frozen column scrolls again", () => {
    const { sheet } = standard(); // frozen 2: name, status
    const next = TrackerService.insertColumn(sheet, 0, { name: "New" });
    expect(next.frozenColumns).toBe(2);
    expect(next.columns.slice(0, 2).map((c) => c.id)).toEqual([next.columns[0]!.id, "name"]);
  });
});

describe("updateColumn: rename, resize, format", () => {
  it("renames and resizes one column and leaves the others and the rows alone", () => {
    const { sheet, snapshot } = standard();
    const next = TrackerService.updateColumn(sheet, "qty", { name: "Quantity", width: 75 });
    expect(next.columns[2]).toMatchObject({ id: "qty", name: "Quantity", width: 75, type: "number", summary: "sum" });
    expect(next.columns[0]).toBe(sheet.columns[0]);
    expect(next.rows).toBe(sheet.rows);
    expect(sheet).toEqual(snapshot);
  });

  it("clamps widths to what the grid can draw (60 to 1200)", () => {
    const { sheet } = standard();
    expect(TrackerService.updateColumn(sheet, "name", { width: 0 }).columns[0]!.width).toBe(60);
    expect(TrackerService.updateColumn(sheet, "name", { width: -40 }).columns[0]!.width).toBe(60);
    expect(TrackerService.updateColumn(sheet, "name", { width: 99999 }).columns[0]!.width).toBe(1200);
    expect(TrackerService.updateColumn(sheet, "name", { width: 241.6 }).columns[0]!.width).toBe(242);
    // frozenOffsets trusts them as given.
    expect(frozenOffsets([col("a", "A", "text", { width: -40 }), col("b", "B")], 2, 32)).toEqual([32, -8]);
  });

  it("does nothing to the columns for an unknown id", () => {
    const { sheet } = standard();
    expect(TrackerService.updateColumn(sheet, "nope", { name: "X", type: "person" }).columns).toEqual(sheet.columns);
  });

  it("sets a number format and a summary, which the footer then uses", () => {
    const { sheet } = standard();
    const next = TrackerService.updateColumn(sheet, "qty", { numberFormat: "currency", summary: "max" });
    const qty = next.columns[2]!;
    expect(summarize(qty, next.rows)).toEqual({ kind: "max", value: 5, text: "Max $5.00" });
  });
});

describe("updateColumn: dropdown options", () => {
  it("adding an option keeps the existing colours and cells", () => {
    const { sheet } = standard();
    const status = sheet.columns[1]!;
    const next = TrackerService.updateColumn(sheet, "status", { options: [...status.options!, "Blocked"], optionColors: { ...status.optionColors, Blocked: "FFEB9C" } });
    expect(next.columns[1]).toMatchObject({ options: ["Open", "Done", "Blocked"], optionColors: { Open: "FFC7CE", Done: "C6EFCE", Blocked: "FFEB9C" } });
    expect(next.rows).toBe(sheet.rows);
  });

  it("current behaviour: renaming or removing an option leaves cells holding the old value (shown as a neutral chip)", () => {
    const { sheet } = standard();
    // As the options dialog saves: options and colours rebuilt under the new names.
    const next = TrackerService.updateColumn(sheet, "status", { options: ["To do", "Done"], optionColors: { "To do": "FFC7CE", Done: "C6EFCE" } });
    expect(next.columns[1]!.optionColors).toEqual({ "To do": "FFC7CE", Done: "C6EFCE" });
    expect(next.rows[1]!.cells.status).toBe("Open");
  });

  it("patching options alone drops the colours of options no longer offered", () => {
    const { sheet } = standard();
    const next = TrackerService.updateColumn(sheet, "status", { options: ["Done"] });
    expect(next.columns[1]!.optionColors).toEqual({ Done: "C6EFCE" });
  });

  it("dropdown to text drops the options and colours but keeps every value typed", () => {
    const { sheet } = standard();
    const next = TrackerService.updateColumn(sheet, "status", { type: "text" });
    expect(next.columns[1]).toEqual({ id: "status", name: "Status", type: "text", width: 120 });
    expect(next.rows.map((r) => r.cells.status)).toEqual([undefined, "Open", "Done", undefined, undefined, undefined]);
  });
});

describe("updateColumn: type changes", () => {
  const mixed = () =>
    frozenSheet(
      [col("c", "C")],
      [band("b", "Band"), data("t", { c: "hello" }), data("n", { c: 42 }), data("num", { c: "1,250" }), data("y", { c: true }), data("f", { c: false }), data("d", { c: "2026-03-04" }), data("u", { c: "u-jane" }), data("e", {})],
    );

  it("never throws for any pair of types, keeps only valid cell values, and leaves bands empty", () => {
    for (const from of TRACKER_COLUMN_TYPES) {
      for (const to of TRACKER_COLUMN_TYPES) {
        const { sheet, snapshot } = mixed();
        const start = TrackerService.updateColumn(structuredClone(sheet), "c", { type: from, ...(from === "list" ? { options: ["hello"] } : {}) });
        const next = TrackerService.updateColumn(deepFreeze(start), "c", { type: to });
        expect(next.columns[0]!.type).toBe(to);
        if (to !== "list") expect(next.columns[0]!.options).toBeUndefined();
        expect(next.rows[0]!.cells).toEqual({});
        for (const row of next.rows) for (const value of Object.values(row.cells)) expect(["string", "number", "boolean"]).toContain(typeof value);
        expect(sheet).toEqual(snapshot);
      }
    }
  });

  it("text to number reads number-like text as numbers and keeps the rest as typed", () => {
    const { sheet, snapshot } = mixed();
    const next = TrackerService.updateColumn(sheet, "c", { type: "number" });
    const cells = Object.fromEntries(next.rows.map((r) => [r.id, r.cells.c]));
    expect(cells).toEqual({ b: undefined, t: "hello", n: 42, num: 1250, y: true, f: false, d: "2026-03-04", u: "u-jane", e: undefined });
    expect(summarize(next.columns[0]!, next.rows)).toMatchObject({ kind: "sum", value: 1292 });
    expect(sheet).toEqual(snapshot);
  });

  it("number to date keeps the raw number (a number is never turned into a date), shown as digits", () => {
    const { sheet } = frozenSheet([col("c", "C", "number")], [data("r", { c: 46264 })]);
    const next = TrackerService.updateColumn(sheet, "c", { type: "date" });
    expect(next.rows[0]!.cells.c).toBe(46264);
    expect(formatCell(next.columns[0]!, next.rows[0]!.cells.c)).toBe("46264");
  });

  it("text to date reads day-first and ISO dates and keeps other text", () => {
    const { sheet } = frozenSheet([col("c", "C")], [data("a", { c: "14/09/2026" }), data("b", { c: "2026-01-02" }), data("x", { c: "TBC" })]);
    const next = TrackerService.updateColumn(sheet, "c", { type: "date" });
    expect(next.rows.map((r) => r.cells.c)).toEqual(["2026-09-14", "2026-01-02", "TBC"]);
  });

  it("text to checkbox ticks the yes words, unticks the no words and keeps anything else as typed", () => {
    const { sheet } = frozenSheet([col("c", "C")], [data("a", { c: "yes" }), data("b", { c: "Y" }), data("d", { c: "Done" }), data("n", { c: "no" }), data("z", { c: "0" }), data("m", { c: "maybe" }), data("x", {})]);
    const next = TrackerService.updateColumn(sheet, "c", { type: "checkbox" });
    expect(next.rows.map((r) => r.cells.c)).toEqual([true, true, true, false, false, "maybe", undefined]);
    expect(summarize(next.columns[0]!, next.rows)).toMatchObject({ kind: "checked", value: 3 });
  });

  it("checkbox and number to text write Y/N and digits, and survive the trip back", () => {
    const { sheet } = frozenSheet([col("c", "C", "checkbox"), col("q", "Q", "number")], [data("a", { c: true, q: 1250 }), data("b", { c: false, q: 0.5 })]);
    const text = TrackerService.updateColumn(TrackerService.updateColumn(sheet, "c", { type: "text" }), "q", { type: "longText" });
    expect(text.rows.map((r) => [r.cells.c, r.cells.q])).toEqual([["Y", "1250"], ["N", "0.5"]]);
    const back = TrackerService.updateColumn(TrackerService.updateColumn(text, "c", { type: "checkbox" }), "q", { type: "number" });
    expect(back.rows.map((r) => r.cells)).toEqual(sheet.rows.map((r) => r.cells));
  });

  it("a type change into the same type, or a patch without a type, leaves the cells alone", () => {
    const { sheet } = standard();
    expect(TrackerService.updateColumn(sheet, "qty", { type: "number" }).rows).toBe(sheet.rows);
    expect(TrackerService.updateColumn(sheet, "qty", { name: "Q" }).rows).toBe(sheet.rows);
  });

  describe("into and out of People", () => {
    beforeEach(() => setTrackerPeople([{ id: "u-jane", name: "Jane Morrison", email: "jane@x.test" }, { id: "u-tom", name: "Tom Hartley", email: "tom@x.test" }]));
    afterEach(() => setTrackerPeople([]));

    it("turns names into people; current behaviour: anything that names nobody is dropped", () => {
      const { sheet } = frozenSheet(
        [col("c", "C")],
        [band("b", "Band"), data("full", { c: "Jane Morrison" }), data("two", { c: "tom@x.test, jane" }), data("mixed", { c: "Jane, Agency X" }), data("unknown", { c: "Agency X" }), data("n", { c: 5 }), data("id", { c: "u-tom" })],
      );
      const next = TrackerService.updateColumn(sheet, "c", { type: "person" });
      const cells = Object.fromEntries(next.rows.map((r) => [r.id, r.cells.c]));
      expect(cells).toEqual({ b: undefined, full: "u-jane", two: "u-tom,u-jane", mixed: "u-jane", unknown: undefined, n: undefined, id: "u-tom" });
      expect(next.rows[0]).toBe(sheet.rows[0]);
    });

    it("turns people back into names; current behaviour: someone not in the directory becomes 'Former member' for good", () => {
      const { sheet } = frozenSheet([col("p", "P", "person")], [data("a", { p: "u-jane,u-tom" }), data("b", { p: "u-jane,u-gone" })]);
      const next = TrackerService.updateColumn(sheet, "p", { type: "text" });
      expect(next.rows.map((r) => r.cells.p)).toEqual(["Jane Morrison, Tom Hartley", "Jane Morrison, Former member"]);
      // Going back to People cannot recover the missing person.
      const back = TrackerService.updateColumn(next, "p", { type: "person" });
      expect(back.rows.map((r) => r.cells.p)).toEqual(["u-jane,u-tom", "u-jane"]);
    });
  });

  it("was a bug, fixed: a summary the new type does not offer survives the type change (number 'sum' on a text column)", () => {
    const { sheet } = standard();
    const next = TrackerService.updateColumn(sheet, "qty", { type: "text" });
    const qty = next.columns[2]!;
    // The footer shows "Sum …" and the summary menu has no matching entry selected.
    expect(summaryKindsFor(qty)).toContain(qty.summary ?? "count");
  });
});

describe("retype", () => {
  const retype = TrackerService.retype;

  it("passes null through for every type", () => {
    for (const type of TRACKER_COLUMN_TYPES) expect(retype(type, null)).toBeNull();
  });

  it("number: reads number-like text, keeps numbers, booleans and unreadable text as they are", () => {
    expect(retype("number", "1,250")).toBe(1250);
    expect(retype("number", " -3.5 ")).toBe(-3.5);
    expect(retype("number", 7)).toBe(7);
    expect(retype("number", true)).toBe(true);
    expect(retype("number", "n/a")).toBe("n/a");
    expect(retype("number", "2026-03-04")).toBe("2026-03-04");
    // Decimal only: "007" reads as 7, hex is text.
    expect(retype("number", "007")).toBe(7);
    expect(retype("number", "0x1F")).toBe("0x1F");
  });

  it("date: reads date text, never turns a number or a boolean into a date", () => {
    expect(retype("date", "1/9/26")).toBe("2026-09-01");
    expect(retype("date", 46264)).toBe(46264);
    expect(retype("date", true)).toBe(true);
    expect(retype("date", "Phase two")).toBe("Phase two");
  });

  it("was a bug, fixed: date: text that is only a number is guessed into a date ('12' becomes a 2001 date, '2026' Jan 1)", () => {
    // retype promises nothing is guessed, but it reads text through coerce, which falls back on new Date().
    expect(retype("date", "12")).toBe("12");
    expect(retype("date", "2026")).toBe("2026");
  });

  it("checkbox: yes and no words, 1 and 0; anything else is kept", () => {
    for (const yes of ["Y", "yes", "TRUE", "1", "✓", "x", "Done"]) expect(retype("checkbox", yes)).toBe(true);
    for (const no of ["N", "no", "false", "0"]) expect(retype("checkbox", no)).toBe(false);
    expect(retype("checkbox", 1)).toBe(true);
    expect(retype("checkbox", 0)).toBe(false);
    expect(retype("checkbox", 5)).toBe(5);
    expect(retype("checkbox", "maybe")).toBe("maybe");
    expect(retype("checkbox", false)).toBe(false);
  });

  it("'done' ticks a box both when a column becomes a checkbox and when it is typed into one", () => {
    expect(retype("checkbox", "done")).toBe(true);
    expect(TrackerService.coerce({ type: "checkbox" }, "done")).toBe(true);
  });

  it("text-like types: numbers become their digits, booleans Y/N, text unchanged", () => {
    for (const type of ["text", "longText", "url", "list"] as const) {
      expect(retype(type, 12.5)).toBe("12.5");
      expect(retype(type, true)).toBe("Y");
      expect(retype(type, false)).toBe("N");
      expect(retype(type, "as is")).toBe("as is");
    }
  });

  it("person: values pass through unchanged (updateColumn converts People itself)", () => {
    expect(retype("person", "u-jane")).toBe("u-jane");
    expect(retype("person", 3)).toBe(3);
  });
});

describe("summaries per type", () => {
  it("number columns: sum, average, min, max and counts, reading number-like text and skipping bands", () => {
    const { sheet } = standard();
    const qty = sheet.columns[2]!;
    const rows = [...sheet.rows, band("b3", "Ignored"), data("r5", { qty: "n/a" })];
    expect(summarize(qty, rows)).toEqual({ kind: "sum", value: 10, text: "Sum 10" });
    expect(summarize({ ...qty, summary: "average" }, rows).value).toBeCloseTo(10 / 3);
    expect(summarize({ ...qty, summary: "min" }, rows).value).toBe(2);
    expect(summarize({ ...qty, summary: "count" }, rows)).toMatchObject({ value: 4, text: "4 filled" });
    expect(summarize({ ...qty, summary: "empty" }, rows)).toMatchObject({ value: 1 });
    expect(summarize({ ...qty, summary: "none" }, rows)).toEqual({ kind: "none", value: null, text: "" });
    expect(summarize({ ...qty, summary: "max" }, [])).toEqual({ kind: "max", value: null, text: "Max —" });
  });

  it("checkbox columns: checked and percent; an unticked box counts as empty", () => {
    const { sheet } = standard();
    const done = sheet.columns[3]!;
    expect(summarize(done, sheet.rows)).toEqual({ kind: "checked", value: 1, text: "1 of 4 checked" });
    expect(summarize({ ...done, summary: "percentChecked" }, sheet.rows).value).toBe(25);
    // r1 true; r4 false and r2, r3 never touched: three unticked boxes.
    expect(summarize({ ...done, summary: "empty" }, sheet.rows).value).toBe(3);
    expect(summarize({ ...done, summary: "percentChecked" }, []).value).toBe(0);
  });

  it("text-like columns count filled and empty cells and offer nothing else", () => {
    const { sheet } = standard();
    expect(summarize(sheet.columns[0]!, sheet.rows)).toMatchObject({ kind: "count", value: 3 });
    expect(summarize({ ...sheet.columns[0]!, summary: "empty" }, sheet.rows)).toMatchObject({ value: 1 });
    for (const type of ["text", "longText", "list", "date", "url", "person"] as const) expect(summaryKindsFor({ type })).toEqual(["none", "count", "empty"]);
  });
});

describe("deleteColumn", () => {
  it("drops the column's cells from every row, bands included", () => {
    const { sheet, snapshot } = frozenSheet([col("a", "A"), col("b", "B"), col("c", "C")], [{ ...band("x", "Band"), cells: { b: "stray" } }, data("r1", { a: 1, b: 2, c: 3 }), data("r2", { b: "only" }), data("r3", { a: "keep" })]);
    const next = TrackerService.deleteColumn(sheet, "b");
    expect(ids(next.columns)).toEqual(["a", "c"]);
    for (const row of next.rows) expect("b" in row.cells).toBe(false);
    expect(next.rows[1]!.cells).toEqual({ a: 1, c: 3 });
    expect(next.rows[3]).toBe(sheet.rows[3]);
    expect(sheet).toEqual(snapshot);
  });

  it("keeps frozenColumns within the column count", () => {
    const { sheet } = frozenSheet([col("a", "A"), col("b", "B"), col("c", "C")], [data("r")], 3);
    let next = TrackerService.deleteColumn(sheet, "c");
    expect(next.frozenColumns).toBe(2);
    next = TrackerService.deleteColumn(next, "a");
    expect(next.frozenColumns).toBe(1);
    expect(next.frozenColumns).toBeLessThanOrEqual(next.columns.length);
  });

  it("refuses to delete the last column and ignores an unknown one", () => {
    const { sheet } = frozenSheet([col("a", "A")], [data("r", { a: "x" })]);
    expect(TrackerService.deleteColumn(sheet, "a")).toBe(sheet);
    const { sheet: two } = standard();
    expect(TrackerService.deleteColumn(two, "nope").columns).toEqual(two.columns);
  });

  it("current behaviour: deleting a frozen column keeps the count, so the next column becomes frozen", () => {
    const { sheet } = standard(); // frozen: name, status
    const next = TrackerService.deleteColumn(sheet, "name");
    expect(next.frozenColumns).toBe(2);
    expect(next.columns.slice(0, 2).map((c) => c.id)).toEqual(["status", "qty"]);
  });

  it("an asset mapping that used the column lets go of it, keeping the rest", () => {
    const sheet = { ...makeSheet([col("a", "Asset"), col("q", "Qty", "number")], [data("r")]), assetMapping: suggestAssetMapping({ columns: [col("a", "Asset"), col("q", "Qty", "number")] }) };
    const next = TrackerService.deleteColumn(sheet, "q");
    expect(next.assetMapping!.quantity.columnId).toBeNull();
    expect(next.assetMapping!.name).toBe("a");
  });
});

describe("moveColumn", () => {
  it("moves to the first and last position and clamps out-of-range indexes", () => {
    const { sheet, snapshot } = standard();
    expect(ids(TrackerService.moveColumn(sheet, "due", 0).columns)).toEqual(["due", "name", "status", "qty", "done"]);
    expect(ids(TrackerService.moveColumn(sheet, "name", 4).columns)).toEqual(["status", "qty", "done", "due", "name"]);
    expect(ids(TrackerService.moveColumn(sheet, "name", 99).columns)).toEqual(["status", "qty", "done", "due", "name"]);
    expect(ids(TrackerService.moveColumn(sheet, "due", -1).columns)).toEqual(["due", "name", "status", "qty", "done"]);
    expect(sheet).toEqual(snapshot);
  });

  it("swaps neighbours the way the header menu calls it (index ± 1), and is a no-op past the edges", () => {
    const { sheet } = standard();
    expect(ids(TrackerService.moveColumn(sheet, "status", 1 + 1).columns)).toEqual(["name", "qty", "status", "done", "due"]);
    expect(ids(TrackerService.moveColumn(sheet, "status", 1 - 1).columns)).toEqual(["status", "name", "qty", "done", "due"]);
    expect(ids(TrackerService.moveColumn(sheet, "name", 0 - 1).columns)).toEqual(ids(sheet.columns));
    expect(ids(TrackerService.moveColumn(sheet, "due", 4 + 1).columns)).toEqual(ids(sheet.columns));
  });

  it("keeps rows, cells and frozenColumns; an unknown column returns the sheet itself", () => {
    const { sheet } = standard();
    const next = TrackerService.moveColumn(sheet, "qty", 0);
    expect(next.rows).toBe(sheet.rows);
    expect(next.frozenColumns).toBe(2);
    expect(TrackerService.moveColumn(sheet, "nope", 0)).toBe(sheet);
  });
});

describe("grid helpers on a reshaped sheet", () => {
  it("frozenOffsets never runs past the columns", () => {
    expect(frozenOffsets([col("a", "A", "text", { width: 100 }), col("b", "B", "text", { width: 50 })], 9, 40)).toEqual([40, 140]);
    expect(frozenOffsets([], 3, 40)).toEqual([]);
  });

  it("pasting skips bands and grows the sheet with fresh unique rows", () => {
    const { sheet } = standard();
    const next = pasteBlock(sheet, { row: 3, col: 0 }, [["a"], ["band row"], ["c"], ["d"], ["e"]], null);
    expect(next.rows[4]!.cells).toEqual({});
    expect(next.rows).toHaveLength(8);
    expect(allUnique(ids(next.rows))).toBe(true);
    expect(rangeToTsv(next, { top: 3, left: 0, bottom: 7, right: 0 }).split("\n")).toEqual(["a", "Web", "c", "d", "e"]);
  });
});

// ---- coerce ---------------------------------------------------------------------------

describe("coerce", () => {
  const coerce = (type: TrackerColumn["type"], raw: TrackerCellValue) => TrackerService.coerce({ type }, raw);

  it("passes null through for every type", () => {
    for (const type of TRACKER_COLUMN_TYPES) expect(coerce(type, null)).toBeNull();
  });

  it("number: digits with separators become numbers, blanks null, other text stays text", () => {
    expect(coerce("number", "1,250")).toBe(1250);
    expect(coerce("number", " 1 000 ")).toBe(1000);
    expect(coerce("number", "-3.5")).toBe(-3.5);
    expect(coerce("number", "1e3")).toBe(1000);
    expect(coerce("number", 7)).toBe(7);
    expect(coerce("number", "   ")).toBeNull();
    expect(coerce("number", "$5")).toBe("$5");
    expect(coerce("number", "12%")).toBe("12%");
    expect(coerce("number", "Infinity")).toBe("Infinity");
    // Decimal only: hex is text; a lone separator is not 0; a boolean becomes text.
    expect(coerce("number", "0x10")).toBe("0x10");
    expect(coerce("number", ",")).toBe(",");
    expect(coerce("number", true)).toBe("true");
  });

  it("was a bug, fixed: number: a lone comma (or commas and spaces) becomes 0", () => {
    expect(coerce("number", ",")).toBe(",");
  });

  it("checkbox: the usual yes words tick, anything else unticks", () => {
    for (const yes of ["y", "Yes", "TRUE", "1", "✓", "X", " x ", "done", "Done"]) expect(coerce("checkbox", yes)).toBe(true);
    for (const no of ["n", "no", "false", "0", ""]) expect(coerce("checkbox", no)).toBe(false);
    expect(coerce("checkbox", 1)).toBe(true);
    expect(coerce("checkbox", 0)).toBe(false);
    expect(coerce("checkbox", false)).toBe(false);
  });

  it("date: ISO kept, day-first slashes, dots and dashes read, two-digit years in 2000s, Excel serials converted", () => {
    expect(coerce("date", "2026-09-14")).toBe("2026-09-14");
    expect(coerce("date", " 14/9/2026 ")).toBe("2026-09-14");
    expect(coerce("date", "1.9.26")).toBe("2026-09-01");
    expect(coerce("date", "03-04-2026")).toBe("2026-04-03");
    expect(coerce("date", 46264)).toBe("2026-08-30");
    expect(coerce("date", "")).toBeNull();
    expect(coerce("date", "TBC")).toBe("TBC");
  });

  it("was a bug, fixed: date: an impossible day or month is not turned into a date; the text typed is kept", () => {
    // Day-first text that cannot be a date stays as typed, not "2026-25-12" or "2026-02-31".
    expect(coerce("date", "12/25/2026")).toBe("12/25/2026");
    expect(coerce("date", "31/02/2026")).toBe("31/02/2026");
    expect(coerce("date", "1/9/026")).toBe("1/9/026");
    // ISO text is kept exactly as typed either way (the date picker never produces an impossible one).
    expect(coerce("date", "2026-02-30")).toBe("2026-02-30");
    expect(coerce("date", "29/02/2028")).toBe("2028-02-29");
  });

  describe("in Melbourne (UTC+10/11)", () => {
    let before: string | undefined;
    beforeAll(() => {
      before = process.env.TZ;
      process.env.TZ = "Australia/Melbourne";
    });
    afterAll(() => {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    });

    it("was a bug, fixed: date: a written-out date lands a day early east of UTC ('September 14, 2026' gives 2026-09-13)", () => {
      expect(coerce("date", "September 14, 2026")).toBe("2026-09-14");
    });
  });

  describe("in UTC", () => {
    let before: string | undefined;
    beforeAll(() => {
      before = process.env.TZ;
      process.env.TZ = "UTC";
    });
    afterAll(() => {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    });

    it("was a bug, fixed: date: number-like text is parsed as a year ('46264' gives 46264-01-01, '1' gives 2001-01-01)", () => {
      expect(["46264", "2026-08-30"]).toContain(coerce("date", "46264"));
      expect(coerce("date", "1")).not.toBe("2001-01-01");
    });

    it("was a bug, fixed: date: a day and month without a year land in 2001 ('May 5' gives 2001-05-05)", () => {
      expect(coerce("date", "May 5")).not.toMatch(/^2001-/);
    });
  });

  it("person: only text is read; ids pass when no directory is set", () => {
    expect(coerce("person", 5)).toBeNull();
    expect(coerce("person", true)).toBeNull();
    const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(coerce("person", ` ${uuid} , ${uuid}`)).toBe(uuid);
    expect(coerce("person", "Jane")).toBeNull();
  });

  it("text-like types: booleans as Y/N, numbers as text, empty or spaces alone as null", () => {
    for (const type of ["text", "longText", "list", "url"] as const) {
      expect(coerce(type, true)).toBe("Y");
      expect(coerce(type, false)).toBe("N");
      expect(coerce(type, 12.5)).toBe("12.5");
      expect(coerce(type, "")).toBeNull();
      expect(coerce(type, "  ")).toBeNull();
      expect(coerce(type, " a ")).toBe(" a ");
    }
  });
});

// ---- merging concurrent edits ----------------------------------------------------------

describe("mergeSheets", () => {
  const base = () => deepFreeze(makeSheet([col("a", "A"), col("b", "B"), col("s", "S", "list", { options: ["X", "Y"] })], [data("1", { a: "one" }), data("2", { a: "two" }), data("3", { a: "three" })], 1));

  it("keeps both sides' edits to different cells of the same row and different rows, without touching the inputs", () => {
    const b = base();
    const mine = deepFreeze(TrackerService.applyEdits(b, [{ rowId: "1", columnId: "a", value: "ONE" }, { rowId: "3", columnId: "b", value: "mine" }]));
    const theirs = deepFreeze(TrackerService.applyEdits(b, [{ rowId: "1", columnId: "b", value: "theirs" }, { rowId: "2", columnId: "a", value: "TWO" }]));
    const snapshots = structuredClone([b, mine, theirs]);
    const merged = mergeSheets(b, mine, theirs);
    expect(merged.rows.map((r) => r.cells)).toEqual([{ a: "ONE", b: "theirs" }, { a: "TWO" }, { a: "three", b: "mine" }]);
    expect([b, mine, theirs]).toEqual(snapshots);
  });

  it("keeps a rename on one side and a resize on the other", () => {
    const b = base();
    const merged = mergeSheets(b, TrackerService.updateColumn(b, "a", { name: "Asset" }), TrackerService.updateColumn(b, "a", { width: 300 }));
    expect(merged.columns[0]).toMatchObject({ id: "a", name: "Asset", width: 300 });
  });

  it("keeps rows added on both sides, each where it was put, with unique ids", () => {
    const b = base();
    const mine = TrackerService.insertRows(b, 0);
    const theirs = TrackerService.insertRows(b, 3, 2);
    const merged = mergeSheets(b, mine, theirs);
    expect(merged.rows).toHaveLength(6);
    expect(merged.rows[0]!.id).toBe(mine.rows[0]!.id);
    expect(ids(merged.rows).slice(1, 4)).toEqual(["1", "2", "3"]);
    expect(ids(merged.rows).slice(4)).toEqual(ids(theirs.rows.slice(3)));
    expect(allUnique(ids(merged.rows))).toBe(true);
  });

  it("a column deleted on one side takes the other side's new cells in it, and frozenColumns follows", () => {
    const b = { ...base(), frozenColumns: 3 };
    const mine = TrackerService.applyEdits(b, [{ rowId: "2", columnId: "s", value: "X" }]);
    const theirs = TrackerService.deleteColumn(b, "s");
    const merged = mergeSheets(b, mine, theirs);
    expect(ids(merged.columns)).toEqual(["a", "b"]);
    expect(merged.rows[1]!.cells).toEqual({ a: "two" });
    expect(merged.frozenColumns).toBe(2);
  });

  it("when both change one cell this side wins, a clear included; their frozen-column change is kept", () => {
    const b = base();
    const mine = TrackerService.applyEdits(b, [{ rowId: "1", columnId: "a", value: null }, { rowId: "2", columnId: "a", value: "mine" }]);
    const theirs = { ...TrackerService.applyEdits(b, [{ rowId: "1", columnId: "a", value: "theirs" }, { rowId: "2", columnId: "a", value: "theirs" }]), frozenColumns: 2 };
    const merged = mergeSheets(b, mine, theirs);
    expect(merged.rows[0]!.cells).toEqual({});
    expect(merged.rows[1]!.cells.a).toBe("mine");
    expect(merged.frozenColumns).toBe(2);
  });

  it("a row deleted on one side stays deleted even if the other side edited it", () => {
    const b = base();
    const merged = mergeSheets(b, TrackerService.deleteRows(b, ["2"]), TrackerService.applyEdits(b, [{ rowId: "2", columnId: "b", value: "late" }]));
    expect(ids(merged.rows)).toEqual(["1", "3"]);
  });

  it("was a bug, fixed: a row turned into a band here keeps a cell typed into it there (a band carrying data)", () => {
    const b = base();
    const mine = TrackerService.setRowKind(b, ["1"], "section");
    const theirs = TrackerService.applyEdits(b, [{ rowId: "1", columnId: "b", value: "new" }]);
    const merged = mergeSheets(b, mine, theirs);
    expect(merged.rows[0]).toMatchObject({ kind: "section", label: "one" });
    expect(merged.rows[0]!.cells).toEqual({});
  });

  it("was a bug, fixed: a dropdown turned into text there keeps the options added here (a text column with options)", () => {
    const b = base();
    const mine = TrackerService.updateColumn(b, "s", { options: ["X", "Y", "Z"] });
    const theirs = TrackerService.updateColumn(b, "s", { type: "text" });
    const merged = mergeSheets(b, mine, theirs);
    const s = merged.columns.find((c) => c.id === "s")!;
    expect(s.type).toBe("text");
    expect(s.options).toBeUndefined();
  });
});

// ---- the service: trackers, sheets, saving ---------------------------------------------

describe("TrackerService (local store)", () => {
  let repos: ReturnType<typeof createLocalRepositories>;
  let services: ReturnType<typeof createServices>;
  const actor = SEED_USER_IDS.jun;
  const blankTracker = async (name = "Grid ops") => services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: SEED_TEAM_IDS.digital, name, layout: "blank" }, actor);

  beforeEach(() => {
    repos = createLocalRepositories({ databaseName: `grid-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
  });

  describe("create, update, delete", () => {
    it("creates the campaign layout: the workbook's columns, 12 empty rows, 6 frozen", async () => {
      const { tracker, sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "  Campaign  ", description: "   ", layout: "campaign" }, actor);
      expect(tracker).toMatchObject({ name: "Campaign", description: null, teamId: null });
      expect(sheets).toHaveLength(1);
      expect(sheets[0]).toMatchObject({ name: "Sheet 1", position: 0, frozenColumns: DOMESTIC_CAMPAIGNS_FROZEN, itemId: null });
      expect(sheets[0]!.columns).toHaveLength(DOMESTIC_CAMPAIGNS_COLUMNS.length);
      expect(sheets[0]!.rows).toHaveLength(12);
      expect(sheets[0]!.rows.every((r) => r.kind === "data" && Object.keys(r.cells).length === 0)).toBe(true);
    });

    it("creates the blank layout: six text columns, 20 rows, one frozen; two trackers never share ids", async () => {
      const one = (await blankTracker()).sheets[0]!;
      const two = (await blankTracker("Other")).sheets[0]!;
      expect(one.columns.map((c) => [c.name, c.type, c.width])).toEqual(Array.from({ length: 6 }, (_, i) => [`Column ${i + 1}`, "text", 160]));
      expect(one.rows).toHaveLength(20);
      expect(one.frozenColumns).toBe(1);
      const every = [...ids(one.columns), ...ids(two.columns), ...ids(one.rows), ...ids(two.rows)];
      expect(allUnique(every)).toBe(true);
    });

    it("creates explicit sheets in order, ids as given", async () => {
      const { sheets } = await services.trackers.create(
        {
          workspaceId: SEED_WORKSPACE_ID,
          teamId: null,
          name: "Imported",
          layout: "campaign",
          sheets: [
            { name: "A", columns: [col("x", "X")], rows: [data("ra", { x: "1" })], frozenColumns: 0 },
            { name: "B", columns: [col("y", "Y")], rows: [band("rb", "Band")], frozenColumns: 1 },
          ],
        },
        actor,
      );
      expect(sheets.map((s) => [s.name, s.position, s.columns[0]!.id, s.rows[0]!.id])).toEqual([
        ["A", 0, "x", "ra"],
        ["B", 1, "y", "rb"],
      ]);
    });

    it("refuses a blank tracker name on create and update, and trims on update", async () => {
      await expect(services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "   ", layout: "blank" }, actor)).rejects.toThrow(/cannot be empty/);
      const { tracker } = await blankTracker();
      await expect(services.trackers.update(tracker.id, { name: "  " })).rejects.toThrow(/cannot be empty/);
      expect((await services.trackers.update(tracker.id, { name: "  Renamed " })).name).toBe("Renamed");
      expect((await services.trackers.update(tracker.id, { description: "About" })).name).toBe("Renamed");
    });

    it("deleting a tracker removes every sheet", async () => {
      const { tracker, sheets } = await blankTracker();
      const second = await services.trackers.addSheet(tracker.id, "Two", "blank");
      await services.trackers.delete(tracker.id);
      expect(await repos.trackers.getSheet(sheets[0]!.id)).toBeNull();
      expect(await repos.trackers.getSheet(second.id)).toBeNull();
      await expect(services.trackers.get(tracker.id)).rejects.toThrow();
    });
  });

  describe("sheets", () => {
    it("adds blank and campaign sheets at the end; a blank name becomes 'New sheet'", async () => {
      const { tracker } = await blankTracker();
      const blank = await services.trackers.addSheet(tracker.id, "   ", "blank");
      const campaign = await services.trackers.addSheet(tracker.id, " Launch ", "campaign");
      expect([blank.name, blank.position, blank.columns.length]).toEqual(["New sheet", 1, 6]);
      expect([campaign.name, campaign.position, campaign.frozenColumns]).toEqual(["Launch", 2, DOMESTIC_CAMPAIGNS_FROZEN]);
    });

    it("'copy' keeps columns and bands but empties the data rows; 'duplicate' keeps everything; both get new row ids and sit after the source", async () => {
      const { tracker, sheets } = await blankTracker();
      const source = sheets[0]!;
      const filled = TrackerService.applyEdits(TrackerService.setRowLabel(TrackerService.insertRows(source, 0, 1, "section"), "", ""), []);
      const bandId = filled.rows[0]!.id;
      const withData = TrackerService.applyEdits(TrackerService.setRowLabel(filled, bandId, "Phase"), [{ rowId: filled.rows[1]!.id, columnId: source.columns[0]!.id, value: "kept?" }]);
      const saved = await services.trackers.saveSheet(source.id, { columns: withData.columns, rows: withData.rows, frozenColumns: 2 });
      const last = await services.trackers.addSheet(tracker.id, "Last", "blank");

      const copy = await services.trackers.addSheet(tracker.id, "Copy", "copy", source.id);
      const dup = await services.trackers.addSheet(tracker.id, "Dup", "duplicate", source.id);
      for (const sheet of [copy, dup]) {
        expect(ids(sheet.columns)).toEqual(ids(saved.columns));
        expect(sheet.frozenColumns).toBe(2);
        expect(sheet.itemId).toBeNull();
        expect(sheet.rows).toHaveLength(saved.rows.length);
        expect(sheet.rows.some((r) => ids(saved.rows).includes(r.id))).toBe(false);
        expect(allUnique(ids(sheet.rows))).toBe(true);
        expect(sheet.rows[0]).toMatchObject({ kind: "section", label: "Phase" });
      }
      expect(copy.rows.every((r) => Object.keys(r.cells).length === 0)).toBe(true);
      expect(dup.rows[1]!.cells).toEqual(saved.rows[1]!.cells);
      // Each copy goes straight after the sheet it copies.
      expect((await services.trackers.listSheets(tracker.id)).map((s) => s.name)).toEqual(["Sheet 1", "Dup", "Copy", last.name]);
      // The source is untouched.
      expect(await services.trackers.getSheet(source.id)).toEqual(saved);
    });

    it("refuses 'copy' or 'duplicate' without a sheet to copy, and makes nothing", async () => {
      const { tracker } = await blankTracker();
      await expect(services.trackers.addSheet(tracker.id, "Copy", "copy")).rejects.toThrow(/Choose the sheet to copy/);
      await expect(services.trackers.addSheet(tracker.id, "Copy", "duplicate")).rejects.toThrow(/Choose the sheet to copy/);
      expect(await services.trackers.listSheets(tracker.id)).toHaveLength(1);
    });

    it("renames with trimming and refuses a blank name", async () => {
      const { sheets } = await blankTracker();
      expect((await services.trackers.renameSheet(sheets[0]!.id, "  Budget  ")).name).toBe("Budget");
      await expect(services.trackers.renameSheet(sheets[0]!.id, "")).rejects.toThrow(/cannot be empty/);
      await expect(services.trackers.renameSheet(sheets[0]!.id, " \t ")).rejects.toThrow(/cannot be empty/);
      expect((await services.trackers.getSheet(sheets[0]!.id)).name).toBe("Budget");
    });

    it("deletes a sheet but never the last one", async () => {
      const { tracker, sheets } = await blankTracker();
      const second = await services.trackers.addSheet(tracker.id, "Two", "blank");
      await expect(services.trackers.deleteSheet(sheets[0]!.id)).resolves.toBeUndefined();
      await expect(services.trackers.deleteSheet(second.id)).rejects.toThrow(/at least one sheet/);
      expect(ids(await services.trackers.listSheets(tracker.id))).toEqual([second.id]);
    });

    it("moves sheets one place, standing still at either edge, and reorders them all", async () => {
      const { tracker, sheets } = await blankTracker();
      const b = await services.trackers.addSheet(tracker.id, "B", "blank");
      const c = await services.trackers.addSheet(tracker.id, "C", "blank");
      const a = sheets[0]!;
      expect(ids(await services.trackers.moveSheet(a.id, -1))).toEqual([a.id, b.id, c.id]);
      expect(ids(await services.trackers.moveSheet(c.id, 1))).toEqual([a.id, b.id, c.id]);
      expect(ids(await services.trackers.moveSheet(a.id, 1))).toEqual([b.id, a.id, c.id]);
      expect(ids(await services.trackers.moveSheet(c.id, -1))).toEqual([b.id, c.id, a.id]);
      expect(ids(await services.trackers.reorderSheets(tracker.id, [a.id, c.id, b.id]))).toEqual([a.id, c.id, b.id]);
      expect((await services.trackers.listSheets(tracker.id)).map((s) => s.position)).toEqual([0, 1, 2]);
    });
  });

  describe("saving", () => {
    it("saves the result of a run of grid edits and reads it back exactly", async () => {
      const { sheets } = await blankTracker();
      const start = sheets[0]!;
      let s = TrackerService.insertColumn(start, 1, { name: "Qty", type: "number" });
      s = TrackerService.updateColumn(s, start.columns[2]!.id, { type: "list", options: ["A"], optionColors: { A: "C6EFCE" }, width: 210 });
      s = TrackerService.deleteColumn(s, start.columns[5]!.id);
      s = TrackerService.moveColumn(s, start.columns[0]!.id, 3);
      s = TrackerService.insertRows(s, 0, 1, "section");
      s = TrackerService.setRowLabel(s, s.rows[0]!.id, "Phase");
      s = TrackerService.applyEdits(s, [{ rowId: s.rows[1]!.id, columnId: s.columns[1]!.id, value: 4 }]);
      s = TrackerService.duplicateRows(s, [s.rows[1]!.id]);
      s = TrackerService.moveRows(s, [s.rows[2]!.id], s.rows.length);
      s = TrackerService.deleteRows(s, [s.rows[5]!.id]);
      const saved = await services.trackers.saveSheet(start.id, { columns: s.columns, rows: s.rows, frozenColumns: 3, name: "Edited" });
      const back = await services.trackers.getSheet(start.id);
      expect(back).toEqual(saved);
      expect(back).toMatchObject({ name: "Edited", columns: s.columns, rows: s.rows, frozenColumns: 3 });
      expect(allUnique(ids(back.rows))).toBe(true);
      expect(allUnique(ids(back.columns))).toBe(true);
    });

    it("a draft saved from the current version is written and moves the version on", async () => {
      const { sheets } = await blankTracker();
      const start = sheets[0]!;
      const edited = TrackerService.applyEdits(start, [{ rowId: start.rows[0]!.id, columnId: start.columns[0]!.id, value: "first" }]);
      const result = await services.trackers.saveSheetDraft(start.id, { rows: edited.rows }, start.updatedAt, actor);
      if ("conflict" in result) throw new Error("unexpected conflict");
      expect(result.sync).toBeNull();
      expect(result.sheet.updatedAt > start.updatedAt).toBe(true);
      // Saving again from the version just returned works too, even within the same millisecond.
      const again = await services.trackers.saveSheetDraft(start.id, { frozenColumns: 2 }, result.sheet.updatedAt, actor);
      expect("sheet" in again && again.sheet.updatedAt > result.sheet.updatedAt).toBe(true);
      expect((await services.trackers.getSheet(start.id)).rows[0]!.cells[start.columns[0]!.id]).toBe("first");
    });

    it("a stale draft is refused without writing, and merging with what came back keeps both people's edits", async () => {
      const { sheets } = await blankTracker();
      const base = sheets[0]!;
      const [a, b] = base.columns;
      const [r0, r1] = base.rows;

      // Somebody else saves first.
      const theirs = TrackerService.applyEdits(TrackerService.updateColumn(base, b!.id, { name: "Theirs" }), [{ rowId: r1!.id, columnId: a!.id, value: "theirs" }]);
      const first = await services.trackers.saveSheetDraft(base.id, { columns: theirs.columns, rows: theirs.rows }, base.updatedAt, SEED_USER_IDS.jun);
      expect("sheet" in first).toBe(true);

      // My save, from the version I opened, is refused and nothing of mine is written.
      const mine = TrackerService.insertColumn(TrackerService.applyEdits(base, [{ rowId: r0!.id, columnId: a!.id, value: "mine" }]), 99, { name: "Mine" });
      const refused = await services.trackers.saveSheetDraft(base.id, { columns: mine.columns, rows: mine.rows }, base.updatedAt, actor);
      if (!("conflict" in refused)) throw new Error("expected a conflict");
      const stored = await services.trackers.getSheet(base.id);
      expect(stored.rows[0]!.cells).toEqual({});
      expect(stored.columns).toHaveLength(6);
      expect(refused.conflict).toEqual(stored);

      // Merge and save against the version that came back.
      const merged = mergeSheets(base, mine, refused.conflict);
      const done = await services.trackers.saveSheetDraft(base.id, { columns: merged.columns, rows: merged.rows, frozenColumns: merged.frozenColumns }, refused.conflict.updatedAt, actor);
      expect("sheet" in done).toBe(true);
      const final = await services.trackers.getSheet(base.id);
      expect(final.rows[0]!.cells[a!.id]).toBe("mine");
      expect(final.rows[1]!.cells[a!.id]).toBe("theirs");
      expect(final.columns.map((c) => c.name)).toEqual(["Column 1", "Theirs", "Column 3", "Column 4", "Column 5", "Column 6", "Mine"]);
    });

    it("saveSheet keeps frozenColumns between none and the column count", async () => {
      const { sheets } = await blankTracker();
      expect((await services.trackers.saveSheet(sheets[0]!.id, { frozenColumns: 99 })).frozenColumns).toBe(6);
      expect((await services.trackers.saveSheet(sheets[0]!.id, { frozenColumns: -3 })).frozenColumns).toBe(0);
      expect((await services.trackers.saveSheet(sheets[0]!.id, { frozenColumns: 2 })).frozenColumns).toBe(2);
    });
  });

  describe("duplicating a tracker", () => {
    it("copies every sheet in order under new sheet ids, with the same grid, and leaves the source alone", async () => {
      const { tracker, sheets } = await blankTracker("Source");
      await services.trackers.addSheet(tracker.id, "Second", "campaign");
      const edited = TrackerService.applyEdits(sheets[0]!, [{ rowId: sheets[0]!.rows[0]!.id, columnId: sheets[0]!.columns[0]!.id, value: "x" }]);
      await services.trackers.saveSheet(sheets[0]!.id, { rows: edited.rows, frozenColumns: 3 });
      const before = await services.trackers.listSheets(tracker.id);

      const copy = await services.trackers.duplicate(tracker.id, actor);
      expect(copy.tracker).toMatchObject({ name: "Source (copy)", teamId: tracker.teamId, workspaceId: tracker.workspaceId });
      expect(copy.tracker.id).not.toBe(tracker.id);
      expect(copy.sheets.map((s) => s.name)).toEqual(["Sheet 1", "Second"]);
      for (const [i, sheet] of copy.sheets.entries()) {
        expect(sheet.id).not.toBe(before[i]!.id);
        expect(sheet.trackerId).toBe(copy.tracker.id);
        expect(sheet.itemId).toBeNull();
        expect(sheet.columns).toEqual(before[i]!.columns);
        expect(sheet.rows).toEqual(before[i]!.rows);
        expect(sheet.frozenColumns).toBe(before[i]!.frozenColumns);
      }

      // Editing the copy leaves the original as it was.
      const c0 = copy.sheets[0]!;
      await services.trackers.saveSheet(c0.id, { rows: TrackerService.deleteRows(c0, [c0.rows[0]!.id]).rows });
      expect(await services.trackers.listSheets(tracker.id)).toEqual(before);
    });

    it("a copy of a sheet holding a task's assets holds none, and saving it adds nothing to the task", async () => {
      const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.system);
      const itemId = (await repos.items.listByBoard(boards[0]!.id)).find((i) => !i.parentItemId)!.id;
      const columns = [col("asset", "Asset"), col("qty", "Qty", "number")];
      const { tracker, sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: SEED_TEAM_IDS.digital, name: "Kit", layout: "blank", sheets: [{ name: "Assets", columns, rows: [data("r1", { asset: "Tile" }), data("r2")], frozenColumns: 1 }] }, actor);
      await services.trackers.linkSheet(sheets[0]!.id, itemId, suggestAssetMapping({ columns }), actor);
      const linesBefore = await services.assets.list(itemId);

      const copy = await services.trackers.duplicate(tracker.id, actor);
      const dupSheet = await services.trackers.addSheet(tracker.id, "Dup", "duplicate", sheets[0]!.id);
      for (const sheet of [copy.sheets[0]!, dupSheet]) {
        expect(sheet.itemId).toBeNull();
        // Current behaviour: the mapping comes along (it is harmless without a task).
        expect(sheet.assetMapping).not.toBeNull();
        const edited = TrackerService.applyEdits(sheet, [{ rowId: "r2", columnId: "asset", value: "Story" }]);
        const result = await services.trackers.saveSheetDraft(sheet.id, { rows: edited.rows }, sheet.updatedAt, actor);
        expect("sheet" in result && result.sync).toEqual({ added: 0, updated: 0, removed: 0 });
      }
      expect(await services.assets.list(itemId)).toEqual(linesBefore);
    });
  });
});

// ---- templates ---------------------------------------------------------------------------

describe("sheet templates", () => {
  it("blank, campaign and asset layouts have unique ids and a frozen count within the columns", () => {
    for (const draft of [blankSheet("t", "B"), emptyTemplateSheet("t", "C", 3), assetSheet("t", "A", ["Banner", "Video"])]) {
      expect(allUnique(ids(draft.columns))).toBe(true);
      expect(allUnique(ids(draft.rows))).toBe(true);
      expect(draft.frozenColumns).toBeGreaterThanOrEqual(0);
      expect(draft.frozenColumns).toBeLessThanOrEqual(draft.columns.length);
      expect(draft.columns.every((c) => c.width > 0)).toBe(true);
    }
    expect(emptyTemplateSheet("t", "C", 3).rows).toHaveLength(3);
    const types = assetSheet("t", "A", ["Banner"]).columns.find((c) => c.type === "list")!;
    expect(types.options).toEqual(["Banner"]);
  });
});
