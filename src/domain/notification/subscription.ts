import type { Activity } from "@/domain/activity/activity";
import type { EntityId } from "@/domain/common/types";

/**
 * Following a board or a task.
 *
 * Anyone in the workspace can follow work they can see, whether or not they
 * are on it: a manager keeping an eye on a board, a stakeholder waiting on one
 * task. Each follow says which kinds of change should reach them, and every
 * change is read off the activity feed, so whatever writes to the feed — a
 * person, a link, an automation — reaches followers the same way.
 */
export const SUBSCRIPTION_EVENTS = ["status", "fields", "updates", "assets", "tasks"] as const;
export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

export const SUBSCRIPTION_EVENT_LABELS: Record<SubscriptionEvent, string> = {
  status: "Status changes",
  fields: "Other changes",
  updates: "New updates",
  assets: "Assets",
  tasks: "Tasks added, moved or archived",
};

export const SUBSCRIPTION_EVENT_HINTS: Record<SubscriptionEvent, string> = {
  status: "A task's status moves.",
  fields: "A name, date, person or any other column changes.",
  updates: "Someone posts an update.",
  assets: "Asset lines are added, changed or ticked off.",
  tasks: "A task arrives, moves group or is archived.",
};

/** What a new follow starts with: the things most people want to hear about. */
export const DEFAULT_BOARD_EVENTS: SubscriptionEvent[] = ["status", "updates", "tasks"];
export const DEFAULT_ITEM_EVENTS: SubscriptionEvent[] = ["status", "fields", "updates", "assets", "tasks"];

export interface Subscription {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  /** The board followed, or the task's board when a task is followed. */
  boardId: EntityId;
  /** The task followed; null when it is the whole board. */
  itemId: EntityId | null;
  events: SubscriptionEvent[];
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionInput = Pick<Subscription, "workspaceId" | "userId" | "boardId" | "itemId" | "events">;

/** What is followed: a board, or one task on it. */
export interface SubscriptionTarget {
  boardId: EntityId;
  itemId: EntityId | null;
}

/** Which kind of change an activity entry is, for followers; null when followers are not told about it. */
export function subscriptionEventFor(activity: Pick<Activity, "eventType" | "metadata">): SubscriptionEvent | null {
  switch (activity.eventType) {
    case "ITEM_COLUMN_VALUE_UPDATED":
      return activity.metadata.columnType === "STATUS" ? "status" : "fields";
    case "ITEM_RENAMED":
      return "fields";
    case "COMMENT_ADDED":
      return "updates";
    case "ASSET_ADDED":
    case "ASSET_UPDATED":
    case "ASSET_REMOVED":
    case "ASSET_COMPLETED":
    case "ASSET_REOPENED":
      return "assets";
    case "ITEM_CREATED":
    case "ITEM_MOVED":
    case "ITEM_ARCHIVED":
    case "ITEM_RESTORED":
    case "ITEM_DELETED":
      return "tasks";
    default:
      return null;
  }
}

/** How a change reads in the follower's inbox: a title and, where there is one, a line under it. */
export function subscriptionMessage(activity: Pick<Activity, "eventType" | "metadata">, actorName: string): { title: string; body: string | null } {
  const m = activity.metadata;
  const task = m.itemName ? `"${m.itemName}"` : "a task";
  switch (activity.eventType) {
    case "ITEM_COLUMN_VALUE_UPDATED":
      return { title: `${actorName} changed ${m.columnName ?? "a field"} on ${task}`, body: `${m.from || "Empty"} → ${m.to || "Empty"}` };
    case "ITEM_RENAMED":
      return { title: `${actorName} renamed ${m.from ? `"${m.from}"` : "a task"}`, body: m.to ?? null };
    case "COMMENT_ADDED":
      return { title: `${actorName} posted an update on ${task}`, body: null };
    case "ASSET_ADDED":
      return { title: `${actorName} added ${m.assetName ? `"${m.assetName}"` : m.count ? `${m.count} assets` : "an asset"} to ${task}`, body: null };
    case "ASSET_UPDATED":
      return { title: `${actorName} changed ${m.assetField ?? "an asset"} of "${m.assetName ?? "an asset"}" on ${task}`, body: m.from !== undefined || m.to !== undefined ? `${m.from || "Empty"} → ${m.to || "Empty"}` : null };
    case "ASSET_REMOVED":
      return { title: `${actorName} removed "${m.assetName ?? "an asset"}" from ${task}`, body: null };
    case "ASSET_COMPLETED":
      return { title: `${actorName} ticked off "${m.assetName ?? "an asset"}" on ${task}`, body: null };
    case "ASSET_REOPENED":
      return { title: `${actorName} reopened "${m.assetName ?? "an asset"}" on ${task}`, body: null };
    case "ITEM_CREATED":
      return { title: `${actorName} added ${task}${m.boardName ? ` to ${m.boardName}` : ""}`, body: m.groupName ?? null };
    case "ITEM_MOVED":
      return { title: `${actorName} moved ${task}${m.toGroupName ? ` to ${m.toGroupName}` : ""}`, body: m.fromGroupName ? `From ${m.fromGroupName}` : null };
    case "ITEM_ARCHIVED":
      return { title: `${actorName} archived ${task}`, body: null };
    case "ITEM_RESTORED":
      return { title: `${actorName} restored ${task}`, body: null };
    case "ITEM_DELETED":
      return { title: `${actorName} deleted ${task}`, body: null };
    default:
      return { title: `${actorName} changed ${task}`, body: null };
  }
}
