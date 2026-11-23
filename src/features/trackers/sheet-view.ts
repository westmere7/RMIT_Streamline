import type { EntityId, TrackerCellFormat, TrackerCellValue, TrackerColumn, TrackerNumberFormat, TrackerRow, TrackerSheet, TrackerSummaryKind } from "@/domain";
import { cleanCellFormat, isBlankCell, personNames } from "@/domain";
import { formatCell, type CellAddress, type CellRange } from "@/features/trackers/grid-model";
import { TrackerService, type CellEdit } from "@/services/tracker-service";

/**
 * A view over a sheet: search, per-column value filters and a sort. Views are
 * how someone narrows a tracker down to "everything still in progress on
 * YouTube" without touching the data, and the same projection feeds the
 * summary footer and the status bar counts. Pure functions, unit-tested.
 */

export interface SheetView {
  /** Free text matched against every cell of a row. */
  query: string;
  /** Column id → the displayed values a row must have (any of them). */
  filters: Record<string, string[]>;
  sort: { columnId: string; direction: "asc" | "desc" } | null;
}

export const EMPTY_VIEW: SheetView = { query: "", filters: {}, sort: null };

export function isViewActive(view: SheetView): boolean {
  return view.query.trim() !== "" || Object.keys(view.filters).length > 0 || view.sort !== null;
}

export function isViewFiltering(view: SheetView): boolean {
  return view.query.trim() !== "" || Object.keys(view.filters).length > 0;
}

/** The value a filter or the summary sees: what the cell shows, "(empty)" when blank. */
export const EMPTY_LABEL = "(empty)";

export function displayValue(column: TrackerColumn, value: TrackerCellValue | undefined): string {
  return isBlankCell(value) && value !== false ? EMPTY_LABEL : formatCell(column, value);
}

/** Distinct displayed values in a column across the sheet's data rows, most common first. */
export function distinctValues(sheet: Pick<TrackerSheet, "rows">, column: TrackerColumn): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of sheet.rows) {
    if (row.kind !== "data") continue;
    const label = displayValue(column, row.cells[column.id]);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { sensitivity: "base", numeric: true }));
}

function rowMatches(sheet: Pick<TrackerSheet, "columns">, row: TrackerRow, view: SheetView): boolean {
  if (row.kind !== "data") return true;
  const query = view.query.trim().toLowerCase();
  if (query) {
    const hit = sheet.columns.some((column) => formatCell(column, row.cells[column.id]).toLowerCase().includes(query));
    if (!hit) return false;
  }
  for (const [columnId, wanted] of Object.entries(view.filters)) {
    if (wanted.length === 0) continue;
    const column = sheet.columns.find((c) => c.id === columnId);
    if (!column) continue;
    if (!wanted.includes(displayValue(column, row.cells[columnId]))) return false;
  }
  return true;
}

