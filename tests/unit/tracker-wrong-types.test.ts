import { describe, expect, it } from "vitest";
import { emptyAssetMapping, readDate, readQuantity, roleMismatch, sheetAssetLines, sheetLineCells, wrongColumnType, type TrackerAssetMapping, type TrackerColumn, type TrackerRow } from "@/domain";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices } from "@/services";
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
    expect(roleMismatch(sheet, "dt", "done")).toEqual({ unreadable: 1, filled: 1, expected: "a done mark", rowIds: ["a"], wrongType: "date" });
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

describe("making a column fit its part (v0.133.1)", () => {
  const columns = [col("n", "Asset", "text"), col("ok", "Approved", "checkbox"), col("num", "Day", "number"), col("txt", "When", "text"), col("q", "Count", "text")];
  const rows = [
    data("a", { n: "Poster", ok: true, num: 46000, txt: "14/03/2026", q: "3 pcs" }),
    data("b", { n: "Flyer", ok: false, num: 3, txt: "next week", q: "lots" }),
    data("c", { n: "Banner", num: 46010, txt: "2026-04-01", q: 2 }),
    { id: "band", kind: "section" as const, label: "Print", cells: {} },
  ];
  const base = { id: "s", trackerId: "t", name: "S", position: 0, columns, rows, frozenColumns: 1, itemId: null, assetMapping: null, createdAt: "", updatedAt: "" } as unknown as Parameters<typeof TrackerService.fitColumn>[0];

  it("clears only what the part cannot read in a column of the right type, and leaves the rest as typed", () => {
    const out = TrackerService.fitColumn(base, "txt", "due");
    expect(out.cleared).toBe(1);
    expect(out.retyped).toBeNull();
    expect(out.sheet.rows.map((r) => r.cells.txt ?? null)).toEqual(["14/03/2026", null, "2026-04-01", null]);
    expect(out.sheet.columns.find((c) => c.id === "txt")!.type).toBe("text");
    // Nothing else in the sheet moves.
    expect(out.sheet.rows.map((r) => r.cells.n ?? null)).toEqual(["Poster", "Flyer", "Banner", null]);
  });

  it("a Number column as the due date becomes a Date column: Excel days become dates, a 3 is cleared", () => {
    const out = TrackerService.fitColumn(base, "num", "due");
    expect(out).toMatchObject({ cleared: 1, retyped: "date" });
    expect(out.sheet.columns.find((c) => c.id === "num")!.type).toBe("date");
    expect(out.sheet.rows.map((r) => r.cells.num ?? null)).toEqual(["2025-12-09", null, "2025-12-19", null]);
    expect(roleMismatch(out.sheet, "num", "due")).toBeNull();
  });

  it("a Checkbox column as the due date: every tick cleared, and it becomes a Date column", () => {
    const out = TrackerService.fitColumn(base, "ok", "due");
    expect(out).toMatchObject({ cleared: 1, retyped: "date" });
    expect(out.sheet.rows.every((r) => !("ok" in r.cells))).toBe(true);
  });

  it("quantities: words cleared, counts with units kept", () => {
    const out = TrackerService.fitColumn(base, "q", "quantity");
    expect(out.cleared).toBe(1);
    expect(out.sheet.rows.map((r) => r.cells.q ?? null)).toEqual(["3 pcs", null, 2, null]);
    expect(roleMismatch(out.sheet, "q", "quantity")).toBeNull();
  });

  it("a column that already fits is left alone", () => {
    const out = TrackerService.fitColumn(base, "n", "name");
    expect(out).toEqual({ sheet: base, cleared: 0, retyped: null });
  });

  it("saves through the service and the column fits afterwards", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `fit-${Date.now()}-${Math.random()}` }));
    const { sheets } = await services.trackers.create(
      { workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Fit", layout: "blank", sheets: [{ name: "S", columns, frozenColumns: 1, rows: rows.filter((r) => r.kind === "data") }] },
      SEED_USER_IDS.jun,
    );
    const done = await services.trackers.fitAssetColumn(sheets[0]!.id, "num", "due", SEED_USER_IDS.jun);
    expect(done).toMatchObject({ cleared: 1, retyped: "date" });
    const saved = await services.trackers.getSheet(sheets[0]!.id);
    expect(saved.columns.find((c) => c.id === "num")!.type).toBe("date");
    expect(roleMismatch(saved, "num", "due")).toBeNull();
    // Asked again, nothing is left to do.
    expect(await services.trackers.fitAssetColumn(sheets[0]!.id, "num", "due", SEED_USER_IDS.jun)).toMatchObject({ cleared: 0, retyped: null });
  });
});
