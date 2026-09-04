import type { EntityId, Tracker, TrackerCellValue, TrackerColumn, TrackerColumnType, TrackerRow, TrackerRowKind, TrackerSheet, TrackerSheetInput } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { blankSheet, emptyTemplateSheet } from "@/features/trackers/tracker-template";
import { newId } from "@/lib/ids";

export interface CreateTrackerInput {
  workspaceId: EntityId;
  teamId: EntityId | null;
  name: string;
  description?: string | null;
  /** "campaign" starts with the Domestic Campaigns layout; "blank" with plain text columns. */
  layout: "campaign" | "blank";
  /** Sheets to create instead of the layout default (used by import). */
  sheets?: Array<Omit<TrackerSheetInput, "trackerId">>;
}

export interface CellEdit {
  rowId: EntityId;
  columnId: EntityId;
  value: TrackerCellValue;
}

/**
 * Trackers are edited as whole sheets: the grid keeps a local copy, applies
 * edits instantly and saves the sheet document. The service exposes the row and
 * column operations so those edits stay consistent (and testable) outside React.
 */
export class TrackerService {
  constructor(private readonly repos: Repositories) {}

  // ---- Trackers ------------------------------------------------------------

  async list(workspaceId: EntityId): Promise<Tracker[]> {
    return this.repos.trackers.listByWorkspace(workspaceId);
  }

  async get(trackerId: EntityId): Promise<Tracker> {
    const tracker = await this.repos.trackers.getById(trackerId);
    if (!tracker) throw new NotFoundError("Tracker", trackerId);
    return tracker;
  }

  async create(input: CreateTrackerInput, actorId: EntityId): Promise<{ tracker: Tracker; sheets: TrackerSheet[] }> {
    const name = input.name.trim();
    if (!name) throw new Error("Tracker name cannot be empty");
    const tracker = await this.repos.trackers.create({
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      name,
      description: input.description?.trim() || null,
      createdBy: actorId,
    });
    const drafts: Array<Omit<TrackerSheetInput, "trackerId">> = input.sheets?.length ? input.sheets : [input.layout === "campaign" ? emptyTemplateSheet(tracker.id, "Sheet 1") : blankSheet(tracker.id, "Sheet 1")];
    const sheets: TrackerSheet[] = [];
    for (const [position, draft] of drafts.entries()) sheets.push(await this.repos.trackers.createSheet({ ...draft, trackerId: tracker.id, position }));
    return { tracker, sheets };
  }

  async update(trackerId: EntityId, patch: Partial<Pick<Tracker, "name" | "description" | "teamId">>): Promise<Tracker> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Tracker name cannot be empty");
    return this.repos.trackers.update(trackerId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
  }

  async delete(trackerId: EntityId): Promise<void> {
    await this.repos.trackers.delete(trackerId);
  }

  // ---- Sheets --------------------------------------------------------------

  async listSheets(trackerId: EntityId): Promise<TrackerSheet[]> {
    return this.repos.trackers.listSheets(trackerId);
  }

  async getSheet(sheetId: EntityId): Promise<TrackerSheet> {
    const sheet = await this.repos.trackers.getSheet(sheetId);
    if (!sheet) throw new NotFoundError("TrackerSheet", sheetId);
    return sheet;
  }

  async addSheet(trackerId: EntityId, name: string, layout: "campaign" | "blank" | "copy", copyOf?: EntityId): Promise<TrackerSheet> {
    const trimmed = name.trim() || "New sheet";
    if (layout === "copy" && copyOf) {
      const source = await this.getSheet(copyOf);
      // A copy keeps the columns (ids included, so pastes between the two line up) and clears the rows.
      return this.repos.trackers.createSheet({ trackerId, name: trimmed, columns: source.columns, rows: source.rows.map((r) => ({ ...r, id: newId(), cells: r.kind === "data" ? {} : r.cells })), frozenColumns: source.frozenColumns });
    }
    const draft = layout === "campaign" ? emptyTemplateSheet(trackerId, trimmed) : blankSheet(trackerId, trimmed);
    return this.repos.trackers.createSheet(draft);
  }

