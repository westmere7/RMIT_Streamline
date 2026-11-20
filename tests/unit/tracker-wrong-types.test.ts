import { describe, expect, it } from "vitest";
import { emptyAssetMapping, readDate, readQuantity, roleMismatch, sheetAssetLines, sheetLineCells, wrongColumnType, type TrackerAssetMapping, type TrackerColumn, type TrackerRow } from "@/domain";
import { TrackerService } from "@/services/tracker-service";

/**
 * A column picked for a part that holds the wrong kind of data (v0.132.5):
 * dates typed as text, a Checkbox column as the due date, words in a Quantity
 * column. What reads is read the way the sheet types it; what does not is
 * flagged cell by cell, and a column type a part cannot use is called out and
 * never written back into.
 */
const col = (id: string, name: string, type: TrackerColumn["type"]): TrackerColumn => ({ id, name, type, width: 120 });
const data = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
const mapWith = (patch: Partial<TrackerAssetMapping>): TrackerAssetMapping => ({ ...emptyAssetMapping(), name: "n", ...patch });

describe("reading a cell as a date or a count", () => {
  it("reads dates the way the sheet types them, and guesses nothing", () => {
    expect(readDate("2026-03-14")).toBe("2026-03-14");
    expect(readDate("14/03/2026")).toBe("2026-03-14");
    expect(readDate("14.3.26")).toBe("2026-03-14");
    expect(readDate("14 March 2026")).toBe("2026-03-14");
    expect(readDate(46000)).toBe("2025-12-09");
    expect(readDate("46000")).toBe("2025-12-09");
    for (const no of ["next week", "14/03", "2026-02-30", "31/02/2026", "Q3", "12", "", true, null, undefined, 12, Number.NaN]) expect(readDate(no as never)).toBeNull();
  });

  it("reads counts with their unit, whole, and nothing that is not one", () => {
    expect(readQuantity(3)).toBe(3);
    expect(readQuantity("1,200")).toBe(1200);
    expect(readQuantity("3 pcs")).toBe(3);
    expect(readQuantity("x3")).toBe(3);
    expect(readQuantity("3x")).toBe(3);
    expect(readQuantity("2.5")).toBe(3);
    for (const no of ["three", "-2", -2, "0x10", "1e3", "", true, null, "99999999999"]) expect(readQuantity(no as never)).toBeNull();
  });

  it("the sheet's own typing into a Date column is unchanged: what reads becomes a date, the rest is kept as typed", () => {
    const date = col("d", "Due", "date");
    expect(TrackerService.coerce(date, "14/03/2026")).toBe("2026-03-14");
    expect(TrackerService.coerce(date, "2026-02-30")).toBe("2026-02-30");
    expect(TrackerService.coerce(date, "next week")).toBe("next week");
    expect(TrackerService.coerce(date, "46000")).toBe("2025-12-09");
    expect(TrackerService.coerce(date, "  ")).toBeNull();
  });
});

