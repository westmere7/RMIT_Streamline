import type { EntityId, Item, ItemAsset, Tracker, TrackerAssetMapping, TrackerCellValue, TrackerColumn, TrackerColumnType, TrackerRow, TrackerRowKind, TrackerSheet, TrackerSheetInput } from "@/domain";
import { coercePeople, isMappingUsable, normalizeAssetMapping, personNames } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { ItemAssetService, SheetSyncResult } from "@/services/item-asset-service";
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
/** A save that found somebody else's save in the way: the sheet as it now is, to merge with. */
export interface SheetSaveConflict {
  conflict: TrackerSheet;
}

/** The grid's part of a sheet: what the editor saves. */
export type SheetGridPatch = Partial<Pick<TrackerSheet, "columns" | "rows" | "frozenColumns">>;

/**
 * Trackers are edited as whole sheets: the grid keeps a local copy, applies
 * edits instantly and saves the sheet document. The service exposes the row and
 * column operations so those edits stay consistent (and testable) outside React.
 *
 * A sheet can also hold one task's deliverables (`itemId`, `assetMapping`):
 * every save of such a sheet rewrites the task's asset lines through
 * ItemAssetService.syncFromSheet, and ticking one of those lines off on the task
 * ticks its row here.
 */
export class TrackerService {
  constructor(
    private readonly repos: Repositories,
    private readonly assets?: ItemAssetService,
  ) {
    assets?.onSheetLineDone((line, done, actorId) => this.setLineDone(line, done, actorId));
  }

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

  /** Deletes the tracker. Linked sheets let go of their tasks first, so each task's counts and PIC are put right. */
  async delete(trackerId: EntityId, actorId?: EntityId): Promise<void> {
    if (actorId) for (const sheet of await this.repos.trackers.listSheets(trackerId)) if (sheet.itemId) await this.unlinkSheet(sheet.id, actorId);
    await this.repos.trackers.delete(trackerId);
  }

