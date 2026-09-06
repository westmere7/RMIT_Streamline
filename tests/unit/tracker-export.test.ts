import { describe, expect, it } from "vitest";
import type { TrackerSheet } from "@/domain";
import { sheetToCsv } from "@/features/trackers/grid-model";
import { sheetsToWorkbook, workbookToSheets } from "@/services/tracker-xlsx";

const sheet: TrackerSheet = {
  id: "s",
  trackerId: "t",
  name: "Assets",
  position: 0,
  frozenColumns: 1,
  createdAt: "",
  updatedAt: "",
  columns: [
    { id: "asset", name: "Asset", type: "text", width: 160, summary: "none" },
    { id: "cost", name: "Cost", type: "number", width: 100, numberFormat: "currency" },
    { id: "qty", name: "Quantity", type: "number", width: 90, numberFormat: "integer", summary: "average" },
    { id: "approved", name: "Approved", type: "checkbox", width: 90 },
    { id: "live", name: "Live", type: "date", width: 110 },
  ],
  rows: [
    { id: "b1", kind: "section", label: "Phase 1", cells: {} },
    { id: "r1", kind: "data", cells: { asset: "Banner", cost: 1200.5, qty: 3, approved: true, live: "2026-09-01" } },
    { id: "r2", kind: "data", cells: { asset: "Video, 30s", cost: 800, qty: 1 } },
    { id: "r3", kind: "data", cells: { asset: 'Poster "A2"', cost: 99.99, qty: 2, approved: true } },
  ],
};

describe("tracker export", () => {
  it("writes an autofilter, number formats and a totals row of live formulas", async () => {
    const bytes = await sheetsToWorkbook("Tracker", [sheet]);
    const Excel = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new Excel.Workbook();
    await wb.xlsx.load(bytes as never);
    const ws = wb.getWorksheet("Assets")!;
    expect(ws.autoFilter).toBeTruthy();
    // Cost is currency-formatted; quantity a whole number.
    expect(ws.getCell("B3").numFmt).toBe('"$"#,##0.00');
    expect(ws.getCell("C3").numFmt).toBe("#,##0");
    // Data ends on row 5 (header + band + 3 rows); a blank row; totals on row 7.
    const totals = ws.getRow(7);
    expect(totals.getCell(1).value).toBe("Total");
    expect((totals.getCell(2).value as { formula: string }).formula).toBe("SUM(B2:B5)");
    expect((totals.getCell(3).value as { formula: string }).formula).toBe('IFERROR(AVERAGE(C2:C5),"")');
    expect((totals.getCell(4).value as { formula: string }).formula).toBe('COUNTIF(D2:D5,"Y")');
    expect((totals.getCell(5).value as { formula: string }).formula).toBe("COUNTA(E2:E5)");
  });

  it("round-trips without importing the totals row, and recognises number columns and their formats", async () => {
    const bytes = await sheetsToWorkbook("Tracker", [sheet]);
    const { sheets } = await workbookToSheets(bytes);
    const back = sheets[0]!;
    const byName = Object.fromEntries(back.columns.map((c) => [c.name, c]));
    expect(byName.Cost!.type).toBe("number");
    expect(byName.Cost!.numberFormat).toBe("currency");
    expect(byName.Quantity!.type).toBe("number");
    expect(byName.Quantity!.numberFormat).toBe("integer");
    expect(byName.Live!.type).toBe("date");
    const dataRows = back.rows.filter((r) => r.kind === "data" && Object.keys(r.cells).length > 0);
    expect(dataRows).toHaveLength(3);
    expect(back.rows.some((r) => Object.values(r.cells).some((v) => v === "Total"))).toBe(false);
    expect(dataRows[0]!.cells[byName.Cost!.id]).toBe(1200.5);
    expect(back.rows[0]).toMatchObject({ kind: "section", label: "Phase 1" });
  });

  it("writes CSV that Excel opens cleanly: BOM, quoted commas and quotes, bands as one cell", () => {
    const csv = sheetToCsv(sheet);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Asset,Cost,Quantity,Approved,Live");
    expect(lines[1]).toBe("Phase 1");
    expect(lines[2]).toBe("Banner,1200.5,3,Y,2026-09-01");
    expect(lines[3]).toBe('"Video, 30s",800,1,,');
    expect(lines[4]).toBe('"Poster ""A2""",99.99,2,Y,');
  });
});
