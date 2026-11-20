import type { EntityId, Item, ItemAsset, ItemAssetPatch, Tracker, TrackerAssetMapping, TrackerCellValue, TrackerColumn, TrackerColumnType, TrackerRow, TrackerRowKind, TrackerSheet, TrackerSheetInput } from "@/domain";
import { NEW_ASSET_COLUMN, coercePeople, freeColumnName, isMappingUsable, normalizeAssetMapping, personNames, sheetLineCells, type AssetRole } from "@/domain";
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
    assets?.onSheetLineEdit((line, patch, actorId, people) => this.editLine(line, patch, actorId, people));
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

  /**
   * Deletes the tracker. A sheet holding a task's assets lets go of the task
   * first: with `keepAssets` its lines stay on the task as ordinary assets of
   * its own; without, they go, and the task's counts and PIC are put right.
   */
  async delete(trackerId: EntityId, actorId?: EntityId, options: { keepAssets?: boolean } = {}): Promise<void> {
    if (actorId) for (const sheet of await this.repos.trackers.listSheets(trackerId)) if (sheet.itemId) await this.releaseSheet(sheet.id, actorId, options.keepAssets === true);
    await this.repos.trackers.delete(trackerId);
  }

  /**
   * A linked sheet lets go of its task. Kept, its lines are detached and become
   * the task's own (the sheet is matched by id, so nothing about its name
   * matters here); otherwise they are taken off, as unlinking does.
   */
  private async releaseSheet(sheetId: EntityId, actorId: EntityId, keepAssets: boolean): Promise<void> {
    if (!keepAssets) {
      await this.unlinkSheet(sheetId, actorId);
      return;
    }
    await this.repos.itemAssets.detachFromSheet(sheetId);
    await this.repos.trackers.updateSheet(sheetId, { itemId: null });
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
    if ((layout === "copy" || layout === "duplicate") && !copyOf) throw new Error("Choose the sheet to copy.");
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

  async deleteSheet(sheetId: EntityId, actorId?: EntityId, options: { keepAssets?: boolean } = {}): Promise<void> {
    const sheet = await this.getSheet(sheetId);
    const siblings = await this.repos.trackers.listSheets(sheet.trackerId);
    if (siblings.length <= 1) throw new Error("A tracker needs at least one sheet");
    if (sheet.itemId && actorId) await this.releaseSheet(sheetId, actorId, options.keepAssets === true);
    await this.repos.trackers.deleteSheet(sheetId);
  }

  async reorderSheets(trackerId: EntityId, orderedIds: EntityId[]): Promise<TrackerSheet[]> {
    return this.repos.trackers.reorderSheets(trackerId, orderedIds);
  }

  /** Replaces the sheet's grid (columns, rows, frozen columns) with the edited copy. */
  async saveSheet(sheetId: EntityId, patch: Partial<Pick<TrackerSheet, "columns" | "rows" | "frozenColumns" | "name">>, actorId?: EntityId): Promise<TrackerSheet> {
    if (patch.frozenColumns !== undefined) {
      // Never more frozen columns than there are columns, never fewer than none.
      const count = (patch.columns ?? (await this.getSheet(sheetId)).columns).length;
      patch = { ...patch, frozenColumns: Math.max(0, Math.min(Math.round(patch.frozenColumns) || 0, count)) };
    }
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

  /**
   * Adds a column for a part the sheet has no column for (a Type dropdown of
   * the workspace's asset types, a Quantity number, a PIC People column…), at
   * the end, and hands it back for the mapping to use. Saved like any edit, so
   * an editor open on the sheet merges it in.
   */
  async addAssetColumn(sheetId: EntityId, role: Exclude<AssetRole, "spec">, actorId: EntityId, options: string[] = []): Promise<{ sheet: TrackerSheet; column: TrackerColumn }> {
    const shape = NEW_ASSET_COLUMN[role];
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      const column: TrackerColumn = { id: newId(), name: freeColumnName(sheet.columns, shape.name), type: shape.type, width: 160, ...(shape.type === "list" ? { options } : {}) };
      const result = await this.saveSheetDraft(sheetId, { columns: [...sheet.columns, column] }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return { sheet: result.sheet, column };
    }
    throw new Error("The sheet kept changing. Try again in a moment.");
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
   * Changes a sheet's line made on the task (ticked off, renamed, a new PIC or
   * due date) by setting the cells of its row: the sheet stays the truth, and
   * the save writes the line. Retried over a concurrent save, so somebody
   * typing in the sheet does not lose the change or their typing.
   */
  private async editLine(line: ItemAsset, patch: ItemAssetPatch, actorId: EntityId, people: Array<{ id: EntityId; name: string; email: string | null }>): Promise<void> {
    if (!line.trackerSheetId || !line.trackerRowId) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(line.trackerSheetId);
      if (!sheet.assetMapping) throw new Error("The sheet no longer holds this task's assets.");
      const { cells, refused } = sheetLineCells(sheet, sheet.assetMapping, patch, people);
      if (refused) throw new Error(refused);
      if (cells.length === 0) return;
      const edited = TrackerService.applyEdits(sheet, cells.map((cell) => ({ rowId: line.trackerRowId!, ...cell })));
      const result = await this.saveSheetDraft(sheet.id, { rows: edited.rows }, sheet.updatedAt, actorId);
      if ("conflict" in result) continue;
      // The row took the change but the task did not: say so, rather than let the line snap back unexplained.
      if (result.syncError) throw new Error(`The sheet took the change, but the task's assets could not be updated: ${result.syncError}`);
      return;
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
    // Cells belong to data rows and to columns the sheet has: an edit aimed at a
    // band or at a column since deleted is dropped rather than stored unseen.
    const columnIds = new Set(sheet.columns.map((c) => c.id));
    return {
      ...sheet,
      rows: sheet.rows.map((row) => {
        const rowEdits = byRow.get(row.id)?.filter((edit) => columnIds.has(edit.columnId));
        if (!rowEdits?.length || row.kind !== "data") return row;
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
        // Promote the leftmost filled cell to the band label so nothing typed is lost.
        const firstValue = sheet.columns.map((c) => row.cells[c.id]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
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
    const type = column.type ?? "text";
    const fresh: TrackerColumn = {
      id: newId(),
      name: column.name ?? nextColumnName(sheet.columns),
      type,
      width: clampWidth(column.width ?? 160),
      ...(type === "list" && column.options ? { options: column.options } : {}),
      ...(type === "list" && column.optionColors ? { optionColors: column.optionColors } : {}),
      ...(type === "number" && column.numberFormat ? { numberFormat: column.numberFormat } : {}),
      ...(column.summary && SUMMARIES_BY_TYPE(type).includes(column.summary) ? { summary: column.summary } : {}),
    };
    const columns = [...sheet.columns];
    columns.splice(Math.max(0, Math.min(index, columns.length)), 0, fresh);
    return { ...sheet, columns };
  }

  static updateColumn(sheet: TrackerSheet, columnId: EntityId, patch: Partial<Omit<TrackerColumn, "id">>): TrackerSheet {
    const before = sheet.columns.find((c) => c.id === columnId);
    // Into or out of People, the cells change form: names become people, and
    // people become their names, so nothing typed is lost either way.
    // Any other change of type reads each value as the new type where it can
    // (TrackerService.retype), so a Number column holds numbers and its format
    // shows; a value it cannot read stays as it was rather than being lost.
    const convert =
      before && patch.type && patch.type !== before.type
        ? patch.type === "person" || before.type === "person"
          ? (value: TrackerCellValue): TrackerCellValue => (patch.type === "person" ? coercePeople(typeof value === "string" ? value : String(value ?? "")) : personNames(value) || null)
          : (value: TrackerCellValue): TrackerCellValue => TrackerService.retype(patch.type!, value)
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
        if (patch.width !== undefined) next.width = clampWidth(patch.width);
        // A colour for an option that is no longer offered goes with it.
        if (next.type === "list" && next.optionColors) {
          const offered = new Set(next.options ?? []);
          next.optionColors = Object.fromEntries(Object.entries(next.optionColors).filter(([option]) => offered.has(option)));
        }
        // A format or a footer the new type has no use for goes with the old type.
        if (next.type !== "number") delete next.numberFormat;
        if (next.summary && !SUMMARIES_BY_TYPE(next.type).includes(next.summary)) delete next.summary;
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
      // The asset mapping no longer names the column (what it reads is unchanged: a deleted column gave nothing).
      ...(sheet.assetMapping ? { assetMapping: normalizeAssetMapping(sheet.assetMapping, columns) } : {}),
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

  /**
   * A value carried into a column of another type. Unlike `coerce` (for what
   * is typed) nothing is guessed: text that reads as the new type becomes it,
   * anything else is kept as it stands, and a number never turns into a date.
   */
  static retype(type: TrackerColumnType, value: TrackerCellValue): TrackerCellValue {
    if (value === null || value === undefined) return value ?? null;
    switch (type) {
      case "number":
        return typeof value === "string" ? TrackerService.coerce({ type }, value) : value;
      case "date":
        return typeof value === "string" ? TrackerService.coerce({ type }, value) : value;
      case "checkbox": {
        if (typeof value === "boolean") return value;
        const s = String(value).trim().toLowerCase();
        if (CHECKED_WORDS.includes(s)) return true;
        if (["n", "no", "false", "0", ""].includes(s)) return false;
        return value;
      }
      case "text":
      case "longText":
      case "url":
      case "list":
        return typeof value === "number" ? String(value) : typeof value === "boolean" ? (value ? "Y" : "N") : value;
      default:
        return value;
    }
  }

  /** Coerces free text (typing, pasting, importing) into the column's value type. */
  static coerce(column: Pick<TrackerColumn, "type">, raw: TrackerCellValue): TrackerCellValue {
    if (raw === null || raw === undefined) return null;
    switch (column.type) {
      case "number": {
        if (typeof raw === "number") return raw;
        if (String(raw).trim() === "") return null;
        const digits = String(raw).replace(/[,\s]/g, "");
        // Decimal only: separators alone (",") are no number, and "0x10" or "1e" are text, not 16 or NaN.
        const n = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(digits) ? Number(digits) : NaN;
        return Number.isFinite(n) ? n : String(raw);
      }
      case "checkbox": {
        if (typeof raw === "boolean") return raw;
        const s = String(raw).trim().toLowerCase();
        return CHECKED_WORDS.includes(s);
      }
      case "date": {
        if (typeof raw === "string") {
          const s = raw.trim();
          if (!s) return null;
          // Nothing is guessed: a date that cannot be is kept as the text typed.
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
          if (dmy) {
            const year = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
            const month = Number(dmy[2]);
            const day = Number(dmy[1]);
            return isRealDate(year, month, day) ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : s;
          }
          // Digits alone are a date only as an Excel serial (what a copied date
          // pastes as): 20000-80000 is 1954 to 2119. "12" or "2026" stays text.
          if (/^\d+(\.\d+)?$/.test(s)) {
            const serial = Number(s);
            return serial >= 20000 && serial <= 80000 ? toIsoDate(excelSerialToDate(serial)) : s;
          }
          // Written out ("14 September 2026", "Sep 14, 2026"): only with a year,
          // and read on the calendar day as written, wherever the reader is.
          if (!/\b\d{4}\b/.test(s)) return s;
          const parsed = new Date(s);
          return Number.isNaN(parsed.getTime()) ? s : localIsoDate(parsed);
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
        const s = String(raw);
        return s.trim() === "" ? null : s;
      }
    }
  }
}

export const TRACKER_TYPE_ORDER: TrackerColumnType[] = ["text", "longText", "list", "date", "url", "number", "checkbox", "person"];

/** What ticks a checkbox when typed, pasted or carried over from another type. */
const CHECKED_WORDS = ["y", "yes", "true", "1", "✓", "x", "done"];

/** Column widths the grid can draw (its resize handle stops at 60). */
function clampWidth(width: number): number {
  return Math.max(60, Math.min(Number.isFinite(width) ? Math.round(width) : 160, 1200));
}

/** A Gregorian date that exists (no 2026-02-30, no month 25). */
function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The calendar day a locally parsed date names (Date reads "Sep 14, 2026" as local midnight). */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Column 7", or the next number no column already uses. */
function nextColumnName(columns: readonly Pick<TrackerColumn, "name">[]): string {
  const taken = new Set(columns.map((c) => c.name.trim().toLowerCase()));
  for (let n = columns.length + 1; ; n++) if (!taken.has(`column ${n}`)) return `Column ${n}`;
}

/** The footers a column type offers (as the grid's summary menu does). */
function SUMMARIES_BY_TYPE(type: TrackerColumnType): string[] {
  if (type === "number") return ["none", "count", "empty", "sum", "average", "min", "max"];
  if (type === "checkbox") return ["none", "checked", "percentChecked", "empty"];
  return ["none", "count", "empty"];
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}
