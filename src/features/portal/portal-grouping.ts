import type { BoardColumn, BoardGroup, Item, ItemColumnValue, PortalGrouping, PortalTeamRef, PublicBoardPayload } from "@/domain";
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
const NO_STAKEHOLDER = "No department";

/**
 * Re-dividing the board by the stakeholder each request is for.
 *
 * Read off the Department column the projection writes (found by its key, not its name), for the same reason the
 * status arrangement is read off the STATUS column: the payload already holds
 * the answer, reconciled, so there is no second request and no flash of a
 * loading board between two arrangements of the same rows.
 *
 * With one stakeholder selected the projection leaves that column out
 * altogether — every row would carry the same word — and the payload comes back
 * exactly as it arrived.
 */
export function groupPortalBoardByStakeholder<T extends PublicBoardPayload>(payload: T): T {
  const column = payload.columns.find((c) => c.type === "TAGS" && c.id.endsWith(":stakeholder"));
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

const NO_TEAM = "No team";

/**
 * Re-dividing the board by the team whose board each task is on. The team
 * comes with the payload, keyed by task, so this is as cheap as the other
 * arrangements: same items, new groupIds.
 */
export function groupPortalBoardByTeam<T extends PublicBoardPayload>(payload: T, teamOfItem: Readonly<Record<string, PortalTeamRef | null>>): T {
  const boardId = payload.board.id;
  const parents = payload.items.filter((item) => item.parentItemId === null);
  const teams = new Map<string, PortalTeamRef>();
  let teamless = false;
  for (const item of parents) {
    const team = teamOfItem[item.id] ?? null;
    if (team) teams.set(team.id, team);
    else teamless = true;
  }
  const named = [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups: BoardGroup[] = [
    ...named.map((team) => ({ id: `${boardId}:t-${team.id}`, name: team.name, color: team.color })),
    ...(teamless ? [{ id: `${boardId}:t-none`, name: NO_TEAM, color: payload.board.color }] : []),
  ].map((group, position) => ({ ...group, boardId, position, collapsed: false, createdAt: payload.board.createdAt }));

  const groupOf = (id: string) => {
    const team = teamOfItem[id] ?? null;
    return team ? `${boardId}:t-${team.id}` : `${boardId}:t-none`;
  };
  // A subitem belongs with its task, wherever that task has gone.
  const items = payload.items.map((item) => {
    const groupId = groupOf(item.parentItemId ?? item.id);
    return groupId !== item.groupId ? { ...item, groupId } : item;
  });
  return { ...payload, groups, items };
}

/**
 * Each task's team as a list column of its own, hidden from the table and the
 * task panel: what lets Kanban lay its lanes out by team (a lane per list
 * column, "No team" for the rest), in both portals and on a phone. Built here
 * from what the payload already carries, so nothing more is read or published.
 */
export function withTeamColumn<T extends PublicBoardPayload & { teamOfItem?: Readonly<Record<string, PortalTeamRef | null>> }>(payload: T): T {
  const teamOfItem = payload.teamOfItem;
  if (!teamOfItem) return payload;
  const boardId = payload.board.id;
  const columnId = `${boardId}:team`;
  const teams = new Map<string, PortalTeamRef>();
  for (const team of Object.values(teamOfItem)) if (team) teams.set(team.id, team);
  if (teams.size === 0) return payload;
  const column: BoardColumn = {
    id: columnId,
    boardId,
    name: "Team",
    type: "DROPDOWN",
    settings: { kind: "dropdown", labels: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)).map((team) => ({ id: team.id, name: team.name, color: team.color })), defaultLabelId: null },
    position: Math.max(0, ...payload.columns.map((c) => c.position)) + 1,
    width: 140,
    hidden: true,
    hiddenInPanel: true,
    createdAt: payload.board.createdAt,
  };
  const values: ItemColumnValue[] = payload.items
    .filter((item) => item.parentItemId === null && teamOfItem[item.id])
    .map((item) => ({ id: `${item.id}:team`, itemId: item.id, columnId, value: { type: "DROPDOWN", labelId: teamOfItem[item.id]!.id }, updatedAt: payload.board.createdAt }));
  return { ...payload, columns: [...payload.columns, column], values: [...payload.values, ...values] };
}

/** Applies a visitor's choice. "board" is the payload exactly as it was built. */
export function applyPortalGrouping<T extends PublicBoardPayload>(
  payload: T,
  grouping: PortalGrouping,
  statusOrder: readonly string[] = [],
  teamOfItem?: Readonly<Record<string, PortalTeamRef | null>>,
): T {
  if (grouping === "status") return groupPortalBoardByStatus(payload, statusOrder);
  if (grouping === "stakeholder") return groupPortalBoardByStakeholder(payload);
  if (grouping === "team" && teamOfItem) return groupPortalBoardByTeam(payload, teamOfItem);
  return payload;
}
