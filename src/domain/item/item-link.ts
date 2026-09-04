import type { EntityId } from "@/domain/common/types";

/**
 * Two items on different boards that are kept in sync (name, description and every
 * column both boards share). The pair is stored once with the ids in sorted order so
 * the same link cannot be created again from the other side.
 */
export interface ItemLink {
  id: EntityId;
  workspaceId: EntityId;
  itemAId: EntityId;
  itemBId: EntityId;
  createdBy: EntityId;
  createdAt: string;
}

export interface ItemLinkInput {
  workspaceId: EntityId;
  itemIds: [EntityId, EntityId];
  createdBy: EntityId;
}

/** Sorted pair so (a, b) and (b, a) map to the same stored link. */
export function normaliseLinkPair(a: EntityId, b: EntityId): [EntityId, EntityId] {
  return a < b ? [a, b] : [b, a];
}

/** The item on the far side of a link from `itemId`. */
export function otherEndOf(link: Pick<ItemLink, "itemAId" | "itemBId">, itemId: EntityId): EntityId {
  return link.itemAId === itemId ? link.itemBId : link.itemAId;
}
