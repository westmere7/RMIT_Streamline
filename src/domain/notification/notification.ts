import type { EntityId } from "@/domain/common/types";

export type NotificationType =
  | "MENTION"
  | "ASSIGNED"
  | "DUE_DATE_CHANGED"
  | "STATUS_CHANGED"
  | "COMMENT"
  | "BOARD_INVITE"
  | "ITEM_LINKED";

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "MENTION",
  "ASSIGNED",
  "COMMENT",
  "BOARD_INVITE",
  "STATUS_CHANGED",
  "DUE_DATE_CHANGED",
  "ITEM_LINKED",
];

export type NotificationEntityType = "ITEM" | "BOARD" | "COMMENT";

/**
 * How something reaches the inbox.
 *
 * `NOTIFICATION` is the loud one: a red badge, and an operating-system
 * notification when the browser has been given permission. `UPDATE` is the
 * quiet one: it still lands in the inbox, with a grey badge, but it never
 * interrupts. `OFF` never arrives at all — nothing is written.
 */
export type NotificationDelivery = "NOTIFICATION" | "UPDATE" | "OFF";

/** The two ways something can actually be stored; `OFF` means it was not. */
export type StoredDelivery = Exclude<NotificationDelivery, "OFF">;

export interface Notification {
  id: EntityId;
  userId: EntityId;
  type: NotificationType;
  /** Decided from the recipient's preferences when the notification is written. */
  delivery: StoredDelivery;
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

/**
 * What a service asks for. The delivery is not part of it: that is the
 * recipient's decision, applied by NotificationService.
 */
export type NotificationInput = Omit<Notification, "id" | "createdAt" | "readAt" | "delivery">;

/** One person's choices about what interrupts them. */
export interface NotificationPreferences {
  userId: EntityId;
  /** How each kind of event should arrive. */
  types: Record<NotificationType, NotificationDelivery>;
  /** Boards the person has unsubscribed from: nothing from them arrives. */
  mutedBoardIds: EntityId[];
  /** Whether to raise an operating-system notification for the loud ones. */
  browserEnabled: boolean;
  updatedAt: string;
}

export type NotificationPreferencesInput = Partial<Omit<NotificationPreferences, "userId" | "updatedAt">>;

/**
 * Out of the box: the things that are *about you* interrupt, and the things
 * that merely happened on your work are collected quietly.
 */
export const DEFAULT_TYPE_DELIVERY: Record<NotificationType, NotificationDelivery> = {
  MENTION: "NOTIFICATION",
  ASSIGNED: "NOTIFICATION",
  COMMENT: "NOTIFICATION",
  BOARD_INVITE: "NOTIFICATION",
  STATUS_CHANGED: "UPDATE",
  DUE_DATE_CHANGED: "UPDATE",
  ITEM_LINKED: "UPDATE",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  MENTION: "Mentions",
  ASSIGNED: "Assigned to me",
  COMMENT: "Comments on my items",
  BOARD_INVITE: "Board invitations",
  STATUS_CHANGED: "Status changes",
  DUE_DATE_CHANGED: "Due date changes",
  ITEM_LINKED: "Linked items",
};

export const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  MENTION: "Someone writes your name in an update.",
  ASSIGNED: "Someone puts you on an item.",
  COMMENT: "Someone posts an update on an item you own.",
  BOARD_INVITE: "Someone adds you to a board.",
  STATUS_CHANGED: "The status of an item you own changes.",
  DUE_DATE_CHANGED: "A date on an item you own moves.",
  ITEM_LINKED: "A change reaches your item through a link.",
};

export function defaultNotificationPreferences(userId: EntityId): NotificationPreferences {
  return {
    userId,
    types: { ...DEFAULT_TYPE_DELIVERY },
    mutedBoardIds: [],
    browserEnabled: false,
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * How this event should reach this person: their choice for the type, unless
 * they have unsubscribed from the board it came from, which silences everything.
 */
export function deliveryFor(
  preferences: NotificationPreferences | null | undefined,
  type: NotificationType,
  boardId: EntityId | null,
): NotificationDelivery {
  const chosen = preferences?.types?.[type] ?? DEFAULT_TYPE_DELIVERY[type];
  if (boardId && preferences?.mutedBoardIds?.includes(boardId)) return "OFF";
  return chosen;
}

/** True when this person has unsubscribed from the board. */
export function isBoardMuted(preferences: NotificationPreferences | null | undefined, boardId: EntityId): boolean {
  return !!preferences?.mutedBoardIds?.includes(boardId);
}

/** Unread counts, split the way the badges show them. */
export interface UnreadCounts {
  notifications: number;
  updates: number;
}

export function countUnread(notifications: readonly Notification[]): UnreadCounts {
  let notificationCount = 0;
  let updateCount = 0;
  for (const n of notifications) {
    if (n.readAt !== null) continue;
    if (n.delivery === "UPDATE") updateCount += 1;
    else notificationCount += 1;
  }
  return { notifications: notificationCount, updates: updateCount };
}
