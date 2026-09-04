import * as React from "react";
import type { Activity, User } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function nameOf(users: readonly User[], id: string | null | undefined): string {
  if (!id) return "Someone";
  const user = users.find((u) => u.id === id);
  return user ? user.firstName : "Someone";
}

function formatValue(columnType: string | undefined, value: string | null | undefined): string {
  if (!value) return "empty";
  if (columnType === "DATE") return formatShortDate(value) || value;
  return value;
}

/**
 * Turns a raw activity event into a human sentence such as
 * "Danh changed Status from Working On It to Done".
 * `includeItem` appends "on <item>" for feeds that mix items.
 */
export function describeActivity(activity: Activity, users: readonly User[], includeItem = false): React.ReactNode {
  const actor = nameOf(users, activity.actorId);
  const m = activity.metadata;
  const item = includeItem && m.itemName ? <> on <Strong>{m.itemName}</Strong></> : null;
  const synced = m.syncedFrom ? <span className="text-muted-foreground"> · synced from {m.syncedFrom}</span> : null;

  switch (activity.eventType) {
    case "ITEM_CREATED":
      return (
        <>
          <Strong>{actor}</Strong> created <Strong>{m.itemName}</Strong>
          {m.groupName ? <> in {m.groupName}</> : null}
        </>
      );
    case "ITEM_RENAMED":
      return (
        <>
          <Strong>{actor}</Strong> renamed <Strong>{m.from}</Strong> to <Strong>{m.to}</Strong>
          {synced}
        </>
      );
    case "ITEM_LINKED":
      return (
        <>
          <Strong>{actor}</Strong> linked {includeItem && m.itemName ? <Strong>{m.itemName}</Strong> : "this item"} with <Strong>{m.linkedItemName}</Strong>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on {m.linkedBoardName}</span> : null}
        </>
      );
    case "ITEM_UNLINKED":
      return (
        <>
          <Strong>{actor}</Strong> unlinked {includeItem && m.itemName ? <Strong>{m.itemName}</Strong> : "this item"} from <Strong>{m.linkedItemName}</Strong>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on {m.linkedBoardName}</span> : null}
        </>
      );
    case "ITEM_MOVED":
      return (
        <>
          <Strong>{actor}</Strong> moved {includeItem && m.itemName ? <Strong>{m.itemName}</Strong> : "the item"} to <Strong>{m.toGroupName}</Strong>
          {m.fromGroupName ? <span className="text-muted-foreground"> from {m.fromGroupName}</span> : null}
        </>
      );
    case "ITEM_ARCHIVED":
      return (
        <>
          <Strong>{actor}</Strong> archived <Strong>{m.itemName}</Strong>
        </>
      );
    case "ITEM_RESTORED":
      return (
        <>
          <Strong>{actor}</Strong> restored <Strong>{m.itemName}</Strong>
        </>
      );
    case "ITEM_DELETED":
      return (
        <>
          <Strong>{actor}</Strong> deleted <Strong>{m.itemName}</Strong>
        </>
      );
    case "ITEM_COLUMN_VALUE_UPDATED": {
      if (m.columnType === "PERSON") {
        const added = (m.addedUserIds ?? []).map((id) => users.find((u) => u.id === id)?.firstName ?? "someone");
        const removed = (m.removedUserIds ?? []).map((id) => users.find((u) => u.id === id)?.firstName ?? "someone");
        return (
          <>
            <Strong>{actor}</Strong>
            {added.length > 0 && (
              <>
                {" "}assigned <Strong>{added.join(", ")}</Strong>
              </>
            )}
            {added.length > 0 && removed.length > 0 && " and"}
            {removed.length > 0 && (
              <>
                {" "}removed <Strong>{removed.join(", ")}</Strong>
              </>
            )}
            {added.length === 0 && removed.length === 0 && <> updated {m.columnName}</>}
            {item}
          </>
        );
      }
      if (m.columnType === "CHECKBOX") {
        return (
          <>
            <Strong>{actor}</Strong> {m.to === "Checked" ? "checked" : "unchecked"} <Strong>{m.columnName}</Strong>
            {item}
          </>
        );
      }
      return (
        <>
          <Strong>{actor}</Strong> changed <Strong>{m.columnName}</Strong>
          {m.from ? (
            <>
              {" "}from <Strong>{formatValue(m.columnType, m.from)}</Strong>
            </>
          ) : null}{" "}
          to <Strong>{formatValue(m.columnType, m.to)}</Strong>
          {item}
          {synced}
        </>
      );
    }
    case "COMMENT_ADDED":
      return (
        <>
          <Strong>{actor}</Strong> posted an update{item}
        </>
      );
    case "BOARD_CREATED":
      return (
        <>
          <Strong>{actor}</Strong> created the board <Strong>{m.boardName}</Strong>
        </>
      );
    case "BOARD_RENAMED":
      return (
        <>
          <Strong>{actor}</Strong> renamed the board to <Strong>{m.to}</Strong>
        </>
      );
    case "BOARD_ARCHIVED":
      return (
        <>
          <Strong>{actor}</Strong> archived the board <Strong>{m.boardName}</Strong>
        </>
      );
    case "GROUP_CREATED":
      return (
        <>
          <Strong>{actor}</Strong> added the group <Strong>{m.groupName}</Strong>
        </>
      );
    case "GROUP_RENAMED":
      return (
        <>
          <Strong>{actor}</Strong> renamed a group to <Strong>{m.groupName}</Strong>
        </>
      );
    case "GROUP_DELETED":
      return (
        <>
          <Strong>{actor}</Strong> deleted the group <Strong>{m.groupName}</Strong>
        </>
      );
    case "MEMBER_ADDED":
      return (
        <>
          <Strong>{actor}</Strong> added <Strong>{m.memberName}</Strong> to the board
        </>
      );
    case "MEMBER_REMOVED":
      return (
        <>
          <Strong>{actor}</Strong> removed <Strong>{m.memberName}</Strong> from the board
        </>
      );
  }
}

/** Plain-text version for tests and tooltips. */
export function describeActivityText(activity: Activity, users: readonly User[]): string {
  const actor = nameOf(users, activity.actorId);
  const m = activity.metadata;
  switch (activity.eventType) {
    case "ITEM_COLUMN_VALUE_UPDATED":
      if (m.columnType === "PERSON") {
        const added = (m.addedUserIds ?? []).map((id) => users.find((u) => u.id === id)?.firstName ?? "someone");
        return added.length ? `${actor} assigned ${added.join(", ")}` : `${actor} updated ${m.columnName}`;
      }
      return `${actor} changed ${m.columnName}${m.from ? ` from ${formatValue(m.columnType, m.from)}` : ""} to ${formatValue(m.columnType, m.to)}`;
    case "ITEM_MOVED":
      return `${actor} moved the item to ${m.toGroupName}`;
    case "ITEM_CREATED":
      return `${actor} created ${m.itemName}`;
    case "ITEM_LINKED":
      return `${actor} linked ${m.itemName} with ${m.linkedItemName}`;
    case "ITEM_UNLINKED":
      return `${actor} unlinked ${m.itemName} from ${m.linkedItemName}`;
    case "COMMENT_ADDED":
      return `${actor} posted an update`;
    default:
      return `${actor} ${activity.eventType.toLowerCase().replace(/_/g, " ")}`;
  }
}
