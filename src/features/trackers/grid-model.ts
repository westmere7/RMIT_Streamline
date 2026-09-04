import type { TrackerCellValue, TrackerColumn, TrackerRow, TrackerSheet } from "@/domain";
import { TrackerService } from "@/services/tracker-service";

/**
 * Pure helpers behind the grid: selection ranges, clipboard text and paste
 * placement. Kept free of React so they can be unit-tested directly.
 */

export interface CellAddress {
  row: number;
  col: number;
}

export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rangeBetween(a: CellAddress, b: CellAddress): CellRange {
  return { top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) };
}

export function inRange(range: CellRange, row: number, col: number): boolean {
  return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
}

export function clampAddress(sheet: Pick<TrackerSheet, "rows" | "columns">, address: CellAddress): CellAddress {
  return { row: Math.max(0, Math.min(sheet.rows.length - 1, address.row)), col: Math.max(0, Math.min(sheet.columns.length - 1, address.col)) };
}

/** Text shown in a cell and copied to the clipboard. */
export function formatCell(column: TrackerColumn, value: TrackerCellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Y" : "N";
  if (column.type === "date" && typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return String(value);
}

/** Tab-separated text for a range, one line per row; section rows contribute their label. */
export function rangeToTsv(sheet: TrackerSheet, range: CellRange): string {
  const lines: string[] = [];
  for (let r = range.top; r <= range.bottom; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    if (row.kind !== "data") {
      lines.push(row.label ?? "");
      continue;
    }
    const cells: string[] = [];
    for (let c = range.left; c <= range.right; c++) {
      const column = sheet.columns[c];
      cells.push(column ? escapeTsv(formatCell(column, row.cells[column.id])) : "");
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

function escapeTsv(text: string): string {
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Parses clipboard text (Excel writes TSV, quoting cells that contain tabs/newlines). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  // Excel appends a trailing newline; drop the empty last row it produces.
  if (rows.length > 1 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === "") rows.pop();
  return rows;
}

/**
 * Writes a block of text starting at `at`, growing the sheet with new rows when
 * the block runs past the end. A single value fills the whole selection instead.
 */
export function pasteBlock(sheet: TrackerSheet, at: CellAddress, block: string[][], selection: CellRange | null): TrackerSheet {
  const single = block.length === 1 && block[0]!.length === 1;
  const target: CellRange = single && selection ? selection : { top: at.row, left: at.col, bottom: at.row + block.length - 1, right: at.col + Math.max(...block.map((r) => r.length)) - 1 };
  let next = sheet;
  const missing = target.bottom - (next.rows.length - 1);
  if (missing > 0) next = TrackerService.insertRows(next, next.rows.length, missing);
  const edits: Array<{ rowId: string; columnId: string; value: TrackerCellValue }> = [];
  for (let r = target.top; r <= target.bottom; r++) {
    const row: TrackerRow | undefined = next.rows[r];
    if (!row || row.kind !== "data") continue;
    for (let c = target.left; c <= target.right && c < next.columns.length; c++) {
      const column = next.columns[c]!;
      const raw = single ? block[0]![0]! : (block[r - target.top]?.[c - target.left] ?? "");
      edits.push({ rowId: row.id, columnId: column.id, value: TrackerService.coerce(column, raw) });
    }
  }
  return TrackerService.applyEdits(next, edits);
}

/** Clears every data cell in the range. */
export function clearRange(sheet: TrackerSheet, range: CellRange): TrackerSheet {
  const edits: Array<{ rowId: string; columnId: string; value: TrackerCellValue }> = [];
  for (let r = range.top; r <= range.bottom; r++) {
    const row = sheet.rows[r];
    if (!row || row.kind !== "data") continue;
    for (let c = range.left; c <= range.right; c++) {
      const column = sheet.columns[c];
      if (column && column.id in row.cells) edits.push({ rowId: row.id, columnId: column.id, value: null });
    }
  }
  return edits.length ? TrackerService.applyEdits(sheet, edits) : sheet;
}

/** Sticky offsets for frozen columns: row-number gutter first, then cumulative widths. */
export function frozenOffsets(columns: TrackerColumn[], frozen: number, gutter: number): number[] {
  const offsets: number[] = [];
  let x = gutter;
  for (let i = 0; i < Math.min(frozen, columns.length); i++) {
    offsets.push(x);
    x += columns[i]!.width;
  }
  return offsets;
}
