import { describe, expect, it } from "vitest";
import type { TrackerColumn, TrackerRow, TrackerSheet } from "@/domain";
import { EMPTY_VIEW, clearVisible, jumpTarget, pasteVisible, projectSheet } from "@/features/trackers/sheet-view";

const columns: TrackerColumn[] = [
  { id: "name", name: "Asset", type: "text", width: 120 },
  { id: "status", name: "Status", type: "list", width: 120, options: ["Done", "Open"] },
  { id: "qty", name: "Qty", type: "number", width: 80 },
];
const data = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
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
    { id: "band", kind: "section", label: "Phase 1", cells: {} },
    data("a", { name: "Banner", status: "Done", qty: 1 }),
    data("b", { name: "Video", status: "Open" }),
    data("c", { name: "Poster", status: "Done", qty: 3 }),
    data("d", {}),
  ],
};

describe("editing through a filtered view", () => {
  it("pastes onto the visible rows and appends when the block runs past them", () => {
    const view = { ...EMPTY_VIEW, filters: { status: ["Done"] } };
    const visible = projectSheet(sheet, view).rows; // band, a, c
    const next = pasteVisible(sheet, visible, { row: 1, col: 2 }, [["10"], ["30"], ["50"]], null);
    const byId = Object.fromEntries(next.rows.map((r) => [r.id, r]));
    expect(byId.a!.cells.qty).toBe(10);
    expect(byId.c!.cells.qty).toBe(30);
    // The hidden "Video" row is untouched; the overflow went to a new row at the end.
    expect(byId.b!.cells.qty).toBeUndefined();
    expect(next.rows).toHaveLength(6);
    expect(next.rows[5]!.cells.qty).toBe(50);
  });

  it("fills a whole selection with a single pasted value and clears only visible cells", () => {
    const visible = projectSheet(sheet, EMPTY_VIEW).rows;
    const filled = pasteVisible(sheet, visible, { row: 1, col: 1 }, [["Open"]], { top: 1, bottom: 4, left: 1, right: 1 });
    expect(filled.rows.slice(1).map((r) => r.cells.status)).toEqual(["Open", "Open", "Open", "Open"]);

    const view = { ...EMPTY_VIEW, query: "poster" };
    const shown = projectSheet(sheet, view).rows; // band, c
    const cleared = clearVisible(sheet, shown, { top: 0, bottom: 1, left: 0, right: 2 });
    expect(cleared.rows.find((r) => r.id === "c")!.cells).toEqual({});
    expect(cleared.rows.find((r) => r.id === "a")!.cells.name).toBe("Banner");
  });

  it("jumps like Ctrl+Arrow in Excel: to the end of a filled run, across gaps, or to the edge", () => {
    const rows = sheet.rows;
    // Down the Qty column from "a" (1): the next cell is blank, so land on the next filled one.
    expect(jumpTarget(sheet, rows, { row: 1, col: 2 }, 1, 0)).toEqual({ row: 3, col: 2 });
    // From "c" downward there is nothing filled, so go to the last row.
    expect(jumpTarget(sheet, rows, { row: 3, col: 2 }, 1, 0)).toEqual({ row: 4, col: 2 });
    // Down the Asset column from the band: a, b, c are a run, so stop at c.
    expect(jumpTarget(sheet, rows, { row: 0, col: 0 }, 1, 0)).toEqual({ row: 3, col: 0 });
    // Right along row a: all three filled, stop at the last column.
    expect(jumpTarget(sheet, rows, { row: 1, col: 0 }, 0, 1)).toEqual({ row: 1, col: 2 });
    // At an edge nothing moves.
    expect(jumpTarget(sheet, rows, { row: 4, col: 2 }, 1, 0)).toEqual({ row: 4, col: 2 });
  });
});
