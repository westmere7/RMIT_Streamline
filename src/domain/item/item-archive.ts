import type { EntityId } from "@/domain/common/types";
import type { ColumnValue } from "@/domain/item/item";

/**
 * The archive of a board: every item taken off it, still on it.
 *
 * Archiving is how a board that only ever grows stays openable. The board's own
 * snapshot reads every item and every value it holds in one go, so an archive
 * that came back with it would defeat the point — the archive is therefore read
 * a page at a time, filtered and counted in the database, and only the page on
 * screen is ever in memory.
 */

/** How many rows a page of the archive may hold. The largest is the default: fewer pages to walk. */
export const ARCHIVE_PAGE_SIZES = [10, 25, 50] as const;
export type ArchivePageSize = (typeof ARCHIVE_PAGE_SIZES)[number];
export const ARCHIVE_PAGE_SIZE: ArchivePageSize = 50;

export function isArchivePageSize(value: number): value is ArchivePageSize {
  return (ARCHIVE_PAGE_SIZES as readonly number[]).includes(value);
}

/**
 * What the archive can be ordered by.
 *
 * Two fields, both on the item's own row, because the ordering has to be
 * applied by the database over the whole archive before a page is cut from it —
 * a column value would mean sorting rows nobody asked for. "When it was
 * archived" is the order the list wants by default; a name is how you find one
 * you half remember.
 */
export const ARCHIVE_SORT_FIELDS = ["archivedAt", "name"] as const;
export type ArchiveSortField = (typeof ARCHIVE_SORT_FIELDS)[number];
export type ArchiveSortDirection = "asc" | "desc";

export interface ArchiveSort {
  field: ArchiveSortField;
  direction: ArchiveSortDirection;
}

export const DEFAULT_ARCHIVE_SORT: ArchiveSort = { field: "archivedAt", direction: "desc" };

/**
 * The filters the archive offers, as the screen holds them.
 *
 * The same shape as the board's own filters minus the date filter: "overdue"
 * and "due this week" ask when work is coming up, which is not a question about
 * work that has already been put away.
 */
export interface ArchiveFilters {
  groupIds: EntityId[];
  personIds: EntityId[];
  statusIds: string[];
  priorityIds: string[];
  tags: string[];
}

export const EMPTY_ARCHIVE_FILTERS: ArchiveFilters = { groupIds: [], personIds: [], statusIds: [], priorityIds: [], tags: [] };

export function archiveFilterCount(filters: ArchiveFilters): number {
  return filters.groupIds.length + filters.personIds.length + filters.statusIds.length + filters.priorityIds.length + filters.tags.length;
}

/** What the archive screen asks for: filters as chosen, plus where in the list to look. */
export interface ArchiveRequest {
  search: string;
  filters: ArchiveFilters;
  sort: ArchiveSort;
  /** 1-based: it is a page number on screen, not an offset. */
  page: number;
  pageSize: ArchivePageSize;
}

export const EMPTY_ARCHIVE_REQUEST: ArchiveRequest = {
  search: "",
  filters: EMPTY_ARCHIVE_FILTERS,
  sort: DEFAULT_ARCHIVE_SORT,
  page: 1,
  pageSize: ARCHIVE_PAGE_SIZE,
};

/**
 * The same request with every filter resolved to the columns it applies to.
 *
 * A repository knows rows, not what a column means: which column holds the
 * status is the service's business, and by the time a query is built the
 * question is only ever "this column, one of these values". A filter whose
 * board has no such column resolves to null and is dropped — the board cannot
 * answer it either way.
 */
export interface ArchiveQuery {
  boardId: EntityId;
  /** Matched against the item's name and its booking code. */
  search: string;
  groupIds: EntityId[];
  /** Label ids on one column: the board's first STATUS / PRIORITY column, as the board's own filters use. */
  status: { columnId: EntityId; labelIds: string[] } | null;
  priority: { columnId: EntityId; labelIds: string[] } | null;
  /** Any of these columns naming any of these people. */
  people: { columnIds: EntityId[]; userIds: EntityId[] } | null;
  /** Any of these columns carrying any of these tags. */
  tags: { columnIds: EntityId[]; values: string[] } | null;
  sort: ArchiveSort;
  offset: number;
  limit: number;
}

