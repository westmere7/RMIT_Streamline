import type { TrackerCellValue, TrackerColumn, TrackerRow, TrackerSheet, TrackerSheetInput } from "@/domain";
import { columnLetter } from "@/domain";
import { STATUS_COLORS, TEMPLATE_STYLE, YES_NO_COLORS } from "@/features/trackers/tracker-template";
import { newId } from "@/lib/ids";
import { TrackerService } from "./tracker-service";

/**
 * .xlsx in and out. Export reproduces the workbook conventions the team knows
 * (navy header, phase/channel bands, dropdown validation, status colours, frozen
 * columns); import reads any workbook back into sheets, recognising those same
 * conventions so a round trip is lossless for everything the grid models.
 *
 * exceljs is loaded lazily: it is ~1 MB and only needed when someone clicks
 * Import or Export.
 */

type ExcelJS = typeof import("exceljs");

async function loadExcel(): Promise<ExcelJS> {
  const mod = await import("exceljs");
  return (mod as unknown as { default?: ExcelJS }).default ?? mod;
}

const FONT = "Arial";

// ---- Export --------------------------------------------------------------------

export async function sheetsToWorkbook(name: string, sheets: TrackerSheet[]): Promise<Uint8Array<ArrayBuffer>> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  workbook.creator = "RMIT Streamline";
  workbook.title = name;
  for (const sheet of sheets) writeSheet(workbook, sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  const view = buffer as unknown as Uint8Array;
  const copy = new Uint8Array(new ArrayBuffer(view.byteLength));
  copy.set(view);
  return copy;
}

function writeSheet(workbook: import("exceljs").Workbook, sheet: TrackerSheet): void {
  const ws = workbook.addWorksheet(excelSafeName(sheet.name), { views: [{ state: "frozen", xSplit: Math.min(sheet.frozenColumns, sheet.columns.length), ySplit: 1 }] });
  const lastCol = Math.max(1, sheet.columns.length);

  ws.columns = sheet.columns.map((c) => ({ key: c.id, width: Math.max(8, Math.round(c.width / 7)) }));

  const header = ws.getRow(1);
  sheet.columns.forEach((column, i) => {
    const cell = header.getCell(i + 1);
    cell.value = column.name;
    cell.font = { name: FONT, bold: true, color: { argb: `FF${TEMPLATE_STYLE.headerText}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${TEMPLATE_STYLE.headerFill}` } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  header.height = 22;

  sheet.rows.forEach((row, index) => {
    const r = ws.getRow(index + 2);
    if (row.kind !== "data") {
      const cell = r.getCell(1);
      cell.value = row.label ?? "";
      const section = row.kind === "section";
      cell.font = { name: FONT, bold: true, color: { argb: `FF${section ? TEMPLATE_STYLE.sectionText : TEMPLATE_STYLE.subsectionText}` } };
      for (let c = 1; c <= lastCol; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${section ? TEMPLATE_STYLE.sectionFill : TEMPLATE_STYLE.subsectionFill}` } };
      if (lastCol > 1) ws.mergeCells(index + 2, 1, index + 2, lastCol);
      return;
    }
    sheet.columns.forEach((column, i) => {
      const cell = r.getCell(i + 1);
      cell.font = { name: FONT };
      cell.alignment = { vertical: "top", wrapText: column.type === "longText" };
      const value = row.cells[column.id];
      if (value === undefined || value === null || value === "") return;
      switch (column.type) {
        case "date": {
          const d = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : null;
          if (d && !Number.isNaN(d.getTime())) {
            cell.value = d;
            cell.numFmt = "dd/mm/yyyy";
          } else cell.value = String(value);
          break;
        }
        case "url":
          cell.value = typeof value === "string" && /^https?:\/\//i.test(value) ? { text: value, hyperlink: value } : String(value);
          cell.font = { name: FONT, color: { argb: "FF0563C1" }, underline: true };
          break;
        case "checkbox":
          cell.value = value === true ? "Y" : "N";
          break;
        case "number":
          cell.value = typeof value === "number" ? value : Number(String(value));
          break;
        default:
          cell.value = typeof value === "boolean" ? (value ? "Y" : "N") : value;
      }
    });
  });

  // Dropdowns and their colours, the way the workbook does it.
  const lastRow = Math.max(2, sheet.rows.length + 1);
  sheet.columns.forEach((column, i) => {
    if (column.type !== "list" || !column.options?.length) return;
    const letter = columnLetter(i);
    const ref = `${letter}2:${letter}${lastRow}`;
    const list = column.options.join(",");
    // Excel caps inline lists at 255 characters; longer lists silently break, so skip them.
    if (list.length <= 255) {
      for (let r = 2; r <= lastRow; r++) ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${list}"`] };
    }
    for (const [option, color] of Object.entries(column.optionColors ?? {})) {
      ws.addConditionalFormatting({
        ref,
        rules: [{ type: "cellIs", operator: "equal", formulae: [`"${option.replace(/"/g, '""')}"`], priority: 1, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: `FF${color}` } } } }],
      });
    }
  });
}

