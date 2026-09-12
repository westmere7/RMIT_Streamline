import type { EntityId } from "@/domain";
import type { DateBucket } from "@/lib/dates/dates";
import { bucketDate } from "@/lib/dates/dates";
import type { MyWorkItem } from "@/services/my-work-service";

/**
 * Narrowing My Work, the way a board is narrowed.
 *
 * The list is one person's work across every board, so the filters are about
 * the same handful of things a board's are — which board, what status, how
 * urgent, when, who else is on it — with two differences. Status and priority
 * are matched by *name* rather than by label id, because every board has its
 * own labels and "In Progress" on two boards is one filter to the person
 * reading. And the search asks what it is searching before it searches: a name
 * typed into a box that matched items, people and boards at once found things
 * for the wrong reason.
 */

export const MY_WORK_SEARCH_KINDS = ["item", "person", "board"] as const;
export type MyWorkSearchKind = (typeof MY_WORK_SEARCH_KINDS)[number];

export const MY_WORK_SEARCH_KIND_LABELS: Record<MyWorkSearchKind, { label: string; placeholder: string }> = {
  item: { label: "Items", placeholder: "Search items by name…" },
  person: { label: "People", placeholder: "Search by who is on it…" },
  board: { label: "Boards", placeholder: "Search boards and groups…" },
};

export const MY_WORK_KINDS = ["all", "items", "subitems"] as const;
export type MyWorkKind = (typeof MY_WORK_KINDS)[number];
export const MY_WORK_KIND_LABELS: Record<MyWorkKind, string> = { all: "Items and subitems", items: "Items only", subitems: "Subitems only" };

export interface MyWorkFilters {
  /** Null until the reader has said what the words are for. */
  searchKind: MyWorkSearchKind | null;
  search: string;
  boardIds: EntityId[];
  /** Status label names, lower-cased on comparison. */
  statuses: string[];
  /** Priority label names, lower-cased on comparison. */
  priorities: string[];
  /** Other people on the item — the person in charge, or anyone sharing it. */
  personIds: EntityId[];
  due: DateBucket | null;
  kind: MyWorkKind;
}

export const EMPTY_MY_WORK_FILTERS: MyWorkFilters = { searchKind: null, search: "", boardIds: [], statuses: [], priorities: [], personIds: [], due: null, kind: "all" };

/** How many filters are narrowing the list, for the badge. The search counts as one when it is in force. */
export function activeMyWorkFilterCount(filters: MyWorkFilters): number {
  let n = 0;
  if (filters.boardIds.length) n++;
  if (filters.statuses.length) n++;
  if (filters.priorities.length) n++;
  if (filters.personIds.length) n++;
  if (filters.due) n++;
  if (filters.kind !== "all") n++;
  if (filters.searchKind && filters.search.trim()) n++;
  return n;
}

export interface MyWorkFilterContext {
  now: Date;
  /** A person's display name, for the people search. Unknown ids match nothing. */
  personName: (id: EntityId) => string | undefined;
}

export function filterMyWork(entries: readonly MyWorkItem[], filters: MyWorkFilters, ctx: MyWorkFilterContext): MyWorkItem[] {
  const statuses = new Set(filters.statuses.map(lower));
  const priorities = new Set(filters.priorities.map(lower));
  const boards = new Set(filters.boardIds);
  const people = new Set(filters.personIds);
  const query = filters.searchKind ? filters.search.trim().toLowerCase() : "";

  return entries.filter((entry) => {
    if (boards.size && !boards.has(entry.board.id) && !entry.linkedBoards.some((b) => boards.has(b.id))) return false;
    if (statuses.size && !statuses.has(lower(entry.status?.name ?? ""))) return false;
    if (priorities.size && !priorities.has(lower(entry.priority?.name ?? ""))) return false;
    if (people.size && !entry.people.some((id) => people.has(id))) return false;
    if (filters.due && bucketDate(entry.dueDate, ctx.now) !== filters.due) return false;
    if (filters.kind === "items" && entry.item.parentItemId) return false;
    if (filters.kind === "subitems" && !entry.item.parentItemId) return false;
    if (query) {
      if (filters.searchKind === "item") return entry.item.name.toLowerCase().includes(query);
      if (filters.searchKind === "board") return entry.board.name.toLowerCase().includes(query) || (entry.group?.name.toLowerCase().includes(query) ?? false) || entry.linkedBoards.some((b) => b.name.toLowerCase().includes(query));
      return entry.people.some((id) => (ctx.personName(id) ?? "").toLowerCase().includes(query));
    }
    return true;
  });
}

/** The status and priority names in use across the list, each once, in first-seen order. */
export function myWorkLabelNames(entries: readonly MyWorkItem[], field: "status" | "priority"): string[] {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const name = entry[field]?.name?.trim();
    if (name && !seen.has(lower(name))) seen.set(lower(name), name);
  }
  return [...seen.values()];
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}
