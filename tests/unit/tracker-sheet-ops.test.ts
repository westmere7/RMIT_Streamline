import { describe, expect, it } from "vitest";
import type { TrackerColumn, TrackerRow, TrackerSheet } from "@/domain";
import { cleanCellFormat, mergeSheets } from "@/domain";
import { fillRange, fillRangeEdits } from "@/features/trackers/sheet-view";
import { TrackerService } from "@/services/tracker-service";

/**
 * Sheet operations behind the grid (v0.160): the fill handle, cell formatting,
 * moving several columns, and formatting surviving a merge.
 */
const col = (id: string, type: TrackerColumn["type"] = "text"): TrackerColumn => ({ id, name: id.toUpperCase(), type, width: 120 });
const data = (id: string, cells: TrackerRow["cells"], formats?: TrackerRow["formats"]): TrackerRow => ({ id, kind: "data", cells, ...(formats ? { formats } : {}) });
const band = (id: string): TrackerRow => ({ id, kind: "section", label: "Band", cells: {} });

function sheet(rows: TrackerRow[], columns: TrackerColumn[] = [col("a"), col("n", "number"), col("c")]): TrackerSheet {
  return { id: "s", trackerId: "t", name: "S", position: 0, columns, rows, frozenColumns: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as TrackerSheet;
}
const cell = (s: TrackerSheet, rowId: string, columnId: string) => s.rows.find((r) => r.id === rowId)!.cells[columnId];

describe("the fill handle", () => {
  it("repeats text down, and continues a run of numbers", () => {
    const s = sheet([data("r1", { a: "x", n: 1 }), data("r2", { a: "y", n: 2 }), data("r3", {}), data("r4", {}), data("r5", {})]);
    const out = fillRange(s, s.rows, { top: 0, bottom: 1, left: 0, right: 1 }, { top: 0, bottom: 4, left: 0, right: 1 });
    expect(["r3", "r4", "r5"].map((id) => cell(out, id, "a"))).toEqual(["x", "y", "x"]);
    expect(["r3", "r4", "r5"].map((id) => cell(out, id, "n"))).toEqual([3, 4, 5]);
  });

  it("copies a single number rather than counting from it, as Excel does", () => {
    const s = sheet([data("r1", { n: 7 }), data("r2", {}), data("r3", {})]);
    const out = fillRange(s, s.rows, { top: 0, bottom: 0, left: 1, right: 1 }, { top: 0, bottom: 2, left: 1, right: 1 });
    expect([cell(out, "r2", "n"), cell(out, "r3", "n")]).toEqual([7, 7]);
  });

  it("fills up, continuing a run backwards", () => {
    const s = sheet([data("r1", {}), data("r2", {}), data("r3", { n: 10 }), data("r4", { n: 20 })]);
    const out = fillRange(s, s.rows, { top: 2, bottom: 3, left: 1, right: 1 }, { top: 0, bottom: 3, left: 1, right: 1 });
    expect([cell(out, "r1", "n"), cell(out, "r2", "n")]).toEqual([-10, 0]);
  });

  it("fills right and left along a row, into each column's own type", () => {
    const s = sheet([data("r1", { a: "1" }), data("r2", { c: "z" })]);
    const right = fillRange(s, s.rows, { top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 0, left: 0, right: 2 });
    expect([cell(right, "r1", "n"), cell(right, "r1", "c")]).toEqual([1, "1"]);
    const left = fillRange(s, s.rows, { top: 1, bottom: 1, left: 2, right: 2 }, { top: 1, bottom: 1, left: 0, right: 2 });
    expect(cell(left, "r2", "a")).toBe("z");
  });

  it("skips bands, and an empty source clears what it lands on", () => {
    const s = sheet([data("r1", {}), band("b"), data("r2", { a: "old" })]);
    const { edits } = fillRangeEdits(s, s.rows, { top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 2, left: 0, right: 0 });
    expect(edits).toEqual([{ rowId: "r2", columnId: "a", value: null }]);
    const out = fillRange(s, s.rows, { top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 2, left: 0, right: 0 });
    expect(cell(out, "r2", "a")).toBeUndefined();
  });

  it("brings the formatting along", () => {
    const s = sheet([data("r1", { a: "x" }, { a: { bold: true, size: "lg" } }), data("r2", { a: "y" }, { a: { italic: true } })]);
    const out = fillRange(s, s.rows, { top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 1, left: 0, right: 0 });
    expect(out.rows[1]!.formats).toEqual({ a: { bold: true, size: "lg" } });
  });
});

describe("cell formatting", () => {
  it("merges a patch into each cell, keeps only what differs from plain, and leaves bands alone", () => {
    const s = sheet([data("r1", { a: "x" }), band("b")]);
    let out = TrackerService.setFormats(s, [{ rowId: "r1", columnId: "a" }, { rowId: "b", columnId: "a" }], { bold: true, size: "xl" });
    expect(out.rows[0]!.formats).toEqual({ a: { bold: true, size: "xl" } });
    expect(out.rows[1]!.formats).toBeUndefined();
    out = TrackerService.setFormats(out, [{ rowId: "r1", columnId: "a" }], { bold: false, size: "md" as never });
    expect(out.rows[0]!.formats).toBeUndefined();
  });

  it("keeps formatting when the value is cleared, and drops it with its column", () => {
    const s = sheet([data("r1", { a: "x", c: "y" }, { a: { underline: true }, c: { bold: true } })]);
    const cleared = TrackerService.applyEdits(s, [{ rowId: "r1", columnId: "a", value: null }]);
    expect(cleared.rows[0]!.formats?.a).toEqual({ underline: true });
    const gone = TrackerService.deleteColumn(s, "a");
    expect(gone.rows[0]!.formats).toEqual({ c: { bold: true } });
  });

  it("travels with a duplicated row and goes when a row becomes a band", () => {
    const s = sheet([data("r1", { a: "x" }, { a: { italic: true } })]);
    const twice = TrackerService.duplicateRows(s, ["r1"]);
    expect(twice.rows[1]!.formats).toEqual({ a: { italic: true } });
    const banded = TrackerService.setRowKind(s, ["r1"], "section");
    expect(banded.rows[0]!.formats).toBeUndefined();
  });

  it("cleans a link and a size", () => {
    expect(cleanCellFormat({ link: "  https://rmit.edu.au  ", size: "sm" })).toEqual({ link: "https://rmit.edu.au", size: "sm" });
    expect(cleanCellFormat({ link: " ", bold: false })).toBeNull();
  });
});

describe("moving columns", () => {
  it("moves a block of columns together, in order", () => {
    const s = sheet([data("r1", {})], [col("a"), col("b"), col("c"), col("d")]);
    expect(TrackerService.moveColumns(s, ["b", "c"], 2).columns.map((c) => c.id)).toEqual(["a", "d", "b", "c"]);
    expect(TrackerService.moveColumns(s, ["c", "d"], 0).columns.map((c) => c.id)).toEqual(["c", "d", "a", "b"]);
  });
});

describe("formatting in a merge", () => {
  it("keeps one side's bold and the other side's typing in the same row", () => {
    const base = sheet([data("r1", { a: "x" })]);
    const mine = TrackerService.setFormats(base, [{ rowId: "r1", columnId: "a" }], { bold: true });
    const theirs = TrackerService.applyEdits(base, [{ rowId: "r1", columnId: "c", value: "typed" }]);
    const merged = mergeSheets(base, mine, theirs);
    expect(merged.rows[0]!.formats).toEqual({ a: { bold: true } });
    expect(merged.rows[0]!.cells.c).toBe("typed");
  });

  it("drops a format whose column the other side deleted", () => {
    const base = sheet([data("r1", { a: "x" })]);
    const mine = TrackerService.setFormats(base, [{ rowId: "r1", columnId: "a" }], { italic: true });
    const theirs = TrackerService.deleteColumn(base, "a");
    expect(mergeSheets(base, mine, theirs).rows[0]!.formats).toBeUndefined();
  });
});