  /** Copies a tracker: every sheet with its rows. Copies hold no task's assets. */
  async duplicate(trackerId: EntityId, actorId: EntityId): Promise<{ tracker: Tracker; sheets: TrackerSheet[] }> {
    const source = await this.get(trackerId);
    const sheets = await this.repos.trackers.listSheets(trackerId);
    return this.create(
      {
        workspaceId: source.workspaceId,
        teamId: source.teamId,
        name: `${source.name} (copy)`,
        description: source.description,
        layout: "blank",
        sheets: sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows, frozenColumns: s.frozenColumns, assetMapping: s.assetMapping ?? null })),
      },
      actorId,
    );
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

  async addSheet(trackerId: EntityId, name: string, layout: "campaign" | "blank" | "copy" | "duplicate", copyOf?: EntityId): Promise<TrackerSheet> {
    const trimmed = name.trim() || "New sheet";
    if ((layout === "copy" || layout === "duplicate") && copyOf) {
      const source = await this.getSheet(copyOf);
      // A copy keeps the columns (ids included, so pastes between the two line up).
      // "copy" clears the rows and keeps the bands; "duplicate" keeps everything.
      // Neither holds a task's assets: a sheet does that for one task only.
      const rows = source.rows.map((r) => ({ ...r, id: newId(), cells: layout === "duplicate" || r.kind !== "data" ? { ...r.cells } : {} }));
      const created = await this.repos.trackers.createSheet({ trackerId, name: trimmed, columns: source.columns, rows, frozenColumns: source.frozenColumns, assetMapping: source.assetMapping ?? null });
      if (source.position !== undefined) {
        // Straight after the sheet it copies, as Excel puts a copied sheet.
        const order = (await this.repos.trackers.listSheets(trackerId)).map((s) => s.id).filter((id) => id !== created.id);
        order.splice(order.indexOf(source.id) + 1, 0, created.id);
        await this.repos.trackers.reorderSheets(trackerId, order);
      }
      return (await this.repos.trackers.getSheet(created.id)) ?? created;
    }
    const draft = layout === "campaign" ? emptyTemplateSheet(trackerId, trimmed) : blankSheet(trackerId, trimmed);
    return this.repos.trackers.createSheet(draft);
  }

  async renameSheet(sheetId: EntityId, name: string): Promise<TrackerSheet> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Sheet name cannot be empty");
    return this.repos.trackers.updateSheet(sheetId, { name: trimmed });
  }

  async deleteSheet(sheetId: EntityId, actorId?: EntityId): Promise<void> {
    const sheet = await this.getSheet(sheetId);
    const siblings = await this.repos.trackers.listSheets(sheet.trackerId);
    if (siblings.length <= 1) throw new Error("A tracker needs at least one sheet");
    if (sheet.itemId && actorId) await this.unlinkSheet(sheetId, actorId);
    await this.repos.trackers.deleteSheet(sheetId);
  }

  async reorderSheets(trackerId: EntityId, orderedIds: EntityId[]): Promise<TrackerSheet[]> {
    return this.repos.trackers.reorderSheets(trackerId, orderedIds);
  }

  /** Replaces the sheet's grid (columns, rows, frozen columns) with the edited copy. */
  async saveSheet(sheetId: EntityId, patch: Partial<Pick<TrackerSheet, "columns" | "rows" | "frozenColumns" | "name">>, actorId?: EntityId): Promise<TrackerSheet> {
    const saved = await this.repos.trackers.updateSheet(sheetId, patch);
    if (actorId) await this.syncAssets(saved, actorId);
    return saved;
  }

  /**
   * The editor's save: written only if the sheet is still the version the
   * editor started from (`expectedUpdatedAt`). If somebody saved in between,
   * nothing is written and the sheet as it now is comes back, for the editor to
   * merge with and save again. A linked sheet then rewrites its task's lines.
   */
  async saveSheetDraft(sheetId: EntityId, patch: SheetGridPatch, expectedUpdatedAt: string, actorId: EntityId): Promise<{ sheet: TrackerSheet; sync: SheetSyncResult | null; syncError?: string } | SheetSaveConflict> {
    const saved = await this.repos.trackers.updateSheetIfCurrent(sheetId, patch, expectedUpdatedAt);
    if (!saved) return { conflict: await this.getSheet(sheetId) };
    // The sheet is saved whatever happens next; a task that could not be
    // brought into line is reported, and caught up by the next save.
    try {
      return { sheet: saved, sync: await this.syncAssets(saved, actorId) };
    } catch (error) {
      return { sheet: saved, sync: null, syncError: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Moves a sheet one place left or right among its tracker's sheets. */
  async moveSheet(sheetId: EntityId, delta: -1 | 1): Promise<TrackerSheet[]> {
    const sheet = await this.getSheet(sheetId);
    const ids = (await this.repos.trackers.listSheets(sheet.trackerId)).map((s) => s.id);
    const from = ids.indexOf(sheetId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return this.repos.trackers.listSheets(sheet.trackerId);
    ids.splice(from, 1);
    ids.splice(to, 0, sheetId);
    return this.repos.trackers.reorderSheets(sheet.trackerId, ids);
  }

  // ---- A sheet as a task's assets ------------------------------------------

  /** The sheet holding a task's deliverables, if any. */
  sheetForItem(itemId: EntityId): Promise<TrackerSheet | null> {
    return this.repos.trackers.getSheetByItem(itemId);
  }

  /**
   * Makes the sheet the task's deliverables, read through `mapping`. A sheet
   * belongs to one task and a task has one sheet, so linking either to a second
   * is refused, naming the first.
   */
  async linkSheet(sheetId: EntityId, itemId: EntityId, mapping: TrackerAssetMapping, actorId: EntityId): Promise<{ sheet: TrackerSheet; sync: SheetSyncResult | null }> {
    const sheet = await this.getSheet(sheetId);
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    if (sheet.itemId && sheet.itemId !== itemId) {
      const other = await this.repos.items.getById(sheet.itemId);
      throw new Error(`This sheet already holds the assets of “${other?.name ?? "another task"}”. Unlink it there first.`);
    }
    const taken = await this.repos.trackers.getSheetByItem(itemId);
    if (taken && taken.id !== sheetId) throw new Error(`“${item.name}” already takes its assets from the sheet “${taken.name}”.`);
    const clean = normalizeAssetMapping(mapping, sheet.columns);
    if (!isMappingUsable(clean)) throw new Error("Choose the column that names each asset.");
    const saved = await this.repos.trackers.updateSheet(sheetId, { itemId, assetMapping: clean });
    return { sheet: saved, sync: await this.syncAssets(saved, actorId) };
  }

  /** Changes how a linked (or not yet linked) sheet's rows read as assets. */
  async setAssetMapping(sheetId: EntityId, mapping: TrackerAssetMapping, actorId: EntityId): Promise<{ sheet: TrackerSheet; sync: SheetSyncResult | null }> {
    const sheet = await this.getSheet(sheetId);
    const clean = normalizeAssetMapping(mapping, sheet.columns);
    if (sheet.itemId && !isMappingUsable(clean)) throw new Error("Choose the column that names each asset.");
    const saved = await this.repos.trackers.updateSheet(sheetId, { assetMapping: clean });
    return { sheet: saved, sync: await this.syncAssets(saved, actorId) };
  }

  /** Lets the sheet go of its task: the task's lines from it are taken off. The rows stay in the sheet. */
  async unlinkSheet(sheetId: EntityId, actorId: EntityId): Promise<TrackerSheet> {
    const sheet = await this.getSheet(sheetId);
    if (!sheet.itemId) return sheet;
    await this.assets?.syncFromSheet({ ...sheet, itemId: sheet.itemId, assetMapping: null }, actorId);
    return this.repos.trackers.updateSheet(sheetId, { itemId: null });
  }

  /** The task a sheet holds the assets of, or null (unlinked, or deleted since). */
  async linkedItem(sheet: Pick<TrackerSheet, "itemId">): Promise<Item | null> {
    return sheet.itemId ? this.repos.items.getById(sheet.itemId) : null;
  }

  private async syncAssets(sheet: TrackerSheet, actorId: EntityId): Promise<SheetSyncResult | null> {
    if (!this.assets || (!sheet.itemId && !sheet.assetMapping)) return null;
    return this.assets.syncFromSheet(sheet, actorId);
  }

  /**
   * Ticks a sheet's line off (or opens it again) by setting its row's Done cell:
   * the sheet stays the truth, and the save writes the line. Retried over a
   * concurrent save, so somebody typing in the sheet does not lose the tick or
   * their typing.
   */
  private async setLineDone(line: ItemAsset, done: boolean, actorId: EntityId): Promise<void> {
    if (!line.trackerSheetId || !line.trackerRowId) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(line.trackerSheetId);
      const mapping = sheet.assetMapping;
      const column = mapping?.done.columnId ? sheet.columns.find((c) => c.id === mapping.done.columnId) : null;
      if (!mapping || !column) throw new Error("The sheet has no Done column to tick. Choose one in its asset settings.");
      if (column.type === "list" && mapping.done.values.length === 0) throw new Error("No choice in the sheet's Done column means done. Choose one in its asset settings.");
      const value: TrackerCellValue = column.type === "checkbox" ? done : done ? mapping.done.values[0]! : null;
      const edited = TrackerService.applyEdits(sheet, [{ rowId: line.trackerRowId, columnId: column.id, value }]);
      const result = await this.saveSheetDraft(sheet.id, { rows: edited.rows }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return;
    }
    throw new Error("The sheet kept changing. Try again in a moment.");
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
    const before = sheet.columns.find((c) => c.id === columnId);
    // Into or out of People, the cells change form: names become people, and
    // people become their names, so nothing typed is lost either way.
    const convert =
      before && patch.type && patch.type !== before.type && (patch.type === "person" || before.type === "person")
        ? (value: TrackerCellValue): TrackerCellValue => (patch.type === "person" ? coercePeople(typeof value === "string" ? value : String(value ?? "")) : personNames(value) || null)
        : null;
    const rows = convert
      ? sheet.rows.map((row) => {
          if (row.kind !== "data" || !(columnId in row.cells)) return row;
          const cells = { ...row.cells };
          const next = convert(cells[columnId]!);
          if (next === null || next === "") delete cells[columnId];
          else cells[columnId] = next;
          return { ...row, cells };
        })
      : sheet.rows;
    return {
      ...sheet,
      rows,
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
      case "person": {
        // Ids as stored; anything else typed or pasted is a name, looked up by
        // the grid (coercePeople) before it gets here.
        if (typeof raw !== "string") return null;
        return coercePeople(raw);
      }
      default: {
        if (typeof raw === "boolean") return raw ? "Y" : "N";
        const s = typeof raw === "number" ? String(raw) : String(raw);
        return s === "" ? null : s;
      }
    }
  }
}

export const TRACKER_TYPE_ORDER: TrackerColumnType[] = ["text", "longText", "list", "date", "url", "number", "checkbox", "person"];

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}
