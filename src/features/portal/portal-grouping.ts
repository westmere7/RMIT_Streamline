import type { BoardGroup, Item, PortalGrouping, PublicBoardPayload } from "@/domain";
import { slugify } from "@/lib/slug";

/**
 * Re-dividing a department's board by status, in the browser.
 *
 * Grouping is a view setting, like which view the link opens on: the visitor
 * chooses it, it lives in the URL so a link they pass on opens the same way,
 * and nothing about it is stored against the portal.
 *
 * It is done here rather than on the server because the payload already holds
 * everything the arrangement needs. `buildPortalBoard` reconciles the statuses
 * of every board a department's work is spread across into one set of labels
 * and puts them on the STATUS column, so the groups can be read straight off
 * that column — no second request, no flash of a loading board between two
 * arrangements of the same rows, and one canonical payload on the server.
 *
 * Reconciled matters: two boards that both call something "In Progress" share a
 * label here, so they make one group rather than two that happen to agree. The
 * label order is the one the column already offers — pending, working, stuck,
 * then done — which is the order work moves in, so the groups read top to
 * bottom the way the board does.
 *
 * Nothing is added, removed or renamed: the same items, values and columns come
 * out, with different `groupId`s. A request whose board reports no status at
 * all gathers under one heading rather than falling off the board, and a
 * payload with no STATUS column is returned exactly as it arrived.
 */
export function groupPortalBoardByStatus<T extends PublicBoardPayload>(payload: T): T {
  const status = payload.columns.find((column) => column.type === "STATUS");
  if (!status || status.settings.kind !== "status") return payload;

  const boardId = payload.board.id;
  const labels = status.settings.labels;
  const labelById = new Map(labels.map((label) => [label.id, label]));

  // Which label each request is showing, by the value on the status column.
  const labelIdByItem = new Map<string, string | null>();
  for (const value of payload.values) {
    if (value.columnId !== status.id) continue;
    labelIdByItem.set(value.itemId, value.value.type === "STATUS" ? value.value.labelId : null);
  }

  const labelOf = (item: Item) => {
    const id = labelIdByItem.get(item.id) ?? null;
    return id !== null && labelById.has(id) ? id : null;
  };

  // Only the labels actually in use, so the board does not sprout empty groups
  // for statuses no request of this department is in.
  const parents = payload.items.filter((item) => item.parentItemId === null);
  const used = new Set(parents.map(labelOf));
  const ordered = labels.filter((label) => used.has(label.id));
  const needsNoStatus = used.has(null);

  const groups: BoardGroup[] = [
    ...ordered.map((label) => ({ id: `${boardId}:s-${slugify(label.name) || label.id}`, name: label.name, color: label.color })),
    ...(needsNoStatus ? [{ id: `${boardId}:s-none`, name: NO_STATUS, color: payload.board.color }] : []),
  ].map((group, position) => ({ ...group, boardId, position, collapsed: false, createdAt: payload.board.createdAt }));

  const groupIdByLabel = new Map<string | null, string>([
    ...ordered.map((label, i) => [label.id, groups[i]!.id] as const),
    ...(needsNoStatus ? ([[null, groups[groups.length - 1]!.id]] as const) : []),
  ]);

  // A subitem belongs with its request, wherever that request has gone.
  const groupIdByParent = new Map(parents.map((item) => [item.id, groupIdByLabel.get(labelOf(item))!]));
  const items = payload.items.map((item) => {
    const groupId = groupIdByParent.get(item.parentItemId ?? item.id);
    return groupId && groupId !== item.groupId ? { ...item, groupId } : item;
  });

  return { ...payload, groups, items };
}

/** The heading for requests whose board has no status to report. */
const NO_STATUS = "No status";

/** Applies a visitor's choice. "board" is the payload exactly as it was built. */
export function applyPortalGrouping<T extends PublicBoardPayload>(payload: T, grouping: PortalGrouping): T {
  return grouping === "status" ? groupPortalBoardByStatus(payload) : payload;
}
