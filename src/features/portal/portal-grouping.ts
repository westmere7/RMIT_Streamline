import type { BoardGroup, Item, PortalGrouping, PublicBoardPayload } from "@/domain";
import { slugify } from "@/lib/slug";

/**
 * Re-dividing the portal's board by status, in the browser.
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
export function groupPortalBoardByStatus<T extends PublicBoardPayload>(payload: T, order: readonly string[] = []): T {
  const status = payload.columns.find((column) => column.type === "STATUS");
  if (!status || status.settings.kind !== "status") return payload;

  const boardId = payload.board.id;
  const labels = orderStatusLabels(status.settings.labels, order);
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

/**
 * The status labels in the visitor's order.
 *
 * The order is a list of names — names are what survive the reconciliation
 * across boards, and what the visitor dragged. Names on the list come first in
 * that order; anything not on it keeps its place after them, so a label that
 * appears later (a new status on some board) is not lost.
 */
export function orderStatusLabels<L extends { name: string }>(labels: readonly L[], order: readonly string[]): L[] {
  if (order.length === 0) return [...labels];
  const rank = new Map(order.map((name, i) => [name.toLowerCase(), i]));
  const placed = labels.filter((l) => rank.has(l.name.toLowerCase())).sort((a, b) => rank.get(a.name.toLowerCase())! - rank.get(b.name.toLowerCase())!);
  const rest = labels.filter((l) => !rank.has(l.name.toLowerCase()));
  return [...placed, ...rest];
}

/** The heading for requests whose board has no status to report. */
const NO_STATUS = "No status";

/** The heading for requests nobody has said a stakeholder for. */
const NO_STAKEHOLDER = "No stakeholder";

/**
 * Re-dividing the board by the stakeholder each request is for.
 *
 * Read off the "For" column the projection writes, for the same reason the
 * status arrangement is read off the STATUS column: the payload already holds
 * the answer, reconciled, so there is no second request and no flash of a
 * loading board between two arrangements of the same rows.
 *
 * With one stakeholder selected the projection leaves that column out
 * altogether — every row would carry the same word — and the payload comes back
 * exactly as it arrived.
 */
export function groupPortalBoardByStakeholder<T extends PublicBoardPayload>(payload: T): T {
  const column = payload.columns.find((c) => c.type === "TAGS" && c.name === "For");
  if (!column) return payload;

  const boardId = payload.board.id;
  const nameByItem = new Map<string, string | null>();
  for (const value of payload.values) {
    if (value.columnId !== column.id) continue;
    nameByItem.set(value.itemId, value.value.type === "TAGS" ? (value.value.tags[0] ?? null) : null);
  }

  const parents = payload.items.filter((item) => item.parentItemId === null);
  const nameOf = (id: string) => nameByItem.get(id) ?? null;
  const used = [...new Set(parents.map((item) => nameOf(item.id)))];
  const named = used.filter((name): name is string => name !== null).sort((a, b) => a.localeCompare(b));
  const colours = new Map(
    (column.settings.kind === "tags" ? (column.settings.options ?? []) : []).map((option) => [option.name, option.color]),
  );

  const groups: BoardGroup[] = [
    ...named.map((name) => ({ id: `${boardId}:k-${slugify(name) || name}`, name, color: colours.get(name) ?? payload.board.color })),
    ...(used.includes(null) ? [{ id: `${boardId}:k-none`, name: NO_STAKEHOLDER, color: payload.board.color }] : []),
  ].map((group, position) => ({ ...group, boardId, position, collapsed: false, createdAt: payload.board.createdAt }));

  const groupIdByName = new Map<string | null, string>([
    ...named.map((name, i) => [name, groups[i]!.id] as const),
    ...(used.includes(null) ? ([[null, groups[groups.length - 1]!.id]] as const) : []),
  ]);

  // A subitem belongs with its request, wherever that request has gone.
  const groupIdByParent = new Map(parents.map((item) => [item.id, groupIdByName.get(nameOf(item.id))!]));
  const items = payload.items.map((item) => {
    const groupId = groupIdByParent.get(item.parentItemId ?? item.id);
    return groupId && groupId !== item.groupId ? { ...item, groupId } : item;
  });

  return { ...payload, groups, items };
}

/** Applies a visitor's choice. "board" is the payload exactly as it was built. */
export function applyPortalGrouping<T extends PublicBoardPayload>(payload: T, grouping: PortalGrouping, statusOrder: readonly string[] = []): T {
  if (grouping === "status") return groupPortalBoardByStatus(payload, statusOrder);
  if (grouping === "stakeholder") return groupPortalBoardByStakeholder(payload);
  return payload;
}
