import * as React from "react";
import type { Activity, User } from "@/domain";
import { Mention, type MentionLinks } from "@/features/workspace/mention-link";
import { formatShortDate } from "@/lib/dates/dates";

function nameOf(users: readonly User[], id: string | null | undefined): string {
  if (!id) return "Someone";
  const user = users.find((u) => u.id === id);
  return user ? user.firstName : "Someone";
}

/** "Danh, Tuyet" — each of them a link to their page. */
function People({ ids, users, links }: { ids: readonly string[]; users: readonly User[]; links?: MentionLinks }) {
  return (
    <>
      {ids.map((id, index) => (
        <React.Fragment key={id}>
          {index > 0 && ", "}
          <Mention href={links?.person(id)}>{users.find((u) => u.id === id)?.firstName ?? "someone"}</Mention>
        </React.Fragment>
      ))}
    </>
  );
}

function formatValue(columnType: string | undefined, value: string | null | undefined): string {
  if (!value) return "empty";
  if (columnType === "DATE") return formatShortDate(value) || value;
  return value;
}

/**
 * Turns a raw activity event into a human sentence such as
 * "Danh changed Status from In Progress to Done".
 * `includeItem` appends "on <item>" for feeds that mix items.
 *
 * With `links` (see useMentionLinks) the people, boards and tasks named in the
 * sentence lead back to their pages; without it they are plain emphasis, which
 * is what a feed outside a workspace — or one naming something since deleted —
 * needs.
 */
export function describeActivity(activity: Activity, users: readonly User[], includeItem = false, links?: MentionLinks): React.ReactNode {
  const actor = nameOf(users, activity.actorId);
  const m = activity.metadata;
  const item = includeItem && m.itemName ? <> on <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention></> : null;
  const synced = m.syncedFrom ? <span className="text-muted-foreground"> · synced from {m.syncedFrom}</span> : null;

  switch (activity.eventType) {
    case "ITEM_CREATED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> created <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
          {m.groupName ? <> in {m.groupName}</> : null}
        </>
      );
    case "ITEM_RENAMED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> renamed <Mention>{m.from}</Mention> to <Mention>{m.to}</Mention>
          {synced}
        </>
      );
    case "ITEM_LINKED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> linked {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "this item"} with <Mention>{m.linkedItemName}</Mention>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on {m.linkedBoardName}</span> : null}
        </>
      );
    case "ITEM_UNLINKED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> unlinked {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "this item"} from <Mention>{m.linkedItemName}</Mention>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on {m.linkedBoardName}</span> : null}
        </>
      );
    case "ITEM_MOVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> moved {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "the item"} to <Mention>{m.toGroupName}</Mention>
          {m.fromGroupName ? <span className="text-muted-foreground"> from {m.fromGroupName}</span> : null}
        </>
      );
    case "ITEM_ARCHIVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> archived <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
        </>
      );
    case "ITEM_RESTORED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> restored <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
        </>
      );
    case "ITEM_DELETED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> deleted <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
        </>
      );
    case "ITEM_COLUMN_VALUE_UPDATED": {
      if (m.columnType === "PERSON") {
        const added = m.addedUserIds ?? [];
        const removed = m.removedUserIds ?? [];
        return (
          <>
            <Mention href={links?.person(activity.actorId)}>{actor}</Mention>
            {added.length > 0 && (
              <>
                {" "}assigned <People ids={added} users={users} links={links} />
              </>
            )}
            {added.length > 0 && removed.length > 0 && " and"}
            {removed.length > 0 && (
              <>
                {" "}removed <People ids={removed} users={users} links={links} />
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
            <Mention href={links?.person(activity.actorId)}>{actor}</Mention> {m.to === "Checked" ? "checked" : "unchecked"} <Mention>{m.columnName}</Mention>
            {item}
          </>
        );
      }
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> changed <Mention>{m.columnName}</Mention>
          {m.from ? (
            <>
              {" "}from <Mention>{formatValue(m.columnType, m.from)}</Mention>
            </>
          ) : null}{" "}
          to <Mention>{formatValue(m.columnType, m.to)}</Mention>
          {item}
          {synced}
        </>
      );
    }
    case "ASSET_ADDED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> added {m.assetName ? <Mention>{m.assetName}</Mention> : <Mention>{`${m.count ?? 0} assets`}</Mention>} to the asset list
          {item}
        </>
      );
    case "ASSET_UPDATED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> set {m.assetField} on <Mention>{m.assetName}</Mention>
          {m.from ? (
            <>
              {" "}from <Mention>{m.from}</Mention>
            </>
          ) : null}{" "}
          to <Mention>{m.to ?? "empty"}</Mention>
          {item}
        </>
      );
    case "ASSET_REMOVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> removed <Mention>{m.assetName}</Mention> from the asset list
          {item}
        </>
      );
    case "ASSET_COMPLETED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> ticked off <Mention>{m.assetName}</Mention>
          {item}
        </>
      );
    case "ASSET_REOPENED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> reopened <Mention>{m.assetName}</Mention>
          {item}
        </>
      );
    case "COMMENT_ADDED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> posted an update{item}
        </>
      );
    case "BOARD_CREATED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> created the board <Mention href={links?.board(activity.boardId)}>{m.boardName}</Mention>
        </>
      );
    case "BOARD_RENAMED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> renamed the board to <Mention>{m.to}</Mention>
        </>
      );
    case "BOARD_ARCHIVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> archived the board <Mention href={links?.board(activity.boardId)}>{m.boardName}</Mention>
        </>
      );
    case "GROUP_CREATED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> added the group <Mention>{m.groupName}</Mention>
        </>
      );
    case "GROUP_RENAMED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> renamed a group to <Mention>{m.groupName}</Mention>
        </>
      );
    case "GROUP_DELETED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> deleted the group <Mention>{m.groupName}</Mention>
        </>
      );
    case "MEMBER_ADDED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> added <Mention>{m.memberName}</Mention> to the board
        </>
      );
    case "MEMBER_REMOVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> removed <Mention>{m.memberName}</Mention> from the board
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
    case "ASSET_ADDED":
      return m.assetName ? `${actor} added ${m.assetName} to the asset list` : `${actor} added ${m.count ?? 0} assets`;
    case "ASSET_UPDATED":
      return `${actor} set ${m.assetField} on ${m.assetName} to ${m.to ?? "empty"}`;
    case "ASSET_REMOVED":
      return `${actor} removed ${m.assetName} from the asset list`;
    case "ASSET_COMPLETED":
      return `${actor} ticked off ${m.assetName}`;
    case "ASSET_REOPENED":
      return `${actor} reopened ${m.assetName}`;
    case "COMMENT_ADDED":
      return `${actor} posted an update`;
    default:
      return `${actor} ${activity.eventType.toLowerCase().replace(/_/g, " ")}`;
  }
}
