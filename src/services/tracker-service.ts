import type { EntityId, Item, ItemAsset, ItemAssetPatch, Tracker, TrackerAssetMapping, TrackerCellFormat, TrackerCellValue, TrackerColumn, TrackerColumnType, TrackerRow, TrackerRowKind, TrackerSheet, TrackerSheetInput } from "@/domain";
import { cleanCellFormat, NEW_ASSET_COLUMN, assetPeopleOf, assignAssetRole, coercePeople, newNotesColumnName, notesColumnFor, partsToWrite, planLineMove, excelSerialToDate, fitTypeFor, readDate, readQuantity, roleMismatch, toIsoDate, type AssetPerson, freeColumnName, isFreshSheet, isMappingUsable, normalizeAssetMapping, personNames, sheetLineCells, suggestAssetMapping, type AssetRole, type SheetLinePatch } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { ItemAssetService, SheetSyncResult } from "@/services/item-asset-service";
import { assetSheet, blankSheet, emptyTemplateSheet } from "@/features/trackers/tracker-template";
import { newId } from "@/lib/ids";

/** Rows a move placed in a sheet: which line each is for, and the bands it made for blocks. */
interface PlacedLines {
  mapping: TrackerAssetMapping;
  pairs: Array<{ lineId: EntityId; rowId: EntityId }>;
  bandIds: EntityId[];
}

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
    await this.unlinkSheet(sheetId, actorId, { keepAssets });
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

  /**
   * A new sheet in an existing tracker, laid out for assets and linked to the
   * task in one go: the same as createForItem, without making a tracker. Put
   * at the end of the tracker's sheets. If linking fails the sheet goes again,
   * so the tracker is not left with an empty one nobody asked for.
   */
  async addSheetForItem(
    input: { trackerId: EntityId; itemId: EntityId; name: string; assetTypes?: string[]; moveAssets?: boolean },
    actorId: EntityId,
  ): Promise<{ tracker: Tracker; sheet: TrackerSheet; moved: number }> {
    const tracker = await this.get(input.trackerId);
    const item = await this.repos.items.getById(input.itemId);
    if (!item) throw new NotFoundError("Item", input.itemId);
    if (await this.repos.trackers.getSheetByItem(item.id)) throw new Error(`“${item.name}” already takes its assets from a sheet.`);
    const name = input.name.trim() || "Assets";
    const created = await this.repos.trackers.createSheet(assetSheet(tracker.id, name, input.assetTypes));
    try {
      const { sheet, moved } = await this.linkSheet(created.id, item.id, suggestAssetMapping(created), actorId, { moveAssets: input.moveAssets });
      return { tracker, sheet, moved };
    } catch (error) {
      await this.repos.trackers.deleteSheet(created.id).catch(() => undefined);
      throw error;
    }
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
    const moving = options.moveAssets ? await this.ownLines(item) : [];
    let placed: PlacedLines | null = null;
    if (moving.length) {
      const people = await this.people();
      const plan = planLineMove(sheet, clean, moving, people);
      if (plan.blockers.length) throw new Error(plan.blockers[0]);
      placed = await this.placeLines(sheetId, clean, moving, actorId, people);
      clean = placed.mapping;
    }

    const saved = await this.repos.trackers.updateSheet(sheetId, { itemId, assetMapping: clean });
    if (!placed) return { sheet: saved, sync: await this.syncAssets(saved, actorId), moved: 0 };
    const done = await this.attachPlaced(sheetId, item, moving, placed, actorId);
    return { sheet: done.sheet, sync: done.sync, moved: done.moved };
  }

  /**
   * Moves the task's own lines into the sheet that already holds its assets:
   * each becomes a row below what is there, and the line itself becomes that
   * row's line, so it keeps its id, when it was added and when it was done.
   * Refused, with nothing written, when a column cannot hold what the lines
   * have (see planLineMove). A line changed while it moved stays on the task,
   * and its row is taken out again.
   */
  async moveTaskAssetsIntoSheet(sheetId: EntityId, actorId: EntityId, options: { lineIds?: readonly EntityId[] } = {}): Promise<{ sheet: TrackerSheet; moved: number; kept: number }> {
    const sheet = await this.getSheet(sheetId);
    if (!sheet.itemId) throw new Error("This sheet holds no task's assets.");
    const item = await this.repos.items.getById(sheet.itemId);
    if (!item) throw new NotFoundError("Item", sheet.itemId);
    const mapping = normalizeAssetMapping(sheet.assetMapping, sheet.columns);
    if (!isMappingUsable(mapping)) throw new Error("Choose the column that names each asset first.");
    // Every line the task shows that no sheet holds: its own, and a linked task's (which then becomes this task's).
    const movable = await this.movableLines(item);
    const chosen = options.lineIds ? new Set(options.lineIds) : null;
    const lines = chosen ? movable.filter((l) => chosen.has(l.id)) : movable;
    if (lines.length === 0) return { sheet, moved: 0, kept: 0 };
    const people = await this.people();
    const plan = planLineMove(sheet, mapping, lines, people);
    if (plan.blockers.length) throw new Error(plan.blockers[0]);

    const placed = await this.placeLines(sheetId, mapping, lines, actorId, people);
    // New columns the lines needed join the mapping before the lines are read through it.
    if (JSON.stringify(placed.mapping) !== JSON.stringify(mapping)) await this.repos.trackers.updateSheet(sheetId, { assetMapping: placed.mapping });
    const done = await this.attachPlaced(sheetId, item, lines, placed, actorId);
    return { sheet: done.sheet, moved: done.moved, kept: lines.length - done.moved };
  }

  /** Every line the task shows that no sheet holds: its own first, then a linked task's, each in its order. */
  private async movableLines(item: Item): Promise<ItemAsset[]> {
    if (!this.assets) return this.ownLines(item);
    const shown = (await this.assets.list(item.id)).filter((a) => !a.trackerSheetId);
    const own = shown.filter((a) => a.itemId === item.id).sort((a, b) => a.position - b.position);
    return [...own, ...shown.filter((a) => a.itemId !== item.id)];
  }

  /** The task's lines of its own (not a sheet's, not a linked task's), in their order. */
  private async ownLines(item: Item): Promise<ItemAsset[]> {
    return (await this.repos.itemAssets.listByItem(item.id)).filter((a) => !a.trackerSheetId && a.itemId === item.id).sort((a, b) => a.position - b.position);
  }

  /** Everyone a text PIC cell may name. */
  private async people(): Promise<AssetPerson[]> {
    return assetPeopleOf(await this.repos.users.list());
  }

  /**
   * Hands the placed rows their lines: the task's own, taken as they were read,
   * so a line edited meanwhile is not overwritten by its older copy. Any line a
   * concurrent save already gave one of these rows is a fresh duplicate and
   * goes first. A line not taken keeps its place on the task, and its row
   * leaves the sheet again; then the sheet is read once more into the lines.
   */
  private async attachPlaced(sheetId: EntityId, item: Item, lines: readonly ItemAsset[], placed: PlacedLines, actorId: EntityId): Promise<{ sheet: TrackerSheet; sync: SheetSyncResult | null; moved: number }> {
    const rowIds = new Set(placed.pairs.map((p) => p.rowId));
    const claimed = (await this.repos.itemAssets.listBySheet(sheetId)).filter((l) => rowIds.has(l.trackerRowId ?? ""));
    if (claimed.length) await this.repos.itemAssets.deleteMany(claimed.map((l) => l.id));
    const read = new Map(lines.map((l) => [l.id, l.updatedAt]));
    // A linked task's line joins this task: the sheet's lines are all its task's.
    const owner = new Map(lines.map((l) => [l.id, l.itemId]));
    const attached = new Set(
      await this.repos.itemAssets.attachToSheet(
        sheetId,
        placed.pairs.map((p) => ({ id: p.lineId, rowId: p.rowId, updatedAt: read.get(p.lineId)!, ...(owner.get(p.lineId) !== item.id ? { itemId: item.id, boardId: item.boardId } : {}) })),
      ),
    );
    const left = placed.pairs.filter((p) => !attached.has(p.lineId)).map((p) => p.rowId);
    if (left.length) await this.removePlacedRows(sheetId, left, placed.bandIds, actorId);
    const sheet = await this.getSheet(sheetId);
    const sync = await this.syncAssets(sheet, actorId);
    await this.assets?.recompute(item.id, item.boardId);
    return { sheet, sync, moved: attached.size };
  }

  /** Takes rows a move placed out again, with any band it made that is left with nothing under it. */
  private async removePlacedRows(sheetId: EntityId, rowIds: readonly EntityId[], bandIds: readonly EntityId[], actorId: EntityId): Promise<void> {
    const gone = new Set(rowIds);
    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      const rows = sheet.rows.filter((r) => !gone.has(r.id));
      const empty = new Set(
        bandIds.filter((id) => {
          const at = rows.findIndex((r) => r.id === id);
          if (at === -1) return false;
          const next = rows.findIndex((r, i) => i > at && r.kind !== "data");
          return rows.slice(at + 1, next === -1 ? rows.length : next).every((r) => Object.keys(r.cells).length === 0);
        }),
      );
      const result = await this.saveSheetDraft(sheetId, { rows: rows.filter((r) => !empty.has(r.id)) }, sheet.updatedAt, actorId);
      if (!("conflict" in result)) return;
    }
    throw new Error("The sheet kept changing. Some assets may show twice; take the extra rows out of the sheet.");
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
  private async placeLines(sheetId: EntityId, mapping: TrackerAssetMapping, lines: readonly ItemAsset[], actorId: EntityId, people: readonly AssetPerson[]): Promise<PlacedLines> {
    let m = mapping;
    const types = [...new Set(lines.map((l) => l.assetType ?? "").filter(Boolean))];
    // A part goes in a cell only where the sheet's value for every row would not give it back.
    const writes = partsToWrite(m, lines);
    const needs: Array<[Exclude<AssetRole, "spec" | "name" | "link">, boolean, boolean]> = [
      ["type", writes.type, !m.type.columnId],
      ["quantity", writes.quantity, !m.quantity.columnId],
      ["pic", writes.pic, !m.pic.columnId],
      ["due", writes.due, !m.due.columnId],
      ["done", writes.done, !m.done.columnId],
    ];
    for (const [role, used, missing] of needs) {
      if (!used || !missing) continue;
      const { column } = await this.addAssetColumn(sheetId, role, actorId, role === "type" ? types : []);
      m = assignAssetRole(m, column, role);
    }
    // As many link columns as the longest list of links needs: the nth link goes in the nth.
    const mostLinks = Math.max(0, ...lines.map((l) => l.links.length));
    while (m.links.length < mostLinks) {
      const { column } = await this.addAssetColumn(sheetId, "link", actorId);
      m = assignAssetRole(m, column, "link");
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const sheet = await this.getSheet(sheetId);
      let columns = sheet.columns;
      // Notes go in a spec column meant for them, else one of their own (a Format or Platform column means something else).
      let notesId = notesColumnFor(columns, m)?.id ?? null;
      if (lines.some((l) => l.notes?.trim()) && !notesId) {
        const notes: TrackerColumn = { id: newId(), name: newNotesColumnName(columns, m), type: "text", width: 240 };
        columns = [...columns, notes];
        m = { ...m, spec: [...m.spec, notes.id] };
        notesId = notes.id;
      }
      // A type the dropdown does not offer yet joins its options.
      const typeColumn = columns.find((c) => c.id === m.type.columnId);
      if (typeColumn?.type === "list") {
        const missingTypes = types.filter((t) => !(typeColumn.options ?? []).includes(t));
        if (missingTypes.length) columns = columns.map((c) => (c.id === typeColumn.id ? { ...c, options: [...(c.options ?? []), ...missingTypes] } : c));
      }
      const grid = { ...sheet, columns };

      const linkColumns = m.links.map((id) => columns.find((c) => c.id === id)).filter((c): c is TrackerColumn => !!c);
      const pairs: PlacedLines["pairs"] = [];
      const rowFor = (line: ItemAsset): TrackerRow => {
        const cells: TrackerRow["cells"] = {};
        const fields: SheetLinePatch[] = [
          { name: line.name },
          ...(writes.type ? [{ assetType: line.assetType }] : []),
          ...(writes.quantity ? [{ quantity: line.quantity }] : []),
          ...(writes.pic ? [{ assigneeIds: line.assigneeIds }] : []),
          ...(writes.due ? [{ dueDate: line.dueDate }] : []),
          { completedAt: line.completedAt },
        ];
        for (const patch of fields) {
          const value = Object.values(patch)[0];
          if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
          const { cells: out, refused } = sheetLineCells(grid, m, patch, people);
          // planLineMove refuses these before anything is written; one here means the sheet changed under the move.
          if (refused) throw new Error(refused);
          for (const cell of out) if (cell.value !== null && cell.value !== "") cells[cell.columnId] = cell.value;
        }
        line.links.forEach((link, i) => {
          const column = linkColumns[i];
          if (column && link.url.trim()) cells[column.id] = link.url.trim();
        });
        if (line.notes?.trim() && notesId) cells[notesId] = line.notes.trim();
        const row: TrackerRow = { id: newId(), kind: "data", cells };
        pairs.push({ lineId: line.id, rowId: row.id });
        return row;
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
      const bandIds: EntityId[] = [];
      if (loose.length) {
        const end = firstBand === -1 ? rows.length : firstBand;
        rows.splice(lastFilled(0, end) + 1, 0, ...loose);
      }
      const blocks = [...new Set(lines.map((l) => l.blockName).filter((b): b is string => !!b))];
      for (const block of blocks) {
        const blockRows = lines.filter((l) => l.blockName === block).map(rowFor);
        const band = rows.findIndex((r) => r.kind !== "data" && (r.label ?? "").trim().toLowerCase() === block.trim().toLowerCase());
        if (band !== -1) {
          const next = rows.findIndex((r, i) => i > band && r.kind !== "data");
          const end = next === -1 ? rows.length : next;
          rows.splice(Math.max(band, lastFilled(band + 1, end)) + 1, 0, ...blockRows);
        } else {
          const made: TrackerRow = { id: newId(), kind: "section", label: block, cells: {} };
          bandIds.push(made.id);
          rows.splice(lastFilled(0, rows.length) + 1, 0, made, ...blockRows);
        }
      }

      // Written without reading the rows into lines: the task's own lines become theirs next (attachPlaced),
      // and a sync now would give each row a second, new line.
      const saved = await this.repos.trackers.updateSheetIfCurrent(sheetId, { columns, rows }, sheet.updatedAt);
      if (saved) return { mapping: normalizeAssetMapping(m, columns) ?? m, pairs, bandIds };
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

  /**
   * Lets the sheet go of its task. The rows stay in the sheet. Kept, the task's
   * lines from it are detached and stay as the task's own (same ids, dates and
   * done marks); otherwise they are taken off the task.
   */
  async unlinkSheet(sheetId: EntityId, actorId: EntityId, options: { keepAssets?: boolean } = {}): Promise<TrackerSheet> {
    const sheet = await this.getSheet(sheetId);
    if (!sheet.itemId) return sheet;
    if (options.keepAssets) await this.repos.itemAssets.detachFromSheet(sheetId);
    else await this.assets?.syncFromSheet({ ...sheet, itemId: sheet.itemId, assetMapping: null }, actorId);
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

  /**
   * Sets formatting on cells, as Excel's Home ribbon does: each cell gets the
   * patch merged into what it has (a key set to undefined or false comes off;
   * size "md" is the normal size and comes off too). Data rows and the sheet's
   * columns only; a cell left plain carries nothing.
   */
  static setFormats(sheet: TrackerSheet, cells: ReadonlyArray<{ rowId: EntityId; columnId: EntityId }>, patch: Partial<TrackerCellFormat> | ((current: TrackerCellFormat) => TrackerCellFormat | null)): TrackerSheet {
    const byRow = new Map<EntityId, EntityId[]>();
    for (const cell of cells) byRow.set(cell.rowId, [...(byRow.get(cell.rowId) ?? []), cell.columnId]);
    const columnIds = new Set(sheet.columns.map((c) => c.id));
    return {
      ...sheet,
      rows: sheet.rows.map((row) => {
        const targets = byRow.get(row.id)?.filter((id) => columnIds.has(id));
        if (!targets?.length || row.kind !== "data") return row;
        const formats: Record<EntityId, TrackerCellFormat> = { ...(row.formats ?? {}) };
        for (const columnId of targets) {
          const current = formats[columnId] ?? {};
          const next = cleanCellFormat(typeof patch === "function" ? patch(current) : { ...current, ...patch });
          if (next) formats[columnId] = next;
          else delete formats[columnId];
        }
        const out: TrackerRow = { ...row, formats };
        if (Object.keys(formats).length === 0) delete out.formats;
        return out;
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
      if (ids.has(row.id)) rows.push({ ...row, id: newId(), cells: { ...row.cells }, ...(row.formats ? { formats: { ...row.formats } } : {}) });
    }
    return { ...sheet, rows };
  }

  static setRowKind(sheet: TrackerSheet, rowIds: EntityId[], kind: TrackerRowKind): TrackerSheet {
    const ids = new Set(rowIds);
    return {
      ...sheet,
      rows: sheet.rows.map((row) => {
        if (!ids.has(row.id)) return row;
        if (kind === "data") return { id: row.id, kind, cells: row.cells, ...(row.formats ? { formats: row.formats } : {}) };
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
        if (!(columnId in r.cells) && !(r.formats && columnId in r.formats)) return r;
        const cells = { ...r.cells };
        delete cells[columnId];
        const out: TrackerRow = { ...r, cells };
        if (r.formats) {
          const formats = { ...r.formats };
          delete formats[columnId];
          if (Object.keys(formats).length) out.formats = formats;
          else delete out.formats;
        }
        return out;
      }),
    };
  }

  /**
   * Moves several columns together, in their order, so the first of them lands
   * at `toIndex` among the columns that are not moving (as moveRows does rows).
   */
  static moveColumns(sheet: TrackerSheet, columnIds: EntityId[], toIndex: number): TrackerSheet {
    const ids = new Set(columnIds);
    const moving = sheet.columns.filter((c) => ids.has(c.id));
    if (moving.length === 0) return sheet;
    const rest = sheet.columns.filter((c) => !ids.has(c.id));
    rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, ...moving);
    return { ...sheet, columns: rest };
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