/** One page of an archive, with the size of the whole filtered list behind it. */
export interface ArchivePage<T> {
  rows: T[];
  /** Rows matching the filters across every page — what the pager counts. */
  total: number;
}

/** What archiving should do about links to items on other boards. */
export const ARCHIVE_LINK_POLICIES = ["cascade", "break"] as const;
export type ArchiveLinkPolicy = (typeof ARCHIVE_LINK_POLICIES)[number];

/**
 * What archiving these items would do to the links they carry.
 *
 * A linked item is kept in step with its twins on other boards, so archiving one
 * side silently leaves the other mirroring a task that is no longer anywhere to
 * be seen. The screen asks which it should be; this is what it needs to ask with.
 */
export interface ArchiveLinkImpact {
  /** Items being archived that carry at least one link. */
  linkedItemIds: EntityId[];
  /** Items on the other end, not already in the selection. */
  connectedItemIds: EntityId[];
  /** Boards those connected items sit on, by id, for naming them on screen. */
  connectedBoardIds: EntityId[];
}

export const EMPTY_ARCHIVE_LINK_IMPACT: ArchiveLinkImpact = { linkedItemIds: [], connectedItemIds: [], connectedBoardIds: [] };

export function hasLinkImpact(impact: ArchiveLinkImpact): boolean {
  return impact.linkedItemIds.length > 0;
}

/**
 * Whether an archived item answers a query, in the same terms the database
 * does.
 *
 * The Supabase provider expresses this as a query and never sees the rows that
 * fail it; the local provider holds everything in the browser and applies this
 * directly. Both have to agree, so the rules are written once, here: a choice
 * within a kind is "any of", and the kinds are "all of".
 */
export function matchesArchiveQuery(item: ArchivableItem, query: ArchiveQuery, getValue: ArchiveValueLookup): boolean {
  const search = query.search.trim().toLowerCase();
  if (search) {
    const name = item.name.toLowerCase().includes(search);
    const reference = (item.reference ?? "").toLowerCase().includes(search);
    if (!name && !reference) return false;
  }
  if (query.groupIds.length > 0 && !query.groupIds.includes(item.groupId)) return false;

  if (query.status) {
    const value = getValue(item.id, query.status.columnId);
    if (value?.type !== "STATUS" || value.labelId === null || !query.status.labelIds.includes(value.labelId)) return false;
  }
  if (query.priority) {
    const value = getValue(item.id, query.priority.columnId);
    if (value?.type !== "PRIORITY" || value.labelId === null || !query.priority.labelIds.includes(value.labelId)) return false;
  }
  if (query.people) {
    const wanted = new Set(query.people.userIds);
    const named = query.people.columnIds.some((columnId) => {
      const value = getValue(item.id, columnId);
      return value?.type === "PERSON" && value.userIds.some((id) => wanted.has(id));
    });
    if (!named) return false;
  }
  if (query.tags) {
    const wanted = new Set(query.tags.values);
    const tagged = query.tags.columnIds.some((columnId) => {
      const value = getValue(item.id, columnId);
      return value?.type === "TAGS" && value.tags.some((tag) => wanted.has(tag));
    });
    if (!tagged) return false;
  }
  return true;
}

/** The archive's order: the chosen field, then the id, so a page boundary holds still. */
export function compareArchived(a: ArchivableItem, b: ArchivableItem, sort: ArchiveSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const first = sort.field === "name" ? a.name.localeCompare(b.name) : (a.archivedAt ?? "").localeCompare(b.archivedAt ?? "");
  return (first !== 0 ? first : a.id.localeCompare(b.id)) * direction;
}

/** What the rules above need of an item; `Item` satisfies it. */
export interface ArchivableItem {
  id: EntityId;
  groupId: EntityId;
  name: string;
  reference?: string | null;
  archivedAt: string | null;
}

export type ArchiveValueLookup = (itemId: EntityId, columnId: EntityId) => ColumnValue | undefined;
