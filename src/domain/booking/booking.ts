import type { ColumnValue } from "@/domain/item/item";
import type { ColorToken, EntityId, ISODate } from "@/domain/common/types";
import type { ColumnType, TagOption } from "@/domain/board/column";
import type { BookingFormTemplate } from "./booking-template";

/**
 * Task booking: how people outside the team ask for work.
 *
 * Stakeholders do not use the app day to day and have no idea which team a
 * request belongs to, so they book through one public form. Every booking
 * becomes an item on the workspace's "Task Allocation" board — a system board
 * inside a system "Admin" team that only workspace admins can see — unless a
 * team was chosen that has said it takes bookings straight onto one of its own
 * boards. The manager then allocates the rest from Task Allocation.
 */

/** A team the app created itself. It can be renamed but never removed. */
export const TEAM_SYSTEM_KINDS = ["ADMIN"] as const;
export type TeamSystemKind = (typeof TEAM_SYSTEM_KINDS)[number];

/** A board the app created itself. It can be renamed but never removed. */
export const BOARD_SYSTEM_KINDS = ["TASK_ALLOCATION"] as const;
export type BoardSystemKind = (typeof BOARD_SYSTEM_KINDS)[number];

/** The kinds of asset the team produces; the palette of the "Asset type" column. */
export const BOOKING_ASSET_TYPES: TagOption[] = [
  { name: "Print", color: "red" },
  { name: "Digital", color: "blue" },
  { name: "Social", color: "pink" },
  { name: "Video", color: "violet" },
  { name: "Motion", color: "purple" },
  { name: "Web", color: "cyan" },
  { name: "Photography", color: "amber" },
  { name: "Event", color: "orange" },
  { name: "Brand", color: "navy" },
  { name: "Copy", color: "green" },
];

/**
 * Column types a booking form can ask a stakeholder to fill in directly. The
 * rest (people, status, dependencies…) are the team's business.
 */
export const BOOKING_FIELD_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "LINK", "CHECKBOX", "TAGS", "SIZE"] as const satisfies readonly ColumnType[];
export type BookingFieldType = (typeof BOOKING_FIELD_TYPES)[number];

export function isBookingFieldType(type: ColumnType): type is BookingFieldType {
  return (BOOKING_FIELD_TYPES as readonly string[]).includes(type);
}

/** One extra question, taken from a column of the board the booking will land on. */
export interface BookingExtraField {
  columnId: EntityId;
  name: string;
  type: BookingFieldType;
  /** TAGS: the palette to choose from. */
  options?: TagOption[];
  /** NUMBER: the unit shown after the value. */
  unit?: string | null;
}

/** A team the form offers, with whatever its receiving board asks on top of the standard questions. */
export interface BookingTeamOption {
  id: EntityId;
  name: string;
  description: string | null;
  color: ColorToken;
  icon: string;
  /** Name of the board bookings for this team land on, or null when they go to Task Allocation. */
  boardName: string | null;
  fields: BookingExtraField[];
}

/** Everything the booking page needs to render, safe to show to someone without an account. */
export interface BookingForm {
  workspaceId: EntityId;
  workspaceName: string;
  workspaceSlug: string;
  assetTypes: TagOption[];
  /** Priority labels of the Task Allocation board, in order. */
  priorities: Array<{ name: string; color: ColorToken }>;
  teams: BookingTeamOption[];
  /** The questions to ask, in the workspace's words. */
  template: BookingFormTemplate;
}

/** One deliverable in a booking: what, how many, and the spec it has to meet. */
export interface BookingAssetLine {
  name: string;
  quantity: number | null;
  /** Size, format, dimensions, colour, duration… free text. */
  spec: string | null;
}

/** "A1 poster ×6 — 594×841 mm, CMYK" */
export function formatAssetLine(line: BookingAssetLine): string {
  const qty = line.quantity && line.quantity > 1 ? ` ×${line.quantity}` : "";
  const spec = line.spec?.trim() ? ` — ${line.spec.trim()}` : "";
  return `${line.name.trim()}${qty}${spec}`;
}

/** What a stakeholder submits. Validated by `bookingRequestSchema` on both sides. */
export interface BookingRequest {
  requesterName: string;
  requesterEmail: string;
  department: string | null;
  title: string;
  brief: string;
  assetTypes: string[];
  /** The deliverables, each of which becomes a subitem of the request. */
  assets: BookingAssetLine[];
  teamId: EntityId | null;
  dueDate: ISODate | null;
  /** A priority label name, e.g. "High". */
  priority: string | null;
  referenceUrl: string | null;
  /** Answers to the receiving board's extra fields, keyed by column id. */
  extra: Record<EntityId, ColumnValue>;
  /** Answers to the form's own custom questions, keyed by template field id. */
  answers: Record<string, ColumnValue>;
}

/** What the stakeholder sees once the booking is in. */
export interface BookingReceipt {
  itemId: EntityId;
  itemName: string;
  boardId: EntityId;
  boardName: string;
  boardSlug: string;
  /** The team the booking went to directly, or null when it is waiting on Task Allocation. */
  teamName: string | null;
  /** Short human reference for follow-up, e.g. "TA-4F2K". */
  reference: string;
  submittedAt: string;
  /** How many asset lines became subitems. */
  assetCount: number;
}

/** The public link is /book/<workspace slug>/<key>; the key is the only secret. */
export const BOOKING_KEY_LENGTH = 24;

const KEY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateBookingKey(): string {
  const bytes = new Uint8Array(BOOKING_KEY_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("");
}

export function isPlausibleBookingKey(value: string): boolean {
  return /^[a-z0-9]{16,64}$/.test(value);
}

/** A reference a stakeholder can quote: the item id's tail, uppercased. */
export function bookingReference(itemId: EntityId): string {
  return `TA-${itemId.replace(/-/g, "").slice(-5).toUpperCase()}`;
}