  async renameSheet(sheetId: EntityId, name: string): Promise<TrackerSheet> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Sheet name cannot be empty");
    return this.repos.trackers.updateSheet(sheetId, { name: trimmed });
  }

  async deleteSheet(sheetId: EntityId): Promise<void> {
    const sheet = await this.getSheet(sheetId);
    const siblings = await this.repos.trackers.listSheets(sheet.trackerId);
    if (siblings.length <= 1) throw new Error("A tracker needs at least one sheet");
    await this.repos.trackers.deleteSheet(sheetId);
  }

  async reorderSheets(trackerId: EntityId, orderedIds: EntityId[]): Promise<TrackerSheet[]> {
    return this.repos.trackers.reorderSheets(trackerId, orderedIds);
  }

  /** Replaces the sheet's grid (columns, rows, frozen columns) with the edited copy. */
  async saveSheet(sheetId: EntityId, patch: Partial<Pick<TrackerSheet, "columns" | "rows" | "frozenColumns" | "name">>): Promise<TrackerSheet> {
    return this.repos.trackers.updateSheet(sheetId, patch);
  }

  // ---- Pure grid operations (used by the editor and by tests) --------------

  static applyEdits(sheet: TrackerSheet, edits: CellEdit[]): TrackerSheet {
    const byRow = new Map<EntityId, CellEdit[]>();
    for (const edit of edits) {
      const list = byRow.get(edit.rowId) ?? [];
      list.push(edit);
      byRow.set(edit.rowId, list);
    }
    return {
      ...sheet,
      rows: sheet.rows.map((row) => {
        const rowEdits = byRow.get(row.id);
        if (!rowEdits) return row;
        const cells = { ...row.cells };
        for (const edit of rowEdits) {
          if (edit.value === null || edit.value === "") delete cells[edit.columnId];
          else cells[edit.columnId] = edit.value;
        }
        return { ...row, cells };
      }),
    };
  }

  static insertRows(sheet: TrackerSheet, index: number, count = 1, kind: TrackerRowKind = "data"): TrackerSheet {
    const fresh: TrackerRow[] = Array.from({ length: count }, () => ({ id: newId(), kind, cells: {}, ...(kind !== "data" ? { label: "" } : {}) }));
    const rows = [...sheet.rows];
    rows.splice(Math.max(0, Math.min(index, rows.length)), 0, ...fresh);
    return { ...sheet, rows };
  }

  static deleteRows(sheet: TrackerSheet, rowIds: EntityId[]): TrackerSheet {
    const ids = new Set(rowIds);
    const rows = sheet.rows.filter((r) => !ids.has(r.id));
    // Never leave a sheet with nothing to type into.
    return { ...sheet, rows: rows.length ? rows : [{ id: newId(), kind: "data", cells: {} }] };
  }

  static duplicateRows(sheet: TrackerSheet, rowIds: EntityId[]): TrackerSheet {
    const ids = new Set(rowIds);
    const rows: TrackerRow[] = [];
    for (const row of sheet.rows) {
      rows.push(row);
      if (ids.has(row.id)) rows.push({ ...row, id: newId(), cells: { ...row.cells } });
    }
    return { ...sheet, rows };
  }

  static setRowKind(sheet: TrackerSheet, rowIds: EntityId[], kind: TrackerRowKind): TrackerSheet {
    const ids = new Set(rowIds);
    return {
      ...sheet,
      rows: sheet.rows.map((row) => {
        if (!ids.has(row.id)) return row;
        if (kind === "data") return { id: row.id, kind, cells: row.cells };
        // Promote the first filled cell to the band label so nothing typed is lost.
        const firstValue = Object.values(row.cells).find((v) => typeof v === "string" && v.trim()) as string | undefined;
        return { id: row.id, kind, label: row.label ?? firstValue ?? "", cells: {} };
      }),
    };
  }

  static setRowLabel(sheet: TrackerSheet, rowId: EntityId, label: string): TrackerSheet {
    return { ...sheet, rows: sheet.rows.map((r) => (r.id === rowId ? { ...r, label } : r)) };
  }

  static moveRows(sheet: TrackerSheet, rowIds: EntityId[], toIndex: number): TrackerSheet {
    const ids = new Set(rowIds);
    const moving = sheet.rows.filter((r) => ids.has(r.id));
    const rest = sheet.rows.filter((r) => !ids.has(r.id));
    rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, ...moving);
    return { ...sheet, rows: rest };
  }

  static insertColumn(sheet: TrackerSheet, index: number, column: Partial<TrackerColumn> = {}): TrackerSheet {
    const fresh: TrackerColumn = { id: newId(), name: column.name ?? `Column ${sheet.columns.length + 1}`, type: column.type ?? "text", width: column.width ?? 160, ...(column.options ? { options: column.options } : {}), ...(column.optionColors ? { optionColors: column.optionColors } : {}) };
    const columns = [...sheet.columns];
    columns.splice(Math.max(0, Math.min(index, columns.length)), 0, fresh);
    return { ...sheet, columns };
  }

  static updateColumn(sheet: TrackerSheet, columnId: EntityId, patch: Partial<Omit<TrackerColumn, "id">>): TrackerSheet {
    return {
      ...sheet,
      columns: sheet.columns.map((c) => {
        if (c.id !== columnId) return c;
        const next: TrackerColumn = { ...c, ...patch };
        if (next.type !== "list") {
          delete next.options;
          delete next.optionColors;
        }
        return next;
      }),
    };
  }

  static deleteColumn(sheet: TrackerSheet, columnId: EntityId): TrackerSheet {
    const columns = sheet.columns.filter((c) => c.id !== columnId);
    if (columns.length === 0) return sheet;
    return {
      ...sheet,
      columns,
      frozenColumns: Math.min(sheet.frozenColumns, columns.length),
      rows: sheet.rows.map((r) => {
        if (!(columnId in r.cells)) return r;
        const cells = { ...r.cells };
        delete cells[columnId];
        return { ...r, cells };
      }),
    };
  }

  static moveColumn(sheet: TrackerSheet, columnId: EntityId, toIndex: number): TrackerSheet {
    const from = sheet.columns.findIndex((c) => c.id === columnId);
    if (from === -1) return sheet;
    const columns = [...sheet.columns];
    const [col] = columns.splice(from, 1);
    columns.splice(Math.max(0, Math.min(toIndex, columns.length)), 0, col!);
    return { ...sheet, columns };
  }

  /** Coerces free text (typing, pasting, importing) into the column's value type. */
  static coerce(column: Pick<TrackerColumn, "type">, raw: TrackerCellValue): TrackerCellValue {
    if (raw === null || raw === undefined) return null;
    switch (column.type) {
      case "number": {
        if (typeof raw === "number") return raw;
        const n = Number(String(raw).replace(/[,\s]/g, ""));
        return String(raw).trim() === "" ? null : Number.isFinite(n) ? n : String(raw);
      }
      case "checkbox": {
        if (typeof raw === "boolean") return raw;
        const s = String(raw).trim().toLowerCase();
        return ["y", "yes", "true", "1", "✓", "x"].includes(s);
      }
      case "date": {
        if (typeof raw === "string") {
          const s = raw.trim();
          if (!s) return null;
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
          if (dmy) {
            const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
            return `${year}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
          }
          const parsed = new Date(s);
          return Number.isNaN(parsed.getTime()) ? s : toIsoDate(parsed);
        }
        if (typeof raw === "number") return toIsoDate(excelSerialToDate(raw));
        return String(raw);
      }
      default: {
        if (typeof raw === "boolean") return raw ? "Y" : "N";
        const s = typeof raw === "number" ? String(raw) : String(raw);
        return s === "" ? null : s;
      }
    }
  }
}

export const TRACKER_TYPE_ORDER: TrackerColumnType[] = ["text", "longText", "list", "date", "url", "number", "checkbox"];

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}