describe("a column of the wrong kind", () => {
  const columns = [col("n", "Asset", "text"), col("ok", "Approved", "checkbox"), col("num", "Day", "number"), col("txt", "When", "text"), col("st", "Status", "text"), col("dt", "Delivered", "date")];
  const rows = [
    data("a", { n: "Poster", ok: true, num: 46000, txt: "14/03/2026", st: "Done", dt: "2026-03-01" }),
    data("b", { n: "Flyer", ok: false, num: 3, txt: "next week", st: "WIP" }),
    data("c", { n: "Banner", ok: true, num: 46010, txt: "", st: "" }),
  ];
  const sheet = { columns, rows };

  it("names the column types a part cannot use", () => {
    expect(wrongColumnType(col("x", "X", "checkbox"), "due")).toBe("checkbox");
    expect(wrongColumnType(col("x", "X", "checkbox"), "name")).toBe("checkbox");
    expect(wrongColumnType(col("x", "X", "date"), "quantity")).toBe("date");
    expect(wrongColumnType(col("x", "X", "text"), "due")).toBeNull();
    expect(wrongColumnType(col("x", "X", "checkbox"), "spec")).toBeNull();
    expect(wrongColumnType(col("x", "X", "checkbox"), null)).toBeNull();
  });

  it("flags a Checkbox column as the due date, and each ticked cell in it", () => {
    expect(roleMismatch(sheet, "ok", "due")).toEqual({ unreadable: 2, filled: 2, expected: "a date", rowIds: ["a", "c"], wrongType: "checkbox" });
  });

  it("a Number column as the due date: the wrong type, but Excel day numbers still read and only the rest are flagged", () => {
    expect(roleMismatch(sheet, "num", "due")).toEqual({ unreadable: 1, filled: 3, expected: "a date", rowIds: ["b"], wrongType: "number" });
  });

  it("a Text column of dates: the right type, only the cell that is no date flagged", () => {
    expect(roleMismatch(sheet, "txt", "due")).toEqual({ unreadable: 1, filled: 2, expected: "a date", rowIds: ["b"], wrongType: null });
  });

  it("a name from a Checkbox column is flagged (it would read as Yes); a done mark reads from any text but not from a Date column", () => {
    expect(roleMismatch(sheet, "ok", "name")).toMatchObject({ wrongType: "checkbox", rowIds: ["a", "c"] });
    expect(roleMismatch(sheet, "st", "done")).toBeNull();
    expect(roleMismatch(sheet, "dt", "done")).toEqual({ unreadable: 0, filled: 1, expected: "a done mark", rowIds: [], wrongType: "date" });
  });

  it("an empty column of the wrong type is still called out", () => {
    const empty = { columns: [col("n", "Asset", "text"), col("e", "Count", "date")], rows: [data("a", { n: "Poster" })] };
    expect(roleMismatch(empty, "e", "quantity")).toEqual({ unreadable: 0, filled: 0, expected: "a number", rowIds: [], wrongType: "date" });
  });

  it("lines take what reads: dates typed as text, Excel days in a Number column; the rest gets the value for every row", () => {
    const fromText = sheetAssetLines(sheet, mapWith({ due: { columnId: "txt", value: "2030-01-01" } }));
    expect(fromText.map((l) => l.dueDate)).toEqual(["2026-03-14", "2030-01-01", "2030-01-01"]);
    const fromNumber = sheetAssetLines(sheet, mapWith({ due: { columnId: "num", value: null } }));
    expect(fromNumber.map((l) => l.dueDate)).toEqual(["2025-12-09", null, "2025-12-19"]);
  });

  it("never writes a change made on the task into a column that cannot hold it", () => {
    const into = (columnId: string, patch: Parameters<typeof sheetLineCells>[2], role: Partial<TrackerAssetMapping>) => sheetLineCells(sheet, mapWith(role), patch);
    const refused = into("ok", { dueDate: "2026-04-01" }, { due: { columnId: "ok", value: null } });
    expect(refused.cells).toEqual([]);
    expect(refused.refused).toBe("“Approved” in the sheet is a Checkbox column and can't hold a date. Change it there.");
    expect(into("num", { dueDate: "2026-04-01" }, { due: { columnId: "num", value: null } }).refused).toMatch(/Number column/);
    expect(into("dt", { quantity: 2 }, { quantity: { columnId: "dt", value: null } }).refused).toMatch(/Date column and can't hold a number/);
    // A column of the right type takes it as before.
    expect(into("txt", { dueDate: "2026-04-01" }, { due: { columnId: "txt", value: null } })).toEqual({ cells: [{ columnId: "txt", value: "2026-04-01" }], refused: null });
    expect(into("ok", { completedAt: "2026-04-01T00:00:00Z" }, { done: { columnId: "ok", values: [] } })).toEqual({ cells: [{ columnId: "ok", value: true }], refused: null });
  });
});
