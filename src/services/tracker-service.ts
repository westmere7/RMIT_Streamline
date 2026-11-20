import type { EntityId, Item, ItemAsset, ItemAssetPatch, Tracker, TrackerAssetMapping, TrackerCellValue, TrackerColumn, TrackerColumnType, TrackerRow, TrackerRowKind, TrackerSheet, TrackerSheetInput } from "@/domain";
import { NEW_ASSET_COLUMN, assignAssetRole, coercePeople, excelSerialToDate, fitTypeFor, readDate, readQuantity, roleMismatch, toIsoDate, type AssetPerson, freeColumnName, isFreshSheet, isMappingUsable, normalizeAssetMapping, personNames, sheetLineCells, specColumnIds, suggestAssetMapping, type AssetRole, type SheetLinePatch } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { ItemAssetService, SheetSyncResult } from "@/services/item-asset-service";
import { assetSheet, blankSheet, emptyTemplateSheet } from "@/features/trackers/tracker-template";
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

  /**
   * A tracker made for a task: one sheet laid out for assets, linked to the
   * task straight away. With `moveAssets`, the task's own lines (not ones from
   * another sheet) become its rows first; they are taken off the task only once
   * the sheet's lines are in, so a failure part-way leaves them where they were.
   */
  async createForItem(
    input: { workspaceId: EntityId; teamId: EntityId | null; itemId: EntityId; name: string; assetTypes?: string[]; moveAssets?: boolean },
    actorId: EntityId,
  ): Promise<{ tracker: Tracker; sheet: TrackerSheet; moved: number }> {
    const item = await this.repos.items.getById(input.itemId);
    if (!item) throw new NotFoundError("Item", input.itemId);
    if (await this.repos.trackers.getSheetByItem(item.id)) throw new Error(`“${item.name}” already takes its assets from a sheet.`);
    const { tracker, sheets } = await this.create({ workspaceId: input.workspaceId, teamId: input.teamId, name: input.name, layout: "blank", sheets: [assetSheet("", "Assets", input.assetTypes)] }, actorId);
    const { sheet, moved } = await this.linkSheet(sheets[0]!.id, item.id, suggestAssetMapping(sheets[0]!), actorId, { moveAssets: input.moveAssets });
    return { tracker, sheet, moved };
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
  async linkSheet(
    sheetId: EntityId,
    itemId: EntityId,
    mapping: TrackerAssetMapping,
    actorId: EntityId,
    options: { moveAssets?: boolean; setUpColumns?: boolean; assetTypes?: string[] } = {},
  ): Promise<{ sheet: TrackerSheet; sync: SheetSyncResult | null; moved: number }> {
    let sheet = await this.getSheet(sheetId);
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    if (sheet.itemId && sheet.itemId !== itemId) {
      const other = await this.repos.items.getById(sheet.itemId);
      throw new Error(`This sheet already holds the assets of “${other?.name ?? "another task"}”. Unlink it there first.`);
    }
    const taken = await this.repos.trackers.getSheetByItem(itemId);
    if (taken && taken.id !== sheetId) throw new Error(`“${item.name}” already takes its assets from the sheet “${taken.name}”.`);
    // A sheet nobody has started gets the asset columns outright, read as they are.
    if (options.setUpColumns && !sheet.itemId && isFreshSheet(sheet)) {
      const columns = assetSheet("", sheet.name, options.assetTypes).columns;
      const result = await this.saveSheetDraft(sheetId, { columns, frozenColumns: 1 }, sheet.updatedAt, actorId);
      if ("conflict" in result) throw new Error("The sheet changed while it was being set up. Try again.");
      sheet = result.sheet;
      mapping = suggestAssetMapping(sheet);
    }
    let clean = normalizeAssetMapping(mapping, sheet.columns);
    if (!isMappingUsable(clean)) throw new Error("Choose the column that names each asset.");

    // The task's own lines, moved in as rows below what the sheet already holds.
    const moving = options.moveAssets ? (await this.repos.itemAssets.listByItem(item.id)).filter((a) => !a.trackerSheetId).sort((a, b) => a.position - b.position) : [];
    let placedRows: string[] = [];
    if (moving.length) {
      const placed = await this.placeLines(sheetId, clean, moving, actorId);
      clean = placed.mapping;
      placedRows = placed.rowIds;
    }

    const saved = await this.repos.trackers.updateSheet(sheetId, { itemId, assetMapping: clean });
    const sync = await this.syncAssets(saved, actorId);
    let moved = 0;
    if (moving.length) {
      // Taken off the task only once every moved row is back as a line: a part-way failure leaves them where they were.
      const wanted = new Set(placedRows);
      const arrived = (await this.repos.itemAssets.listBySheet(sheetId)).filter((l) => l.itemId === item.id && wanted.has(l.trackerRowId ?? "")).length;
      if (arrived === moving.length) {
        await this.repos.itemAssets.deleteMany(moving.map((a) => a.id));
        await this.assets?.recompute(item.id, item.boardId);
        moved = moving.length;
      }
    }
    return { sheet: saved, sync, moved };
  }

  /**
   * Writes a task's lines into a sheet as rows, through the mapping: below the
   * rows already there, never over them. A part the lines use and the sheet has
   * no column for gets one first (assetType, quantity, PIC, due, done, link,
   * spec), and a type the Type dropdown lacks is added to it, so nothing a line
   * holds is lost. Lines in no block go above the first band (under a band they
   * would join it); a block's lines go under the band of the same name, or a new
   * band at the end. Returns the mapping (with any new columns) and the new rows.
   */
  private async placeLines(sheetId: EntityId, mapping: TrackerAssetMapping, lines: readonly ItemAsset[], actorId: EntityId): Promise<{ mapping: TrackerAssetMapping; rowIds: EntityId[] }> {
    let m = mapping;
    const types = [...new Set(lines.map((l) => l.assetType ?? "").filter(Boolean))];
    const needs: Array<[Exclude<AssetRole, "spec" | "name">, boolean, boolean]> = [
      ["type", lines.some((l) => l.assetType), !m.type.columnId],
      ["quantity", lines.some((l) => l.quantity !== null), !m.quantity.columnId],
      ["pic", lines.some((l) => l.assigneeIds.length > 0), !m.pic.columnId],
      ["due", lines.some((l) => !!l.dueDate), !m.due.columnId],
      ["done", lines.some((l) => !!l.completedAt), !m.done.columnId],
      ["link", lines.some((l) => l.links.length > 0), m.links.length === 0],
    ];
    for (const [role, used, missing] of needs) {
      if (!used || !missing) continue;
      const { column } = await this.addAssetColumn(sheetId, role, actorId, role === "type" ? types : []);
      m = assignAssetRole(m, column, role);
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      let columns = sheet.columns;
      // Notes need a spec column too.
      if (lines.some((l) => l.notes?.trim()) && specColumnIds(m).length === 0) {
        const spec: TrackerColumn = { id: newId(), name: freeColumnName(columns, "Spec"), type: "text", width: 240 };
        columns = [...columns, spec];
        m = { ...m, spec: [spec.id] };
      }
      // A type the dropdown does not offer yet joins its options.
      const typeColumn = columns.find((c) => c.id === m.type.columnId);
      if (typeColumn?.type === "list") {
        const missingTypes = types.filter((t) => !(typeColumn.options ?? []).includes(t));
        if (missingTypes.length) columns = columns.map((c) => (c.id === typeColumn.id ? { ...c, options: [...(c.options ?? []), ...missingTypes] } : c));
      }
      const grid = { ...sheet, columns };

      const rowFor = (line: ItemAsset): TrackerRow => {
        const cells: TrackerRow["cells"] = {};
        const fields: SheetLinePatch[] = [
          { name: line.name },
          { assetType: line.assetType },
          { quantity: line.quantity },
          { assigneeIds: line.assigneeIds },
          { dueDate: line.dueDate },
          { completedAt: line.completedAt },
          { links: line.links },
        ];
        for (const patch of fields) {
          const value = Object.values(patch)[0];
          if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
          const { cells: out, refused } = sheetLineCells(grid, m, patch);
          if (refused) continue;
          for (const cell of out) if (cell.value !== null && cell.value !== "") cells[cell.columnId] = cell.value;
        }
        // Notes into the (first) spec column as they read, whatever else the spec holds.
        const specId = specColumnIds(m)[0];
        if (line.notes?.trim() && specId) cells[specId] = line.notes.trim();
        return { id: newId(), kind: "data", cells };
      };

      // Where rows go: after the last row with anything in it, before the first band for lines in no block.
      const rows = [...sheet.rows];
      const filled = (r: TrackerRow) => r.kind !== "data" || Object.keys(r.cells).length > 0;
      const lastFilled = (from: number, to: number) => {
        let at = from - 1;
        for (let i = from; i < to; i++) if (filled(rows[i]!)) at = i;
        return at;
      };
      const firstBand = rows.findIndex((r) => r.kind !== "data");
      const loose = lines.filter((l) => !l.blockName).map(rowFor);
      const rowIds: EntityId[] = loose.map((r) => r.id);
      if (loose.length) {
        const end = firstBand === -1 ? rows.length : firstBand;
        rows.splice(lastFilled(0, end) + 1, 0, ...loose);
      }
      const blocks = [...new Set(lines.map((l) => l.blockName).filter((b): b is string => !!b))];
      for (const block of blocks) {
        const blockRows = lines.filter((l) => l.blockName === block).map(rowFor);
        rowIds.push(...blockRows.map((r) => r.id));
        const band = rows.findIndex((r) => r.kind !== "data" && (r.label ?? "").trim().toLowerCase() === block.trim().toLowerCase());
        if (band !== -1) {
          const next = rows.findIndex((r, i) => i > band && r.kind !== "data");
          const end = next === -1 ? rows.length : next;
          rows.splice(Math.max(band, lastFilled(band + 1, end)) + 1, 0, ...blockRows);
        } else {
          rows.splice(lastFilled(0, rows.length) + 1, 0, { id: newId(), kind: "section", label: block, cells: {} }, ...blockRows);
        }
      }

      const result = await this.saveSheetDraft(sheetId, { columns, rows }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return { mapping: normalizeAssetMapping(m, columns) ?? m, rowIds };
    }
    throw new Error("The sheet kept changing. Try again in a moment.");
  }

  /**
   * Turns data rows that are really section or channel labels into bands
   * (labelled with their text), as the asset settings offer when they spot them.
   * Saved like any edit, so a linked sheet's lines pick up the new blocks.
   */
  async bandRows(sheetId: EntityId, rowIds: EntityId[], actorId: EntityId): Promise<TrackerSheet> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      const ids = rowIds.filter((id) => sheet.rows.some((r) => r.id === id && r.kind === "data"));
      if (ids.length === 0) return sheet;
      const banded = TrackerService.setRowKind(sheet, ids, "section");
      const result = await this.saveSheetDraft(sheetId, { rows: banded.rows }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return result.sheet;
    }
    throw new Error("The sheet kept changing. Try again in a moment.");
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

  /**
   * Makes a column fit a part of the task's assets, as asked from the prompt
   * when it does not: clears the cells the part cannot read and, when the
   * column's type cannot hold the part, turns it into the part's own type.
   */
  async fitAssetColumn(sheetId: EntityId, columnId: EntityId, role: Exclude<AssetRole, "spec">, actorId: EntityId, people: readonly AssetPerson[] = []): Promise<{ sheet: TrackerSheet; cleared: number; retyped: TrackerColumnType | null }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      const fitted = TrackerService.fitColumn(sheet, columnId, role, people);
      if (!fitted.cleared && !fitted.retyped) return { sheet, cleared: 0, retyped: null };
      const result = await this.saveSheetDraft(sheetId, { columns: fitted.sheet.columns, rows: fitted.sheet.rows }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return { sheet: result.sheet, cleared: fitted.cleared, retyped: fitted.retyped };
    }
    throw new Error("The sheet kept changing. Try again in a moment.");
  }

  /**
   * The sheet with one column made to fit a part: the cells the part cannot
   * read emptied, and a column whose type cannot hold the part turned into the
   * part's own type, every value left read as the part reads it (14/03/2026 as
   * 2026-03-14, "3 pcs" as 3) so nothing that counted is lost.
   */
  static fitColumn(sheet: TrackerSheet, columnId: EntityId, role: Exclude<AssetRole, "spec">, people: readonly AssetPerson[] = []): { sheet: TrackerSheet; cleared: number; retyped: TrackerColumnType | null } {
    const mismatch = roleMismatch(sheet, columnId, role, people);
    if (!mismatch) return { sheet, cleared: 0, retyped: null };
    const clear = new Set(mismatch.rowIds);
    const retyped = mismatch.wrongType ? fitTypeFor(role) : null;
    const read = (value: TrackerCellValue): TrackerCellValue => {
      if (!retyped) return value;
      // An unticked box is no value of the new type (and was never a filled cell to clear).
      if (typeof value === "boolean" && retyped !== "checkbox") return null;
      if (role === "due") return readDate(value) ?? value;
      if (role === "quantity") return readQuantity(value) ?? value;
      return value;
    };
    const rows = sheet.rows.map((row) => {
      if (row.kind !== "data" || !(columnId in row.cells)) return row;
      const cells = { ...row.cells };
      const value = clear.has(row.id) ? null : read(cells[columnId]!);
      if (value === null) delete cells[columnId];
      else cells[columnId] = value;
      return { ...row, cells };
    });
    const cleared = sheet.rows.filter((r) => clear.has(r.id) && r.kind === "data").length;
    const next = { ...sheet, rows };
    return { sheet: retyped ? TrackerService.updateColumn(next, columnId, { type: retyped }) : next, cleared, retyped };
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
          // Nothing is guessed (readDate): a date that cannot be is kept as the text typed.
          return readDate(s) ?? s;
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

