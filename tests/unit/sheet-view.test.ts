import { describe, expect, it } from "vitest";
import type { TrackerColumn, TrackerRow, TrackerSheet } from "@/domain";
import { EMPTY_VIEW, distinctValues, excelNumberFormat, fillDown, formatNumber, projectSheet, selectionStats, summarize, summaryKindsFor } from "@/features/trackers/sheet-view";

const columns: TrackerColumn[] = [
  { id: "channel", name: "Channel", type: "list", width: 120, options: ["YouTube", "Display"] },
  { id: "status", name: "Status", type: "list", width: 120, options: ["Done", "Open"] },
  { id: "qty", name: "Quantity", type: "number", width: 100 },
  { id: "ok", name: "Approved", type: "checkbox", width: 80 },
  { id: "live", name: "Live", type: "date", width: 100 },
];

const data = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
const band = (id: string, label: string, kind: TrackerRow["kind"] = "section"): TrackerRow => ({ id, kind, label, cells: {} });

const sheet: TrackerSheet = {
  id: "s",
  trackerId: "t",
  name: "Sheet",
  position: 0,
  frozenColumns: 1,
  columns,
  createdAt: "",
  updatedAt: "",
  rows: [
    band("p1", "Phase 1"),
    data("a", { channel: "YouTube", status: "Done", qty: 10, ok: true, live: "2026-09-01" }),
    data("b", { channel: "Display", status: "Open", qty: 4, live: "2026-08-15" }),
    data("c", { channel: "YouTube", status: "Open", qty: "6", ok: false }),
    band("p2", "Phase 2"),
    data("d", { channel: "Display", status: "Done", qty: 2, ok: true, live: "2026-10-01" }),
    data("e", {}),
  ],
};

describe("sheet view", () => {
  it("shows everything, in order, without a view", () => {
    const view = projectSheet(sheet, EMPTY_VIEW);
    expect(view.rows.map((r) => r.id)).toEqual(["p1", "a", "b", "c", "p2", "d", "e"]);
    expect(view.sourceIndex).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(view.hiddenDataRows).toBe(0);
  });

  it("filters by search text and by column values, dropping bands left empty", () => {
    const search = projectSheet(sheet, { ...EMPTY_VIEW, query: "youtube" });
    expect(search.rows.map((r) => r.id)).toEqual(["p1", "a", "c"]);
    expect(search.hiddenDataRows).toBe(3);

    const byValue = projectSheet(sheet, { ...EMPTY_VIEW, filters: { status: ["Done"] } });
    expect(byValue.rows.map((r) => r.id)).toEqual(["p1", "a", "p2", "d"]);

    const empties = projectSheet(sheet, { ...EMPTY_VIEW, filters: { channel: ["(empty)"] } });
    expect(empties.rows.map((r) => r.id)).toEqual(["p2", "e"]);

    const both = projectSheet(sheet, { ...EMPTY_VIEW, query: "display", filters: { status: ["Done"] } });
    expect(both.rows.map((r) => r.id)).toEqual(["p2", "d"]);
  });

  it("sorts data rows within their bands, blanks last, numbers and dates naturally", () => {
    const byQty = projectSheet(sheet, { ...EMPTY_VIEW, sort: { columnId: "qty", direction: "desc" } });
    expect(byQty.rows.map((r) => r.id)).toEqual(["p1", "a", "c", "b", "p2", "d", "e"]);
    expect(byQty.sourceIndex).toEqual([0, 1, 3, 2, 4, 5, 6]);

    const byDate = projectSheet(sheet, { ...EMPTY_VIEW, sort: { columnId: "live", direction: "asc" } });
    expect(byDate.rows.map((r) => r.id)).toEqual(["p1", "b", "a", "c", "p2", "d", "e"]);
  });

  it("lists distinct values with counts, most common first", () => {
    expect(distinctValues(sheet, columns[0]!)).toEqual([
      { value: "Display", count: 2 },
      { value: "YouTube", count: 2 },
      { value: "(empty)", count: 1 },
    ]);
  });

  it("summarises columns by type, with sensible defaults", () => {
    expect(summarize(columns[2]!, sheet.rows)).toMatchObject({ kind: "sum", value: 22, text: "Sum 22" });
    expect(summarize({ ...columns[2]!, summary: "average" }, sheet.rows)).toMatchObject({ value: 5.5, text: "Avg 5.5" });
    expect(summarize({ ...columns[2]!, summary: "max", numberFormat: "currency" }, sheet.rows).text).toBe("Max $10.00");
    expect(summarize(columns[3]!, sheet.rows)).toMatchObject({ kind: "checked", value: 2, text: "2 of 5 checked" });
    expect(summarize({ ...columns[3]!, summary: "percentChecked" }, sheet.rows).text).toBe("40% checked");
    expect(summarize(columns[0]!, sheet.rows)).toMatchObject({ kind: "count", value: 4, text: "4 filled" });
    expect(summarize({ ...columns[0]!, summary: "empty" }, sheet.rows).text).toBe("1 empty");
    expect(summarize({ ...columns[0]!, summary: "none" }, sheet.rows).text).toBe("");
    expect(summaryKindsFor(columns[2]!)).toContain("average");
    expect(summaryKindsFor(columns[0]!)).not.toContain("sum");
  });

  it("summarises only what is visible when combined with a view", () => {
    const view = projectSheet(sheet, { ...EMPTY_VIEW, filters: { channel: ["YouTube"] } });
    expect(summarize(columns[2]!, view.rows).value).toBe(16);
  });

  it("gives Excel-style quick stats for a selection", () => {
    expect(selectionStats(sheet, sheet.rows.slice(1, 4), 2, 2)).toEqual({ count: 3, sum: 20, average: 6.67 });
    expect(selectionStats(sheet, sheet.rows.slice(1, 4), 0, 0)).toEqual({ count: 3, sum: null, average: null });
  });

  it("fills down from the top of a selection, or from the cell above a single cell", () => {
    const filled = fillDown(sheet, sheet.rows, { top: 1, bottom: 3, left: 1, right: 1 });
    expect(filled.rows.slice(1, 4).map((r) => r.cells.status)).toEqual(["Done", "Done", "Done"]);
    const single = fillDown(sheet, sheet.rows, { top: 6, bottom: 6, left: 0, right: 0 });
    expect(single.rows[6]!.cells.channel).toBe("Display");
    // Bands are never written to, and filling a single top row does nothing.
    expect(fillDown(sheet, sheet.rows, { top: 0, bottom: 0, left: 0, right: 0 })).toBe(sheet);
  });

  it("formats numbers for display and export", () => {
    expect(formatNumber(1234.5, "integer")).toBe("1,235");
    expect(formatNumber(1234.5, "decimal")).toBe("1,234.50");
    expect(formatNumber(1234.5, "currency")).toBe("$1,234.50");
    expect(formatNumber(0.125, "percent")).toBe("12.5%");
    expect(excelNumberFormat("currency")).toBe('"$"#,##0.00');
    expect(excelNumberFormat("plain")).toBeUndefined();
  });
});
