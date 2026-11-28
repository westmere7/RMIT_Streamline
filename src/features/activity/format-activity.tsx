import * as React from "react";
import { moveEnds, type Activity, type User } from "@/domain";
import { Mention, type MentionLinks } from "@/features/workspace/mention-link";
import { formatShortDate } from "@/lib/dates/dates";
import { clipActivityValue } from "@/services/column-display";

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

/**
 * A value as the sentence quotes it.
 *
 * Clipped here as well as where the row was written, because the rows written
 * before it was clipped on the way in are still in the feed — and one of them
 * is a whole booking brief, quoted twice.
 */
function formatValue(columnType: string | undefined, value: string | null | undefined): string {
  if (!value) return "empty";
  if (columnType === "DATE" || columnType === "START_DATE") return formatShortDate(value) || value;
  return clipActivityValue(value) ?? "empty";
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
  // The task this entry is about: where a new name leads.
  const task = links?.board(activity.boardId, activity.itemId) ?? null;
  // A deliverable named in the entry opens the task's Assets tab; a column, the task on that field.
  const assets = links?.part(activity.boardId, activity.itemId, { tab: "assets" }) ?? task;
  const field = m.columnId ? (links?.part(activity.boardId, activity.itemId, { field: m.columnId }) ?? null) : null;
  // The other side of a link: the task itself when the entry kept its id, else its board by name.
  const linkedTask = m.linkedBoardId ? links?.board(m.linkedBoardId, m.linkedItemId) : null;
  const linkedBoard = (m.linkedBoardId ? links?.board(m.linkedBoardId) : null) ?? links?.boardNamed(m.linkedBoardName) ?? null;
  const quiet = "font-normal text-muted-foreground";

  switch (activity.eventType) {
    case "ITEM_CREATED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> created <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
          {m.groupName ? <> in <Mention href={links?.board(activity.boardId)} className={quiet}>{m.groupName}</Mention></> : null}
        </>
      );
    case "ITEM_RENAMED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> renamed <Mention>{m.from}</Mention> to <Mention href={task}>{m.to}</Mention>
          {synced}
        </>
      );
    case "ITEM_LINKED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> linked {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "this item"} with <Mention href={linkedTask}>{m.linkedItemName}</Mention>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on <Mention href={linkedBoard} className={quiet}>{m.linkedBoardName}</Mention></span> : null}
        </>
      );
    case "ITEM_UNLINKED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> unlinked {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "this item"} from <Mention href={linkedTask}>{m.linkedItemName}</Mention>
          {m.linkedBoardName ? <span className="text-muted-foreground"> on <Mention href={linkedBoard} className={quiet}>{m.linkedBoardName}</Mention></span> : null}
        </>
      );
    case "ITEM_MOVED": {
      const ends = moveEnds(m);
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> moved {includeItem && m.itemName ? <Mention href={links?.board(activity.boardId, activity.itemId)}>{m.itemName}</Mention> : "the item"}
          {ends.to ? (
            <>
              {" "}to <Mention href={m.toGroupName ? links?.board(activity.boardId) : links?.boardNamed(ends.to)}>{ends.to}</Mention>
            </>
          ) : null}
          {ends.from ? <span className="text-muted-foreground"> from {m.toGroupName ? ends.from : <Mention href={links?.boardNamed(ends.from)} className={quiet}>{ends.from}</Mention>}</span> : null}
        </>
      );
    }
    case "ITEM_ARCHIVED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> archived <Mention href={links?.archived(activity.boardId, activity.itemId)}>{m.itemName}</Mention>
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
            {added.length === 0 && removed.length === 0 && <> updated <Mention href={field}>{m.columnName}</Mention></>}
            {item}
          </>
        );
      }
      if (m.columnType === "CHECKBOX") {
        return (
          <>
            <Mention href={links?.person(activity.actorId)}>{actor}</Mention> {m.to === "Checked" ? "checked" : "unchecked"} <Mention href={field}>{m.columnName}</Mention>
            {item}
          </>
        );
      }
      // A document is not quotable in a sentence. A brief edited at the end
      // reads the same for the first eighty characters either side, so "from …
      // to …" prints two identical openings and says nothing about what
      // changed; the line says that it changed and leaves the rest to the task.
      if (isDocumentColumn(m.columnType)) {
        return (
          <>
            <Mention href={links?.person(activity.actorId)}>{actor}</Mention> {m.reverted ? "put back the booked" : m.from ? "edited" : "wrote"} <Mention href={field}>{m.columnName}</Mention>
            {item}
            {synced}
          </>
        );
      }
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> changed <Mention href={field}>{m.columnName}</Mention>
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
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> added {m.assetName ? <Mention href={assets}>{m.assetName}</Mention> : <Mention href={assets}>{`${m.count ?? 0} assets`}</Mention>} to the asset list
          {item}
        </>
      );
    case "ASSET_UPDATED":
      // Who is in charge is recorded as people put on and taken off, not as a from and a to.
      if (m.addedUserIds || m.removedUserIds) {
        const added = m.addedUserIds ?? [];
        const removed = m.removedUserIds ?? [];
        return (
          <>
            <Mention href={links?.person(activity.actorId)}>{actor}</Mention>
            {added.length > 0 && (
              <>
                {" "}put <People ids={added} users={users} links={links} /> in charge of <Mention href={assets}>{m.assetName}</Mention>
              </>
            )}
            {added.length > 0 && removed.length > 0 && " and"}
            {removed.length > 0 && (
              <>
                {" "}took <People ids={removed} users={users} links={links} /> off {added.length > 0 ? "it" : <Mention href={assets}>{m.assetName}</Mention>}
              </>
            )}
            {item}
          </>
        );
      }
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> set {m.assetField} on <Mention href={assets}>{m.assetName}</Mention>
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
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> removed <Mention href={assets}>{m.assetName}</Mention> from the asset list
          {item}
        </>
      );
    case "ASSET_COMPLETED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> ticked off <Mention href={assets}>{m.assetName}</Mention>
          {item}
        </>
      );
    case "ASSET_REOPENED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> reopened <Mention href={assets}>{m.assetName}</Mention>
          {item}
        </>
      );
    case "COMMENT_ADDED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> posted an update{item}
        </>
      );
    case "BOOKING_SENT_BACK":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> sent this back{m.requesterName ? <> to <Mention href={links?.personNamed(m.requesterName)}>{m.requesterName}</Mention></> : null} for more information{m.summary ? <>: “{m.summary}”</> : null}{item}
        </>
      );
    case "BOOKING_RESUBMITTED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> sent it again{m.summary ? <> · {m.summary}</> : null}
          {item}
        </>
      );
    case "BOOKING_SEND_BACK_CANCELLED":
      return (
        <>
          <Mention href={links?.person(activity.actorId)}>{actor}</Mention> recalled the send back{item}
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

/** Columns that hold a page rather than a value. */
function isDocumentColumn(columnType: string | undefined): boolean {
  return columnType === "RICH_TEXT" || columnType === "BRIEF" || columnType === "LONG_TEXT";
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
      if (isDocumentColumn(m.columnType)) return `${actor} ${m.reverted ? "put back the booked" : m.from ? "edited" : "wrote"} ${m.columnName}`;
      return `${actor} changed ${m.columnName}${m.from ? ` from ${formatValue(m.columnType, m.from)}` : ""} to ${formatValue(m.columnType, m.to)}`;
    case "ITEM_MOVED": {
      const to = moveEnds(m).to;
      return to ? `${actor} moved the item to ${to}` : `${actor} moved the item`;
    }
    case "ITEM_CREATED":
      return `${actor} created ${m.itemName}`;
    case "ITEM_LINKED":
      return `${actor} linked ${m.itemName} with ${m.linkedItemName}`;
    case "ITEM_UNLINKED":
      return `${actor} unlinked ${m.itemName} from ${m.linkedItemName}`;
    case "ASSET_ADDED":
      return m.assetName ? `${actor} added ${m.assetName} to the asset list` : `${actor} added ${m.count ?? 0} assets`;
    case "ASSET_UPDATED": {
      if (m.addedUserIds || m.removedUserIds) {
        const names = (ids: readonly string[] | undefined) => (ids ?? []).map((id) => users.find((u) => u.id === id)?.firstName ?? "someone").join(", ");
        const put = m.addedUserIds?.length ? `put ${names(m.addedUserIds)} in charge of ${m.assetName}` : "";
        const took = m.removedUserIds?.length ? `took ${names(m.removedUserIds)} off ${put ? "it" : m.assetName}` : "";
        return `${actor} ${[put, took].filter(Boolean).join(" and ")}`;
      }
      return `${actor} set ${m.assetField} on ${m.assetName} to ${m.to ?? "empty"}`;
    }
    case "ASSET_REMOVED":
      return `${actor} removed ${m.assetName} from the asset list`;
    case "ASSET_COMPLETED":
      return `${actor} ticked off ${m.assetName}`;
    case "ASSET_REOPENED":
      return `${actor} reopened ${m.assetName}`;
    case "COMMENT_ADDED":
      return `${actor} posted an update`;
    case "BOOKING_SENT_BACK":
      return `${actor} sent this back${m.requesterName ? ` to ${m.requesterName}` : ""} for more information${m.summary ? `: “${m.summary}”` : ""}`;
    case "BOOKING_RESUBMITTED":
      return `${actor} sent it again${m.summary ? ` · ${m.summary}` : ""}`;
    case "BOOKING_SEND_BACK_CANCELLED":
      return `${actor} recalled the send back`;
    default:
      return `${actor} ${activity.eventType.toLowerCase().replace(/_/g, " ")}`;
  }
}
