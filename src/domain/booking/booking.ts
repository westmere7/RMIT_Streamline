import type { ColorToken, EntityId, ISODate } from "@/domain/common/types";
import type { TagOption } from "@/domain/board/column";
import type { BookingAnswer, BookingFormTemplate } from "./booking-template";

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

/**
 * The kinds of asset the team produces; the palette of the "Asset type" column.
 *
 * Named by the thing and its size rather than by medium — a forty-page course
 * guide and a two-page flyer are both "print", and treating them as one kind
 * makes every count of them meaningless. The order runs from the longest job to
 * the shortest, which is also the order the output rates fall in (Settings →
 * Lists), so a list read top to bottom reads as a scale of effort.
 */
export const BOOKING_ASSET_TYPES: TagOption[] = [
  { name: "Course Guide (40+ Pages)", color: "red" },
  { name: "Guides (8+ Pages)", color: "rose" },
  { name: "Brochure (under 8 Pages)", color: "orange" },
  { name: "Flyer (1 - 2 Pages)", color: "amber" },
  { name: "Videos (30s+)", color: "violet" },
  { name: "Videos (Short form)", color: "purple" },
  { name: "Articles", color: "green" },
  { name: "Event Copy", color: "lime" },
  { name: "OOH", color: "navy" },
  { name: "Campaign Copy", color: "teal" },
  { name: "Print assets", color: "red" },
  { name: "Scripts", color: "yellow" },
  { name: "Static Designs", color: "blue" },
  { name: "Templates", color: "sky" },
  { name: "Templates (Adobe Exp.)", color: "sky" },
  { name: "Videos (Production)", color: "indigo" },
  { name: "Website Copy", color: "cyan" },
  { name: "GIF / Motion", color: "pink" },
  { name: "Display ads", color: "blue" },
  { name: "Signage", color: "navy" },
  { name: "Slides", color: "gray" },
  { name: "Photos (Uploaded)", color: "gray" },
];

/**
 * A team the form can route a service to.
 *
 * Not a question any more. A stakeholder picking a service type is picking the
 * kind of work; which team does that kind of work is the team's own business,
 * settled once per service in the form editor. This is the list that editor
 * chooses from, and the routing note the wizard shows once a service is picked.
 */
export interface BookingTeamOption {
  id: EntityId;
  name: string;
  description: string | null;
  color: ColorToken;
  icon: string;
  /** Name of the board bookings for this team land on, or null when they go to Task Allocation. */
  boardName: string | null;
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
  /**
   * The brief as one document.
   *
   * Composed rather than typed: the wizard writes it out of the service, the
   * sub-services and the step-two answers (`composeBrief`), and the server
   * composes it again from the same parts before anything is stored, so what
   * lands on the board is what the template asked for and not what a caller
   * chose to send.
   */
  brief: string;
  assetTypes: string[];
  /** The deliverables, each of which becomes a line on the item's Assets tab. */
  assets: BookingAssetLine[];
  /** The kind of work, as a `BookingServiceType` id. Decides step two, and where the booking is routed. */
  serviceTypeId: string | null;
  /** The sub-services chosen under it, by name. Chips in the brief. */
  subServices: string[];
  teamId: EntityId | null;
  dueDate: ISODate | null;
  /** A priority label name, e.g. "High". */
  priority: string | null;
  referenceUrl: string | null;
  /** Answers to the chosen service's brief, keyed by block id. */
  answers: Record<string, BookingAnswer>;
  /**
   * The id the item should be created with. The form makes one up front so the
   * reference it shows is the reference the booking gets; nothing is written
   * until the booking is sent. Ignored when it is already taken.
   */
  itemId?: EntityId | null;
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

/**
 * The code a booking is known by, and the ID# a board shows.
 *
 * Seven characters — as much as the column has room for and as much as anyone
 * will read back over the phone — and the same code every time for the same
 * task, so the form can show it before the task exists. A digest rather than a
 * slice of the id: ids handed out in order would otherwise turn into codes that
 * read as a counter, and a code is not a position in a queue.
 */
export function bookingReference(itemId: EntityId): string {
  // FNV-1a, 32 bits. Not a security hash: it is here to scramble, cheaply and
  // identically in every browser.
  let hash = 0x811c9dc5;
  for (let i = 0; i < itemId.length; i++) {
    hash ^= itemId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `TA-${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
}
