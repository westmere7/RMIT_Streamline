import type { TShirtSize } from "@/domain/board/column";
import type { EntityId, ISODate, Timestamps } from "@/domain/common/types";
import type { ColumnType } from "@/domain/board/column";

export interface Item extends Timestamps {
  id: EntityId;
  boardId: EntityId;
  groupId: EntityId;
  parentItemId: EntityId | null;
  name: string;
  description: string | null;
  position: number;
  createdBy: EntityId;
  archivedAt: string | null;
  /** Public URL (or data URL in local mode) of the cover image shown on the panel and kanban card. */
  coverUrl?: string | null;
  /**
   * The ticket: "CP_014", the code people quote in an email or a corridor.
   *
   * Booking hands one out, and a task that arrived some other way starts
   * without one until somebody asks for the next in the series. No two tasks in
   * a workspace share a ticket, with the one deliberate exception of tasks
   * linked to each other with the ticket among the fields they sync — they are
   * two boards' views of one piece of work and answer to one code.
   *
   * See `@/domain/item/ticket` for the shape and `TicketService` for who may
   * hand one out.
   */
  ticket?: string | null;
}

export type ItemInput = Pick<Item, "boardId" | "groupId" | "name" | "createdBy"> &
  Partial<Pick<Item, "parentItemId" | "description" | "ticket">>;

export type ColumnValue =
  | { type: "TEXT"; text: string }
  | { type: "LONG_TEXT"; text: string }
  /**
   * A formatted document: headings, bold, underline, lists and links.
   *
   * Stored as the same small markup an update is written in (src/lib/rich-text.ts),
   * so what is in the database stays legible and nothing a person types can
   * become markup. The cell shows the brief of it; the popup shows all of it.
   */
  | { type: "RICH_TEXT"; text: string }
  | { type: "STATUS"; labelId: string | null }
  /** One of the choices the column defines. Shaped like a status, meaning nothing to the board. */
  | { type: "DROPDOWN"; labelId: string | null }
  | { type: "PERSON"; userIds: EntityId[] }
  /** People with no bearing on the work: a requester, a contact, whoever else should be named. */
  | { type: "PEOPLE"; userIds: EntityId[] }
  | { type: "DATE"; date: ISODate | null }
  | { type: "TIMELINE"; start: ISODate | null; end: ISODate | null }
  | { type: "NUMBER"; number: number | null }
  | { type: "PRIORITY"; labelId: string | null }
  | { type: "CHECKBOX"; checked: boolean }
  | { type: "LINK"; url: string; text: string | null }
  | { type: "TAGS"; tags: string[] }
  /** Who the work is for. The name of one of the workspace's stakeholder groups (Settings → Departments). */
  | { type: "STAKEHOLDER"; group: string | null }
  | { type: "SIZE"; size: TShirtSize | null }
  /** A cached summary of the item's asset lines (src/domain/item/item-asset.ts), rewritten whenever they change. */
  | { type: "ASSETS_RECAP"; lines: number; quantity: number; types: number; people: number; nextDue: ISODate | null; overdue: number }
  | { type: "DEPENDENCY"; itemIds: EntityId[] };

export type ColumnValueOf<T extends ColumnType> = Extract<ColumnValue, { type: T }>;

export interface ItemColumnValue {
  id: EntityId;
  itemId: EntityId;
  columnId: EntityId;
  value: ColumnValue;
  updatedAt: string;
}

export function emptyValueFor(type: ColumnType): ColumnValue {
  switch (type) {
    case "TEXT":
      return { type, text: "" };
    case "LONG_TEXT":
    case "RICH_TEXT":
      return { type, text: "" };
    // A brief is rich text with a job: the same value, under its own column type.
    case "BRIEF":
      return { type: "RICH_TEXT", text: "" };
    case "STATUS":
    case "DROPDOWN":
      return { type, labelId: null };
    case "PERSON":
    case "PEOPLE":
      return { type, userIds: [] };
    case "DATE":
      return { type, date: null };
    case "TIMELINE":
      return { type, start: null, end: null };
    case "NUMBER":
      return { type, number: null };
    case "PRIORITY":
      return { type, labelId: null };
    case "CHECKBOX":
      return { type, checked: false };
    case "LINK":
      return { type, url: "", text: null };
    case "TAGS":
      return { type, tags: [] };
    case "STAKEHOLDER":
      return { type, group: null };
    case "SIZE":
      return { type, size: null };
    case "ASSETS_RECAP":
      return { type, lines: 0, quantity: 0, types: 0, people: 0, nextDue: null, overdue: 0 };
    case "DEPENDENCY":
      return { type, itemIds: [] };
  }
}

export function isEmptyValue(value: ColumnValue | undefined): boolean {
  if (!value) return true;
  switch (value.type) {
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
      return value.text.trim() === "";
    case "STATUS":
    case "DROPDOWN":
    case "PRIORITY":
      return value.labelId === null;
    case "PERSON":
    case "PEOPLE":
      return value.userIds.length === 0;
    case "DATE":
      return value.date === null;
    case "TIMELINE":
      return value.start === null && value.end === null;
    case "NUMBER":
      return value.number === null;
    case "CHECKBOX":
      return !value.checked;
    case "LINK":
      return value.url.trim() === "";
    case "TAGS":
      return value.tags.length === 0;
    case "STAKEHOLDER":
      return value.group === null;
    case "SIZE":
      return value.size === null;
    case "ASSETS_RECAP":
      return value.lines === 0;
    case "DEPENDENCY":
      return value.itemIds.length === 0;
  }
}

/** Values keyed by column id for a single item. */
export type ItemValues = Record<EntityId, ColumnValue>;

/**
 * When a person last looked at an item's updates. Together with read
 * notifications it decides whether an item shows "new updates" for them.
 */
export interface ItemRead {
  userId: EntityId;
  itemId: EntityId;
  seenAt: string;
}
