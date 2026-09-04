import type { EntityId } from "@/domain/common/types";

export type NotificationType =
  | "MENTION"
  | "ASSIGNED"
  | "DUE_DATE_CHANGED"
  | "STATUS_CHANGED"
  | "COMMENT"
  | "BOARD_INVITE";

export type NotificationEntityType = "ITEM" | "BOARD" | "COMMENT";

export interface Notification {
  id: EntityId;
  userId: EntityId;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: NotificationEntityType;
  entityId: EntityId;
  /** Board id for building deep links to items. */
  boardId: EntityId | null;
  actorId: EntityId | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationInput = Omit<Notification, "id" | "createdAt" | "readAt">;
