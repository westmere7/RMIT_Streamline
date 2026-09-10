import type { EntityId, ISODate, ISODateTime, Timestamps } from "@/domain/common/types";
import type { TagOption } from "@/domain/board/column";
import { BOOKING_ASSET_TYPES } from "@/domain/booking/booking";

/**
 * The deliverables of one task, listed line by line.
 *
 * Most tasks are too small for a tracker sheet, yet the team still needs to
 * know what is being produced, how many, who is making it and by when. Every
 * item therefore carries its own asset list — a tab on the item panel — and a
 * board may add an "Assets recap" column that summarises it in a cell. The
 * lines are what a deliverables report will be built from later.
 */
export interface ItemAsset extends Timestamps {
  id: EntityId;
  itemId: EntityId;
  /** The item's board, kept on the row so a board's assets can be read in one query. */
  boardId: EntityId;
  /** "A1 poster", "Instagram tile", "60s film"… */
  name: string;
  /** One of the team's asset types (Print, Digital, Video…), or anything typed in. */
  assetType: string | null;
  /** How many of this line; null means "one, not counted separately". */
  quantity: number | null;
  /** The people in charge of this line, in the order they were added. */
  assigneeIds: EntityId[];
  dueDate: ISODate | null;
  /** When the line was ticked off; null while it is outstanding. */
  completedAt: ISODateTime | null;
  /** Size, format, dimensions, colour, duration… free text. */
  notes: string | null;
  position: number;
  createdBy: EntityId;
}

export type ItemAssetInput = Pick<ItemAsset, "itemId" | "boardId" | "name" | "createdBy"> &
  Partial<Pick<ItemAsset, "assetType" | "quantity" | "assigneeIds" | "dueDate" | "completedAt" | "notes" | "position">>;

export type ItemAssetPatch = Partial<Pick<ItemAsset, "name" | "assetType" | "quantity" | "assigneeIds" | "dueDate" | "completedAt" | "notes" | "position">>;

/** The palette the asset-type picker offers; anything else can still be typed. */
export const ASSET_TYPE_OPTIONS: readonly TagOption[] = BOOKING_ASSET_TYPES;

/** The figures a task's asset list adds up to. Recomputed live wherever it is shown. */
export interface AssetsRecap {
  /** Lines in the list. */
  lines: number;
  /** Sum of the quantities; a line without a quantity counts as one. */
  quantity: number;
  /** Distinct asset types, sorted. Lines without a type are not counted here. */
  types: string[];
  /** Distinct people in charge, across every line. */
  assigneeIds: EntityId[];
  /** Lines with nobody in charge. */
  unassigned: number;
  /** Lines ticked off. */
  done: number;
  /** Quantity on the lines ticked off — what the progress bar fills to. */
  doneQuantity: number;
  /** The earliest due date that is today or later on a line still outstanding, or null. */
  nextDue: ISODate | null;
  /** Lines whose due date has passed. */
  overdue: number;
}

export function assetCount(asset: Pick<ItemAsset, "quantity">): number {
  return asset.quantity === null || asset.quantity === undefined ? 1 : Math.max(0, asset.quantity);
}

export function recapAssets(assets: readonly Pick<ItemAsset, "quantity" | "assetType" | "assigneeIds" | "dueDate" | "completedAt">[], today: ISODate): AssetsRecap {
  const types = new Set<string>();
  const assignees = new Set<EntityId>();
  let quantity = 0;
  let unassigned = 0;
  let overdue = 0;
  let done = 0;
  let doneQuantity = 0;
  let nextDue: ISODate | null = null;
  for (const asset of assets) {
    quantity += assetCount(asset);
    if (asset.completedAt) {
      done += 1;
      doneQuantity += assetCount(asset);
    }
    const type = asset.assetType?.trim();
    if (type) types.add(type);
    if (asset.assigneeIds.length > 0) for (const id of asset.assigneeIds) assignees.add(id);
    else unassigned += 1;
    if (asset.dueDate && !asset.completedAt) {
      if (asset.dueDate < today) overdue += 1;
      else if (nextDue === null || asset.dueDate < nextDue) nextDue = asset.dueDate;
    }
  }
  return {
    lines: assets.length,
    quantity,
    types: [...types].sort((a, b) => a.localeCompare(b)),
    assigneeIds: [...assignees],
    unassigned,
    done,
    doneQuantity,
    nextDue,
    overdue,
  };
}

/** Per asset type, how many units — for the breakdown in the panel. */
export function countByType(assets: readonly Pick<ItemAsset, "quantity" | "assetType">[]): Array<{ type: string | null; quantity: number; lines: number }> {
  const totals = new Map<string | null, { quantity: number; lines: number }>();
  for (const asset of assets) {
    const type = asset.assetType?.trim() || null;
    const entry = totals.get(type) ?? { quantity: 0, lines: 0 };
    entry.quantity += assetCount(asset);
    entry.lines += 1;
    totals.set(type, entry);
  }
  return [...totals.entries()].map(([type, t]) => ({ type, ...t })).sort((a, b) => (a.type ?? "￿").localeCompare(b.type ?? "￿"));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The cell text: "3 assets ×24 · 2 PIC". Short by design — the panel has the
 * full list. Empty when there is nothing to say.
 *
 * The count is the number of deliverable *lines*, not the number of copies
 * ordered. Those are different numbers — one poster ×25 is one thing to make
 * — and counting copies here said "25 assets" for a request whose receipt said
 * "1 asset" and whose subitem list said "1 item". The multiplier is shown next
 * to it when it adds anything, so the quantity is still on the board.
 */
export function formatAssetsRecap(recap: Pick<AssetsRecap, "lines" | "quantity"> & { types: number | string[]; people: number | EntityId[] }): string {
  if (recap.lines === 0) return "";
  // How much there is and how many people are on it. The types are in the value
  // for sorting and export, but a cell this narrow reads better without them.
  const people = Array.isArray(recap.people) ? recap.people.length : recap.people;
  return `${plural(recap.lines, "asset")}${recap.quantity > recap.lines ? ` ×${recap.quantity}` : ""} · ${people} PIC`;
}

/** The value stored in an "Assets recap" column, so the board can sort, filter and export it. */
export function recapColumnValue(recap: AssetsRecap): { type: "ASSETS_RECAP"; lines: number; quantity: number; types: number; people: number; nextDue: ISODate | null; overdue: number } {
  return { type: "ASSETS_RECAP", lines: recap.lines, quantity: recap.quantity, types: recap.types.length, people: recap.assigneeIds.length, nextDue: recap.nextDue, overdue: recap.overdue };
}
