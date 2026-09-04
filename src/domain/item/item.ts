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
}

export type ItemInput = Pick<Item, "boardId" | "groupId" | "name" | "createdBy"> &
  Partial<Pick<Item, "parentItemId" | "description">>;

/** Placeholder attachment metadata. Files are not uploaded anywhere in local mode. */
export interface AttachmentMeta {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  /** Local object URL or mock URL. Future: Supabase Storage signed URL in "workspace-files" bucket. */
  url: string;
  uploadedBy: EntityId;
  uploadedAt: string;
}

/**
 * Normalised column values. Each item/column pair stores one JSON value.
 * The shape mirrors a JSONB `value_json` column in Postgres.
 */
export type ColumnValue =
  | { type: "TEXT"; text: string }
  | { type: "LONG_TEXT"; text: string }
  | { type: "STATUS"; labelId: string | null }
  | { type: "PERSON"; userIds: EntityId[] }
  | { type: "DATE"; date: ISODate | null }
  | { type: "TIMELINE"; start: ISODate | null; end: ISODate | null }
  | { type: "NUMBER"; number: number | null }
  | { type: "PRIORITY"; labelId: string | null }
  | { type: "CHECKBOX"; checked: boolean }
  | { type: "LINK"; url: string; text: string | null }
  | { type: "TAGS"; tags: string[] }
  | { type: "FILES"; files: AttachmentMeta[] }
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
      return { type, text: "" };
    case "STATUS":
      return { type, labelId: null };
    case "PERSON":
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
    case "FILES":
      return { type, files: [] };
    case "DEPENDENCY":
      return { type, itemIds: [] };
  }
}

export function isEmptyValue(value: ColumnValue | undefined): boolean {
  if (!value) return true;
  switch (value.type) {
    case "TEXT":
    case "LONG_TEXT":
      return value.text.trim() === "";
    case "STATUS":
    case "PRIORITY":
      return value.labelId === null;
    case "PERSON":
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
    case "FILES":
      return value.files.length === 0;
    case "DEPENDENCY":
      return value.itemIds.length === 0;
  }
}

/** Values keyed by column id for a single item. */
export type ItemValues = Record<EntityId, ColumnValue>;
