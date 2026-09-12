import type { EntityId } from "@/domain/common/types";

/**
 * Two items on different boards that are kept in sync (name, description, every
 * column both boards share, and the Updates thread). The pair is stored once with
 * the ids in sorted order so the same link cannot be created again from the other
 * side.
 */
export interface ItemLink {
  id: EntityId;
  workspaceId: EntityId;
  itemAId: EntityId;
  itemBId: EntityId;
  /**
   * Fields this link does not carry: LINK_FIELD_NAME, LINK_FIELD_DESCRIPTION,
   * LINK_FIELD_UPDATES or column ids from either board. Everything the boards
   * share syncs unless listed.
   */
  excluded: string[];
  /**
   * Column pairings made by hand, as pairs of column ids. The automatic rules
   * pair columns by name and type; this says what to do about the ones they
   * cannot place. A link is symmetric, so neither id in a pair is "the source":
   * each board reads the pair from its own side.
   */
  pairs: ColumnPair[];
  createdBy: EntityId;
  createdAt: string;
}

/** Two column ids the link should treat as the same field. */
export type ColumnPair = [EntityId, EntityId];

export interface ItemLinkInput {
  workspaceId: EntityId;
  itemIds: [EntityId, EntityId];
  createdBy: EntityId;
  excluded?: string[];
  pairs?: ColumnPair[];
}

/** Exclusion keys for the item-level fields (columns use their ids). */
export const LINK_FIELD_NAME = "name";
export const LINK_FIELD_DESCRIPTION = "description";
/** The booking code (ID#). Carried like every other field unless the link excludes it. */
export const LINK_FIELD_REFERENCE = "reference";
/**
 * The Updates thread. Linked items are the same work seen from two boards, so
 * they share one conversation: each comment stays on the item it was written on
 * and is shown on the others, rather than being copied around.
 */
export const LINK_FIELD_UPDATES = "updates";

/** Sorted pair so (a, b) and (b, a) map to the same stored link. */
export function normaliseLinkPair(a: EntityId, b: EntityId): [EntityId, EntityId] {
  return a < b ? [a, b] : [b, a];
}

/** The item on the far side of a link from `itemId`. */
export function otherEndOf(link: Pick<ItemLink, "itemAId" | "itemBId">, itemId: EntityId): EntityId {
  return link.itemAId === itemId ? link.itemBId : link.itemAId;
}
