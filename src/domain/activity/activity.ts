import type { EntityId } from "@/domain/common/types";

export const ACTIVITY_EVENT_TYPES = [
  "ITEM_CREATED",
  "ITEM_RENAMED",
  "ITEM_MOVED",
  "ITEM_ARCHIVED",
  "ITEM_RESTORED",
  "ITEM_DELETED",
  "ITEM_COLUMN_VALUE_UPDATED",
  "COMMENT_ADDED",
  "BOARD_CREATED",
  "BOARD_RENAMED",
  "BOARD_ARCHIVED",
  "GROUP_CREATED",
  "GROUP_RENAMED",
  "GROUP_DELETED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/**
 * Metadata is stored as JSON. Keys are human-facing so the feed can be rendered
 * without joining other tables (e.g. after an item is deleted).
 */
export interface ActivityMetadata {
  itemName?: string;
  boardName?: string;
  groupName?: string;
  fromGroupName?: string;
  toGroupName?: string;
  columnName?: string;
  columnType?: string;
  /** Display strings for before/after values. */
  from?: string | null;
  to?: string | null;
  /** For PERSON column changes. */
  addedUserIds?: EntityId[];
  removedUserIds?: EntityId[];
  memberName?: string;
  count?: number;
}

export interface Activity {
  id: EntityId;
  workspaceId: EntityId;
  boardId: EntityId | null;
  itemId: EntityId | null;
  actorId: EntityId;
  eventType: ActivityEventType;
  metadata: ActivityMetadata;
  createdAt: string;
}

export type ActivityInput = Omit<Activity, "id" | "createdAt">;