function excelSafeName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
  return cleaned.slice(0, 31);
}

// ---- Import --------------------------------------------------------------------

export interface ImportedWorkbook {
  sheets: Array<Omit<TrackerSheetInput, "trackerId">>;
  /** Sheets that were skipped because they held no table. */
  skipped: string[];
}

export async function workbookToSheets(data: ArrayBuffer | Uint8Array): Promise<ImportedWorkbook> {
  const Excel = await loadExcel();
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(data as never);
  const sheets: ImportedWorkbook["sheets"] = [];
  const skipped: string[] = [];
  workbook.eachSheet((ws) => {
    if (ws.state === "hidden" || ws.state === "veryHidden") return;
    const parsed = readSheet(ws);
    if (parsed) sheets.push(parsed);
    else skipped.push(ws.name);
  });
  return { sheets, skipped };
}

function readSheet(ws: import("exceljs").Worksheet): Omit<TrackerSheetInput, "trackerId"> | null {
  const rowCount = ws.actualRowCount || ws.rowCount;
  if (!rowCount) return null;

  // Header = first row with at least three text cells.
  let headerRowNumber = 0;
  for (let r = 1; r <= Math.min(rowCount, 30); r++) {
    const texts = collectRow(ws, r).filter((v) => typeof v === "string" && v.trim()).length;
    if (texts >= 3) {
      headerRowNumber = r;
      break;
    }
  }
  if (!headerRowNumber) return null;

  const headerValues = collectRow(ws, headerRowNumber);
  const lastColumn = Math.max(1, headerValues.reduce<number>((max, v, i) => (v !== null && v !== "" ? i + 1 : max), 0));
  const validations = listValidationsByColumn(ws);
  const columns: TrackerColumn[] = [];
  for (let c = 1; c <= lastColumn; c++) {
    const raw = headerValues[c - 1];
    const name = raw === null || raw === "" ? `Column ${columnLetter(c - 1)}` : String(raw).trim();
    const widthChars = ws.getColumn(c).width ?? 13;
    const options = validations.get(c);
    const column: TrackerColumn = { id: newId(), name, type: options ? "list" : "text", width: Math.round(Math.max(8, widthChars) * 7) };
    if (options) {
      column.options = options;
      const colors = knownOptionColors(options);
      if (colors) column.optionColors = colors;
    }
    columns.push(column);
  }

  const merges = fullWidthMerges(ws, lastColumn);
  const rows: TrackerRow[] = [];
  const dateHits = new Map<number, number>();
  const urlHits = new Map<number, number>();
  const filled = new Map<number, number>();
  for (let r = headerRowNumber + 1; r <= rowCount; r++) {
    const excelRow = ws.getRow(r);
    const values = collectRow(ws, r, lastColumn, true);
    // A row merged across the table is a phase/channel band; exceljs repeats the
    // merged value in every cell, so this must be decided before counting cells.
    if (merges.has(r)) {
      const label = values.find((v) => v !== null && v !== "");
      const fill = fillArgb(excelRow.getCell(1));
      const kind = fill && fill.slice(2).toUpperCase() === TEMPLATE_STYLE.subsectionFill ? "subsection" : "section";
      rows.push({ id: newId(), kind, label: label === undefined ? "" : String(label), cells: {} });
      continue;
    }
    const nonEmpty = values.map((v, i) => (v === null || v === "" ? -1 : i)).filter((i) => i >= 0);
    if (nonEmpty.length === 0) {
      rows.push({ id: newId(), kind: "data", cells: {} });
      continue;
    }
    const first = excelRow.getCell(1);
    const fill = fillArgb(first);
    const bandLike = nonEmpty.length === 1 && nonEmpty[0] === 0 && fill && fill !== "FFFFFFFF" && first.font?.bold;
    if (bandLike) {
      const kind = fill && fill.slice(2).toUpperCase() === TEMPLATE_STYLE.subsectionFill ? "subsection" : "section";
      rows.push({ id: newId(), kind, label: String(values[0]), cells: {} });
      continue;
    }
    const cells: TrackerRow["cells"] = {};
    values.forEach((value, i) => {
      if (value === null || value === "") return;
      const column = columns[i]!;
      cells[column.id] = value;
      filled.set(i, (filled.get(i) ?? 0) + 1);
      const cell = excelRow.getCell(i + 1);
      if (cell.type === 4 || cell.value instanceof Date) dateHits.set(i, (dateHits.get(i) ?? 0) + 1);
      if (typeof value === "string" && /^https?:\/\//i.test(value)) urlHits.set(i, (urlHits.get(i) ?? 0) + 1);
    });
    rows.push({ id: newId(), kind: "data", cells });
  }

  // Infer types from what the column actually holds.
  columns.forEach((column, i) => {
    if (column.type === "list") return;
    const total = filled.get(i) ?? 0;
    if (total && (dateHits.get(i) ?? 0) >= total * 0.6) column.type = "date";
    else if (total && (urlHits.get(i) ?? 0) >= total * 0.6) column.type = "url";
    else if (column.width >= 200) column.type = "longText";
  });
  // Now the types are known, coerce every stored value.
  for (const row of rows) {
    for (const [columnId, value] of Object.entries(row.cells)) {
      const column = columns.find((c) => c.id === columnId)!;
      const coerced = TrackerService.coerce(column, value);
      if (coerced === null) delete row.cells[columnId];
      else row.cells[columnId] = coerced;
    }
  }

  // Trim trailing blank rows but keep a few for typing.
  let end = rows.length;
  while (end > 0 && rows[end - 1]!.kind === "data" && Object.keys(rows[end - 1]!.cells).length === 0) end--;
  const trimmed = rows.slice(0, end);
  while (trimmed.length < end + 3) trimmed.push({ id: newId(), kind: "data", cells: {} });

  const frozen = ws.views?.find((v) => v.state === "frozen") as { xSplit?: number } | undefined;
  return { name: ws.name, columns, rows: trimmed, frozenColumns: Math.min(frozen?.xSplit ?? 1, columns.length) };
}

function collectRow(ws: import("exceljs").Worksheet, r: number, upTo?: number, raw = false): TrackerCellValue[] {
  const row = ws.getRow(r);
  const count = upTo ?? Math.max(row.cellCount, row.actualCellCount);
  const values: TrackerCellValue[] = [];
  for (let c = 1; c <= count; c++) values.push(cellValue(row.getCell(c), raw));
  return values;
}

function cellValue(cell: import("exceljs").Cell, raw: boolean): TrackerCellValue {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text: string }>; text?: string | { richText: Array<{ text: string }> }; hyperlink?: string; result?: unknown; formula?: string; error?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.hyperlink) return typeof o.text === "string" ? (raw && /^https?:\/\//i.test(o.hyperlink) ? o.hyperlink : o.text) : o.hyperlink;
    if (o.formula !== undefined || o.result !== undefined) return o.result === undefined || o.result === null ? null : (o.result as TrackerCellValue);
    if (typeof o.text === "string") return o.text;
    if (o.error) return null;
    return String(v);
  }
  if (typeof v === "boolean" || typeof v === "number") return v;
  return String(v);
}