/** Sort key for a cell: numbers and dates compare naturally, text case-insensitively; blanks sink to the end. */
function sortKey(column: TrackerColumn, value: TrackerCellValue | undefined): number | string | null {
  if (isBlankCell(value) && value !== false) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 0 : 1;
  if (column.type === "person") return personNames(value).toLowerCase();
  if (column.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (column.type === "number") {
    const n = Number(String(value).replace(/[,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return String(value).toLowerCase();
}

function compareKeys(a: number | string | null, b: number | string | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * dir;
}

/**
 * Applies the view. Filtering keeps a band only while it still has a visible
 * data row under it; sorting reorders data rows within each band, so a tracker
 * grouped by phase and channel stays grouped. Each visible row remembers its
 * position in the real sheet so edits go back to the right place.
 */
export function projectSheet(sheet: TrackerSheet, view: SheetView): { rows: TrackerRow[]; sourceIndex: number[]; hiddenDataRows: number } {
  if (!isViewActive(view)) return { rows: sheet.rows, sourceIndex: sheet.rows.map((_, i) => i), hiddenDataRows: 0 };

  // Split into groups: a run of data rows preceded by the bands that introduce them.
  type Group = { bands: number[]; data: number[] };
  const groups: Group[] = [];
  let current: Group = { bands: [], data: [] };
  sheet.rows.forEach((row, index) => {
    if (row.kind === "data") {
      current.data.push(index);
      return;
    }
    if (current.data.length > 0) {
      groups.push(current);
      current = { bands: [], data: [] };
    }
    current.bands.push(index);
  });
  groups.push(current);

  const sortColumn = view.sort ? sheet.columns.find((c) => c.id === view.sort!.columnId) : undefined;
  const dir: 1 | -1 = view.sort?.direction === "desc" ? -1 : 1;
  const filtering = isViewFiltering(view);
  const sourceIndex: number[] = [];
  let hidden = 0;

  for (const group of groups) {
    let data = group.data.filter((i) => rowMatches(sheet, sheet.rows[i]!, view));
    hidden += group.data.length - data.length;
    if (sortColumn) {
      const keyed = data.map((i) => ({ i, key: sortKey(sortColumn, sheet.rows[i]!.cells[sortColumn.id]) }));
      keyed.sort((a, b) => compareKeys(a.key, b.key, dir) || a.i - b.i);
      data = keyed.map((k) => k.i);
    }
    // Bands with nothing under them disappear while filtering (a trailing band with no rows stays when not filtering).
    if (filtering && data.length === 0) continue;
    sourceIndex.push(...group.bands, ...data);
  }
  return { rows: sourceIndex.map((i) => sheet.rows[i]!), sourceIndex, hiddenDataRows: hidden };
}

// ---- summaries -------------------------------------------------------------------

/** The footer aggregate a column shows when none is chosen. */
export function defaultSummary(column: Pick<TrackerColumn, "type">): TrackerSummaryKind {
  switch (column.type) {
    case "number":
      return "sum";
    case "checkbox":
      return "checked";
    default:
      return "count";
  }
}

export function effectiveSummary(column: Pick<TrackerColumn, "type" | "summary">): TrackerSummaryKind {
  return column.summary ?? defaultSummary(column);
}

/** Which summaries make sense for a column type; the rest are hidden from the menu. */
export function summaryKindsFor(column: Pick<TrackerColumn, "type">): TrackerSummaryKind[] {
  if (column.type === "number") return ["none", "count", "empty", "sum", "average", "min", "max"];
  if (column.type === "checkbox") return ["none", "checked", "percentChecked", "empty"];
  return ["none", "count", "empty"];
}

export interface SummaryResult {
  kind: TrackerSummaryKind;
  /** Raw value for tests and export; null when nothing to add up. */
  value: number | null;
  /** What the footer shows, e.g. "Sum 1,240" or "3 of 12 checked". */
  text: string;
}

function numbersIn(column: TrackerColumn, rows: TrackerRow[]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    if (row.kind !== "data") continue;
    const v = row.cells[column.id];
    if (typeof v === "number") out.push(v);
    else if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[,\s]/g, ""));
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

export function summarize(column: TrackerColumn, rows: TrackerRow[]): SummaryResult {
  const kind = effectiveSummary(column);
  const data = rows.filter((r) => r.kind === "data");
  // A checkbox is filled when ticked: "Count empty" on one counts the unticked boxes.
  const filled = data.filter((r) => (column.type === "checkbox" ? r.cells[column.id] === true : !isBlankCell(r.cells[column.id]))).length;
  const format = (n: number) => formatNumber(n, column.numberFormat ?? "plain");
  switch (kind) {
    case "none":
      return { kind, value: null, text: "" };
    case "count":
      return { kind, value: filled, text: `${filled} filled` };
    case "empty": {
      const empty = data.length - filled;
      return { kind, value: empty, text: `${empty} empty` };
    }
    case "checked": {
      const checked = data.filter((r) => r.cells[column.id] === true).length;
      return { kind, value: checked, text: `${checked} of ${data.length} checked` };
    }
    case "percentChecked": {
      const checked = data.filter((r) => r.cells[column.id] === true).length;
      const pct = data.length ? Math.round((checked / data.length) * 100) : 0;
      return { kind, value: pct, text: `${pct}% checked` };
    }
    case "sum": {
      const nums = numbersIn(column, rows);
      const sum = nums.reduce((a, b) => a + b, 0);
      return { kind, value: nums.length ? sum : null, text: nums.length ? `Sum ${format(sum)}` : "Sum —" };
    }
    case "average": {
      const nums = numbersIn(column, rows);
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      return { kind, value: avg, text: avg === null ? "Avg —" : `Avg ${format(Math.round(avg * 100) / 100)}` };
    }
    case "min": {
      const nums = numbersIn(column, rows);
      const min = nums.length ? Math.min(...nums) : null;
      return { kind, value: min, text: min === null ? "Min —" : `Min ${format(min)}` };
    }
    case "max": {
      const nums = numbersIn(column, rows);
      const max = nums.length ? Math.max(...nums) : null;
      return { kind, value: max, text: max === null ? "Max —" : `Max ${format(max)}` };
    }
  }
}

/** Excel-style quick stats for a selection: count of filled cells, and sum/average when numbers are among them. */
export function selectionStats(sheet: Pick<TrackerSheet, "rows" | "columns">, rows: TrackerRow[], left: number, right: number): { count: number; sum: number | null; average: number | null } {
  let count = 0;
  const nums: number[] = [];
  for (const row of rows) {
    if (row.kind !== "data") continue;
    for (let c = left; c <= right; c++) {
      const column = sheet.columns[c];
      if (!column) continue;
      const v = row.cells[column.id];
      if (isBlankCell(v) && v !== false) continue;
      count++;
      if (typeof v === "number") nums.push(v);
      else if (column.type === "number" && typeof v === "string") {
        const n = Number(v.replace(/[,\s]/g, ""));
        if (Number.isFinite(n)) nums.push(n);
      }
    }
  }
  const sum = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  return { count, sum, average: sum === null ? null : Math.round((sum / nums.length) * 100) / 100 };
}

// ---- number formatting ------------------------------------------------------------

export function formatNumber(n: number, format: TrackerNumberFormat): string {
  switch (format) {
    case "integer":
      return Math.round(n).toLocaleString("en-AU");
    case "decimal":
      return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "currency":
      return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "narrowSymbol" });
    case "percent":
      return `${(n * 100).toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
    default:
      return n.toLocaleString("en-AU", { maximumFractionDigits: 10 });
  }
}

/** The Excel number format string matching a display format. */
export function excelNumberFormat(format: TrackerNumberFormat | undefined): string | undefined {
  switch (format) {
    case "integer":
      return "#,##0";
    case "decimal":
      return "#,##0.00";
    case "currency":
      return '"$"#,##0.00';
    case "percent":
      return "0.0%";
    default:
      return undefined;
  }
}

// ---- fill ------------------------------------------------------------------------

/**
 * Excel's Ctrl+D: copy the top row of the selection into every row below it
 * (or the cell above into a single selected cell). Bands are skipped.
 */
export function fillDownEdits(sheet: TrackerSheet, rows: TrackerRow[], range: { top: number; bottom: number; left: number; right: number }): CellEdit[] {
  const edits: CellEdit[] = [];
  let sourceIndex = range.top;
  let firstTarget = range.top + 1;
  if (range.top === range.bottom) {
    // A single row: fill it from the row above.
    if (range.top === 0) return edits;
    sourceIndex = range.top - 1;
    firstTarget = range.top;
  }
  const source = rows[sourceIndex];
  if (!source || source.kind !== "data") return edits;
  for (let r = firstTarget; r <= range.bottom; r++) {
    const target = rows[r];
    if (!target || target.kind !== "data") continue;
    for (let c = range.left; c <= range.right; c++) {
      const column = sheet.columns[c];
      if (!column) continue;
      edits.push({ rowId: target.id, columnId: column.id, value: source.cells[column.id] ?? null });
    }
  }
  return edits;
}

/** Applies fill-down to the real sheet given the rows as displayed. */
export function fillDown(sheet: TrackerSheet, rows: TrackerRow[], range: { top: number; bottom: number; left: number; right: number }): TrackerSheet {
  const edits = fillDownEdits(sheet, rows, range);
  return edits.length ? TrackerService.applyEdits(sheet, edits) : sheet;
}

/**
 * The fill handle: the selection dragged out by its corner to `target` (the
 * selection plus the cells it was dragged over, in one direction). As in Excel
 * and Google Sheets the selection repeats over the new cells, and a run of two
 * or more numbers that rise or fall by the same step continues instead
 * (1, 2, 3 then 4, 5…; dragged up, 0, -1…). Formatting comes along with the
 * values. Bands are skipped, both in what is copied and where it lands.
 */
export function fillRangeEdits(
  sheet: Pick<TrackerSheet, "columns">,
  rows: TrackerRow[],
  source: CellRange,
  target: CellRange,
): { edits: CellEdit[]; formats: Array<{ rowId: EntityId; columnId: EntityId; format: TrackerCellFormat | null }> } {
  const edits: CellEdit[] = [];
  const formats: Array<{ rowId: EntityId; columnId: EntityId; format: TrackerCellFormat | null }> = [];
  const put = (row: TrackerRow, column: TrackerColumn, value: TrackerCellValue | undefined, format: TrackerCellFormat | undefined) => {
    edits.push({ rowId: row.id, columnId: column.id, value: value === undefined || value === null ? null : TrackerService.coerce(column, value) });
    formats.push({ rowId: row.id, columnId: column.id, format: format ?? null });
  };
  // The next value of a run, k cells past its end (k = 0 is the first new cell); backwards when filling up or left.
  const next = (values: Array<TrackerCellValue | undefined>, k: number, backwards: boolean): TrackerCellValue | undefined => {
    const n = values.length;
    const numbers = values.every((v) => typeof v === "number") ? (values as number[]) : null;
    if (numbers && n >= 2) {
      const step = numbers[1]! - numbers[0]!;
      if (numbers.every((v, i) => i === 0 || Math.abs(v - numbers[i - 1]! - step) < 1e-9)) {
        const value = backwards ? numbers[0]! - step * (k + 1) : numbers[n - 1]! + step * (k + 1);
        return Math.round(value * 1e9) / 1e9;
      }
    }
    return backwards ? values[n - 1 - (k % n)] : values[k % n];
  };
  const cycle = <T,>(items: T[], k: number, backwards: boolean): T => (backwards ? items[items.length - 1 - (k % items.length)]! : items[k % items.length]!);

  const vertical = target.top < source.top || target.bottom > source.bottom;
  if (vertical) {
    const sourceRows = rows.slice(source.top, source.bottom + 1).filter((r) => r.kind === "data");
    if (!sourceRows.length) return { edits, formats };
    const down = target.bottom > source.bottom;
    const landing = (down ? rows.slice(source.bottom + 1, target.bottom + 1) : rows.slice(target.top, source.top).reverse()).filter((r) => r.kind === "data");
    for (let c = source.left; c <= source.right; c++) {
      const column = sheet.columns[c];
      if (!column) continue;
      const values = sourceRows.map((r) => r.cells[column.id]);
      const styles = sourceRows.map((r) => r.formats?.[column.id]);
      landing.forEach((row, k) => put(row, column, next(values, k, !down), cycle(styles, k, !down)));
    }
    return { edits, formats };
  }
  const right = target.right > source.right;
  const landingCols = right ? range(source.right + 1, target.right) : range(target.left, source.left - 1).reverse();
  for (let r = source.top; r <= source.bottom; r++) {
    const row = rows[r];
    if (!row || row.kind !== "data") continue;
    const sourceCols = range(source.left, source.right).map((c) => sheet.columns[c]).filter((c): c is TrackerColumn => !!c);
    const values = sourceCols.map((c) => row.cells[c.id]);
    const styles = sourceCols.map((c) => row.formats?.[c.id]);
    landingCols.forEach((c, k) => {
      const column = sheet.columns[c];
      if (column) put(row, column, next(values, k, !right), cycle(styles, k, !right));
    });
  }
  return { edits, formats };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** Applies a fill-handle drag to the real sheet given the rows as displayed. */
export function fillRange(sheet: TrackerSheet, rows: TrackerRow[], source: CellRange, target: CellRange): TrackerSheet {
  const { edits, formats } = fillRangeEdits(sheet, rows, source, target);
  if (!edits.length) return sheet;
  const next = TrackerService.applyEdits(sheet, edits);
  // The formats in one pass: each landing cell takes its source's formatting, or none.
  const byRow = new Map<EntityId, Map<EntityId, TrackerCellFormat | null>>();
  for (const { rowId, columnId, format } of formats) {
    if (!byRow.has(rowId)) byRow.set(rowId, new Map());
    byRow.get(rowId)!.set(columnId, cleanCellFormat(format));
  }
  return {
    ...next,
    rows: next.rows.map((row) => {
      const updates = byRow.get(row.id);
      if (!updates || row.kind !== "data") return row;
      const merged: Record<EntityId, TrackerCellFormat> = { ...(row.formats ?? {}) };
      for (const [columnId, format] of updates) {
        if (format) merged[columnId] = format;
        else delete merged[columnId];
      }
      const out: TrackerRow = { ...row, formats: merged };
      if (Object.keys(merged).length === 0) delete out.formats;
      return out;
    }),
  };
}

// ---- editing through a view --------------------------------------------------------

/**
 * Paste against the rows as displayed. Cells land on the visible rows in order;
 * when the block runs past the last visible row, new rows are appended to the
 * real sheet and filled. A single value fills the whole selection instead.
 */
export function pasteVisible(sheet: TrackerSheet, rows: TrackerRow[], at: CellAddress, block: string[][], selection: CellRange | null): TrackerSheet {
  const single = block.length === 1 && block[0]!.length === 1;
  const width = single ? 1 : Math.max(...block.map((r) => r.length));
  const target: CellRange = single && selection ? selection : { top: at.row, left: at.col, bottom: at.row + block.length - 1, right: at.col + width - 1 };
  let next = sheet;
  let visible = rows;
  const missing = target.bottom - (visible.length - 1);
  if (missing > 0) {
    next = TrackerService.insertRows(next, next.rows.length, missing);
    visible = [...visible, ...next.rows.slice(next.rows.length - missing)];
  }
  const edits: CellEdit[] = [];
  for (let r = target.top; r <= target.bottom; r++) {
    const row = visible[r];
    if (!row || row.kind !== "data") continue;
    for (let c = target.left; c <= target.right && c < next.columns.length; c++) {
      const column = next.columns[c]!;
      const raw = single ? block[0]![0]! : (block[r - target.top]?.[c - target.left] ?? "");
      edits.push({ rowId: row.id, columnId: column.id, value: TrackerService.coerce(column, raw) });
    }
  }
  return TrackerService.applyEdits(next, edits);
}

/** Clears every visible data cell in the range. */
export function clearVisible(sheet: TrackerSheet, rows: TrackerRow[], range: CellRange): TrackerSheet {
  const edits: CellEdit[] = [];
  for (let r = range.top; r <= range.bottom; r++) {
    const row = rows[r];
    if (!row || row.kind !== "data") continue;
    for (let c = range.left; c <= range.right; c++) {
      const column = sheet.columns[c];
      if (column && column.id in row.cells) edits.push({ rowId: row.id, columnId: column.id, value: null });
    }
  }
  return edits.length ? TrackerService.applyEdits(sheet, edits) : sheet;
}

/**
 * Excel's Ctrl+Arrow: from the active cell, jump to the edge of the current
 * run of filled cells, or to the next filled cell across a gap, or to the edge.
 */
export function jumpTarget(sheet: Pick<TrackerSheet, "columns">, rows: TrackerRow[], from: CellAddress, dr: -1 | 0 | 1, dc: -1 | 0 | 1): CellAddress {
  const filledAt = (r: number, c: number) => {
    const row = rows[r];
    const column = sheet.columns[c];
    if (!row || !column) return false;
    if (row.kind !== "data") return true;
    const v = row.cells[column.id];
    return !(isBlankCell(v) && v !== false);
  };
  const inBounds = (r: number, c: number) => r >= 0 && r < rows.length && c >= 0 && c < sheet.columns.length;
  let r = from.row;
  let c = from.col;
  if (!inBounds(r + dr, c + dc)) return from;
  const startFilled = filledAt(r, c);
  const nextFilled = filledAt(r + dr, c + dc);
  if (startFilled && nextFilled) {
    // Inside a run: go to its end.
    while (inBounds(r + dr, c + dc) && filledAt(r + dr, c + dc)) {
      r += dr;
      c += dc;
    }
    return { row: r, col: c };
  }
  // On a blank, or at the end of a run: skip blanks to the next filled cell, else the edge.
  r += dr;
  c += dc;
  while (inBounds(r + dr, c + dc) && !filledAt(r, c)) {
    r += dr;
    c += dc;
  }
  return { row: r, col: c };
}

