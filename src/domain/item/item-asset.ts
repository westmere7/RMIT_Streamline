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
  /**
   * Where to look at this deliverable: a preview to review, the final artwork,
   * a folder, a video… as many as it needs, in the order they were put in.
   *
   * Internal, like `notes`. None of them reaches a stakeholder portal or a
   * public dashboard — a review link is working material, and a final file is
   * the team's to hand over deliberately rather than by being on a page.
   */
  links: AssetLink[];
  /**
   * The block this line belongs to, or null for a line on its own. A block is
   * several lines under one name and one person in charge — one designer's
   * poster, tiles and banner, each due on its own day. Every line in it is still
   * a line, counted like any other; the block is only how the list shows them.
   */
  blockId: EntityId | null;
  /** The block's name, kept on each of its lines. Null outside a block. */
  blockName: string | null;
  /** Links for the whole block (a shared folder, the brief), kept on each of its lines. Empty outside a block. */
  blockLinks: AssetLink[];
  position: number;
  createdBy: EntityId;
}

export type ItemAssetInput = Pick<ItemAsset, "itemId" | "boardId" | "name" | "createdBy"> &
  Partial<Pick<ItemAsset, "assetType" | "quantity" | "assigneeIds" | "dueDate" | "completedAt" | "notes" | "links" | "blockId" | "blockName" | "blockLinks" | "position">>;

export type ItemAssetPatch = Partial<Pick<ItemAsset, "name" | "assetType" | "quantity" | "assigneeIds" | "dueDate" | "completedAt" | "notes" | "links" | "blockId" | "blockName" | "blockLinks" | "position">>;

/** One link on a deliverable. */
export interface AssetLink {
  id: string;
  /** "Preview", "Final artwork", "Drive folder"… */
  label: string;
  url: string;
  icon: AssetLinkIcon;
}

/** The icons a link can wear. Keys rather than component names, so the stored value outlives a rename in the icon set. */
export const ASSET_LINK_ICONS = [
  "eye",
  "file-check",
  "link",
  "folder",
  "image",
  "video",
  "file-text",
  "pen",
  "message",
  "cloud",
  "camera",
  "film",
  "mic",
  "music",
  "palette",
  "type",
  "presentation",
  "sheet",
  "book",
  "newspaper",
  "archive",
  "package",
  "globe",
  "monitor",
  "smartphone",
  "printer",
  "mail",
  "megaphone",
  "download",
  "share",
  "drive",
  "calendar",
  "code",
  "lock",
  "star",
  "flag",
] as const;
export type AssetLinkIcon = (typeof ASSET_LINK_ICONS)[number];

/** The links most deliverables get, offered first when one is added. */
export const ASSET_LINK_PRESETS: ReadonlyArray<{ label: string; icon: AssetLinkIcon }> = [
  { label: "Preview", icon: "eye" },
  { label: "Final artwork", icon: "file-check" },
];

export const ASSET_LINK_LIMIT = 20;
export const ASSET_LINK_URL_MAX = 2000;
export const ASSET_LINK_LABEL_MAX = 60;

/**
 * Links as stored, made safe to read: anything that is not an object with a
 * url is dropped, a missing label or an unknown icon gets a plain one. The
 * column is jsonb, and a row written by hand or by an older build should not
 * break the list.
 */
export function normalizeAssetLinks(value: unknown): AssetLink[] {
  if (!Array.isArray(value)) return [];
  const links: AssetLink[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!url) continue;
    const icon = ASSET_LINK_ICONS.includes(entry.icon as AssetLinkIcon) ? (entry.icon as AssetLinkIcon) : "link";
    const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, ASSET_LINK_LABEL_MAX) : "Link";
    links.push({ id: typeof entry.id === "string" && entry.id ? entry.id : `link-${index}`, label, url: url.slice(0, ASSET_LINK_URL_MAX), icon });
  }
  return links.slice(0, ASSET_LINK_LIMIT);
}

/**
 * Where a link may be opened, or null where it may not. A bare address gets
 * https:// in front; any scheme other than http, https or mailto — javascript:,
 * data:, a drive letter — is never made into an anchor. It can still be copied.
 */
export function assetLinkHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith("\\") || trimmed.startsWith("/")) return null;
  return `https://${trimmed}`;
}

/** What a line written before links were a list carried, as the list. */
export function legacyAssetLinks(previewUrl: string | null | undefined, artworkUrl: string | null | undefined): AssetLink[] {
  const links: AssetLink[] = [];
  if (previewUrl?.trim()) links.push({ id: "preview", label: "Preview", url: previewUrl.trim(), icon: "eye" });
  if (artworkUrl?.trim()) links.push({ id: "artwork", label: "Final artwork", url: artworkUrl.trim(), icon: "file-check" });
  return links;
}

/**
 * A list read as it is shown: lines on their own and blocks, in the order of
 * the first line of each. A block sits where its first line sits, and its lines
 * keep their own order inside it.
 */
export type AssetListEntry<T> = { kind: "line"; line: T } | { kind: "block"; blockId: string; name: string; lines: T[] };

export function groupAssetBlocks<T extends { blockId: string | null; blockName: string | null }>(lines: readonly T[]): AssetListEntry<T>[] {
  const entries: AssetListEntry<T>[] = [];
  const blocks = new Map<string, Extract<AssetListEntry<T>, { kind: "block" }>>();
  for (const line of lines) {
    if (!line.blockId) {
      entries.push({ kind: "line", line });
      continue;
    }
    const block = blocks.get(line.blockId);
    if (block) {
      block.lines.push(line);
      continue;
    }
    const created = { kind: "block" as const, blockId: line.blockId, name: line.blockName?.trim() || "Block", lines: [line] };
    blocks.set(line.blockId, created);
    entries.push(created);
  }
  return entries;
}

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