function fillArgb(cell: import("exceljs").Cell): string | null {
  const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
  return fill?.type === "pattern" ? (fill.fgColor?.argb ?? null) : null;
}

/** Rows merged across most of the table are section bands. */
function fullWidthMerges(ws: import("exceljs").Worksheet, lastColumn: number): Set<number> {
  const rows = new Set<number>();
  const model = (ws as unknown as { model?: { merges?: string[] } }).model;
  for (const range of model?.merges ?? []) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const [, c1, r1, c2, r2] = m;
    if (r1 !== r2 || c1 !== "A") continue;
    if (letterIndex(c2!) + 1 >= Math.max(3, Math.ceil(lastColumn / 2))) rows.add(Number(r1));
  }
  return rows;
}

function letterIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Column number → dropdown options, from the sheet's list validations. */
function listValidationsByColumn(ws: import("exceljs").Worksheet): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const validations = (ws as unknown as { dataValidations?: { model?: Record<string, { type?: string; formulae?: string[] }> } }).dataValidations;
  const model = validations?.model ?? {};
  for (const [ref, dv] of Object.entries(model)) {
    if (dv.type !== "list" || !dv.formulae?.[0]) continue;
    const formula = dv.formulae[0].trim();
    if (!formula.startsWith('"')) continue; // range references point at another sheet; nothing to import
    const options = formula.replace(/^"|"$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (options.length === 0) continue;
    for (const part of ref.split(/\s+/)) {
      const m = part.match(/^([A-Z]+)/);
      if (!m) continue;
      const col = letterIndex(m[1]!) + 1;
      const existing = result.get(col);
      if (!existing || options.length > existing.length) result.set(col, options);
    }
  }
  return result;
}

/** Re-attach the template's colours when an imported dropdown is the status or Y/N list. */
function knownOptionColors(options: string[]): Record<string, string> | undefined {
  const upper = options.map((o) => o.toUpperCase());
  if (upper.some((o) => o in STATUS_COLORS)) {
    const colors: Record<string, string> = {};
    for (const o of options) {
      const color = STATUS_COLORS[o.toUpperCase()];
      if (color) colors[o] = color;
    }
    return colors;
  }
  if (upper.every((o) => o in YES_NO_COLORS)) return Object.fromEntries(options.map((o) => [o, YES_NO_COLORS[o.toUpperCase()]!]));
  return undefined;
}
