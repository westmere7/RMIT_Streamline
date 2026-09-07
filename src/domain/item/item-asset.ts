import type { EntityId, ISODate, Timestamps } from "@/domain/common/types";
import type { TagOption } from "@/domain/board/column";
import { BOOKING_ASSET_TYPES } from "@/domain/booking/booking";

/**
 * The deliverables of one task, listed line by line.
 *
 * Most tasks are too small for a tracker sheet, yet the studio still needs to
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
  /** One of the studio's asset types (Print, Digital, Video…), or anything typed in. */
  assetType: string | null;
  /** How many of this line; null means "one, not counted separately". */
  quantity: number | null;
  /** The person in charge of this line. */
  assigneeId: EntityId | null;
  dueDate: ISODate | null;
  /** Size, format, dimensions, colour, duration… free text. */
  notes: string | null;
  position: number;
  createdBy: EntityId;
}

export type ItemAssetInput = Pick<ItemAsset, "itemId" | "boardId" | "name" | "createdBy"> &
  Partial<Pick<ItemAsset, "assetType" | "quantity" | "assigneeId" | "dueDate" | "notes" | "position">>;

export type ItemAssetPatch = Partial<Pick<ItemAsset, "name" | "assetType" | "quantity" | "assigneeId" | "dueDate" | "notes" | "position">>;

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
  /** Distinct people in charge. */
  assigneeIds: EntityId[];
  /** Lines with nobody in charge. */
  unassigned: number;
  /** The earliest due date that is today or later, or null. */
  nextDue: ISODate | null;
  /** Lines whose due date has passed. */
  overdue: number;
}

export function assetCount(asset: Pick<ItemAsset, "quantity">): number {
  return asset.quantity === null || asset.quantity === undefined ? 1 : Math.max(0, asset.quantity);
}

export function recapAssets(assets: readonly Pick<ItemAsset, "quantity" | "assetType" | "assigneeId" | "dueDate">[], today: ISODate): AssetsRecap {
  const types = new Set<string>();
  const assignees = new Set<EntityId>();
  let quantity = 0;
  let unassigned = 0;
  let overdue = 0;
  let nextDue: ISODate | null = null;
  for (const asset of assets) {
    quantity += assetCount(asset);
    const type = asset.assetType?.trim();
    if (type) types.add(type);
    if (asset.assigneeId) assignees.add(asset.assigneeId);
    else unassigned += 1;
    if (asset.dueDate) {
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
 * The cell text: "14 assets · 3 types · 2 PIC". Short by design — the panel
 * has the full list. Empty when there is nothing to say.
 */
export function formatAssetsRecap(recap: Pick<AssetsRecap, "lines" | "quantity"> & { types: number | string[]; people: number | EntityId[] }): string {
  if (recap.lines === 0) return "";
  const types = Array.isArray(recap.types) ? recap.types.length : recap.types;
  const people = Array.isArray(recap.people) ? recap.people.length : recap.people;
  const parts = [plural(recap.quantity, "asset")];
  if (types > 0) parts.push(plural(types, "type"));
  parts.push(`${people} PIC`);
  return parts.join(" · ");
}

/** The value stored in an "Assets recap" column, so the board can sort, filter and export it. */
export function recapColumnValue(recap: AssetsRecap): { type: "ASSETS_RECAP"; lines: number; quantity: number; types: number; people: number; nextDue: ISODate | null; overdue: number } {
  return { type: "ASSETS_RECAP", lines: recap.lines, quantity: recap.quantity, types: recap.types.length, people: recap.assigneeIds.length, nextDue: recap.nextDue, overdue: recap.overdue };
}
