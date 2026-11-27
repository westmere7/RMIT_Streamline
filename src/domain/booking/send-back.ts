import type { EntityId, ISODateTime } from "@/domain/common/types";
import type { BoardColumn } from "@/domain/board/column";
import { statusLabelRole } from "@/domain/board/column";
import type { BookingRequest } from "@/domain/booking/booking";
import type { BookingAnswer } from "@/domain/booking/booking-template";
import type { Item } from "@/domain/item/item";

/**
 * Sending a booked task back to whoever booked it, for what the booking left out.
 *
 * The team writes what is missing; the requester gets a link of their own (the
 * team passes it on: the app sends no email), opens the form they filled in
 * with their answers in it, puts right what was asked and sends it again. The
 * same task takes the new answers and keeps its ticket.
 *
 * The link is the only thing that lets anybody answer: requesters have no
 * account, and the Guest portal is one link for the whole workspace.
 */
export interface BookingSendBack {
  id: EntityId;
  workspaceId: EntityId;
  itemId: EntityId;
  /** What the team needs, in their words. Shown at the top of the form the requester opens. */
  note: string;
  /** The secret in the requester's link. Read only by people who can edit the task. */
  token: string;
  sentBy: EntityId;
  sentAt: ISODateTime;
  expiresAt: ISODateTime;
  /** When the requester sent the form again. */
  resubmittedAt: ISODateTime | null;
  /** When the team took it back before anyone answered. */
  cancelledAt: ISODateTime | null;
}

/**
 * The booking as it was last sent, answers and all, so the form can open with
 * them in it. Kept for bookings made from v0.168 on; older ones have none, and
 * their requester fills the form in again.
 */
export interface StoredBookingRequest {
  itemId: EntityId;
  workspaceId: EntityId;
  request: BookingRequest;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** What a second send-back of the same task is told, however it lost the race. */
export const ALREADY_WAITING = "This task is already waiting on its requester.";

/** A sent-back form has to come back different: the team asked for something that was missing. */
export const NOTHING_CHANGED = "Change something before sending it again: the team asked for what was missing.";

/** How long a requester has to answer before the link stops working. */
export const SEND_BACK_DAYS = 14;
/** Long enough that nobody guesses it; the shape the database checks. */
export const SEND_BACK_TOKEN_LENGTH = 32;
export const SEND_BACK_NOTE_MAX = 2000;
/** What the requester may add when they send it again. */
export const RESUBMIT_REPLY_MAX = 2000;

export function newSendBackToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(SEND_BACK_TOKEN_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  // 256 is not a multiple of 36: the rejection keeps every character equally likely.
  let out = "";
  for (const byte of bytes) {
    if (byte >= 252) {
      const [again] = globalThis.crypto.getRandomValues(new Uint8Array(1));
      out += alphabet[(again ?? 0) % 36];
    } else out += alphabet[byte % 36];
  }
  return out;
}

export function isSendBackToken(token: string): boolean {
  return /^[a-z0-9]{32}$/.test(token);
}

export function sendBackExpiry(from: Date = new Date()): ISODateTime {
  return new Date(from.getTime() + SEND_BACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Waiting on the requester: not answered, not taken back. Expired ones still count, so the team sees them. */
export function isOpenSendBack(sendBack: Pick<BookingSendBack, "resubmittedAt" | "cancelledAt">): boolean {
  return !sendBack.resubmittedAt && !sendBack.cancelledAt;
}

export function isExpiredSendBack(sendBack: Pick<BookingSendBack, "expiresAt">, now: Date = new Date()): boolean {
  return Date.parse(sendBack.expiresAt) <= now.getTime();
}

/** Where the requester answers, under the workspace's own address. */
export function sendBackPath(workspaceSlug: string, token: string): string {
  return `/${encodeURIComponent(workspaceSlug)}/booking/r/${token}`;
}

/**
 * Why this task cannot be sent back, or null when it can.
 *
 * Only a task somebody booked through the form, still live, and not yet under
 * way: once the work has started (or is done), going back to the requester is
 * a conversation, not a form to fill in again.
 */
export function sendBackRefusal(item: Pick<Item, "bookedVia" | "archivedAt" | "parentItemId">, statusColumn: BoardColumn | null, statusLabelId: string | null): string | null {
  if (!item.bookedVia) return "Only a task booked through the form can be sent back.";
  if (item.parentItemId) return "A subitem goes with its task.";
  if (item.archivedAt) return "Restore the task before sending it back.";
  if (statusColumn?.settings.kind === "status") {
    const role = statusLabelRole(statusColumn.settings, statusLabelId);
    if (role === "done") return "This task is done.";
    if (role === "progress") return "Work on this task has started.";
  }
  return null;
}

/** The status label that says the task waits on someone: the board's "Waiting", if it has one. */
export function waitingLabelId(statusColumn: BoardColumn | null): string | null {
  if (statusColumn?.settings.kind !== "status") return null;
  const labels = statusColumn.settings.labels;
  return labels.find((l) => l.id === "waiting")?.id ?? labels.find((l) => l.name.trim().toLowerCase() === "waiting")?.id ?? null;
}

/**
 * The same value, whatever order its keys are in. Postgres stores JSON with
 * its keys in an order of its own, so a booking read back from the database
 * and the same booking sent from the form differ as text and not otherwise.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

const same = sameJson;

/**
 * What the requester changed, in the words the team's update uses: one entry
 * per part of the form, the brief's answers counted as one.
 */
export function changedParts(before: BookingRequest, after: BookingRequest): string[] {
  const parts: string[] = [];
  if (before.title.trim() !== after.title.trim()) parts.push("Title");
  if (!same(before.serviceTypeId, after.serviceTypeId) || !same([...before.subServices].sort(), [...after.subServices].sort())) parts.push("Service");
  if (!sameAnswers(before.answers, after.answers)) parts.push("Brief");
  if (!same(before.dueDate, after.dueDate)) parts.push("Due date");
  if (!same(before.priority, after.priority)) parts.push("Priority");
  if (!same(before.department, after.department)) parts.push("Department");
  if (!same([...before.assetTypes].sort(), [...after.assetTypes].sort())) parts.push("Asset types");
  if (!same(before.assets, after.assets)) parts.push("Assets");
  if (!same(before.referenceUrl, after.referenceUrl)) parts.push("Reference");
  return parts;
}

function sameAnswers(a: Record<string, BookingAnswer>, b: Record<string, BookingAnswer>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!same(a[key], b[key])) return false;
  return true;
}

/**
 * The asset lines the second request adds to the first, by name. Lines taken
 * away are left on the task for the team to remove: what is on the Assets tab
 * may have been worked on since.
 */
export function addedAssetLines(before: BookingRequest, after: BookingRequest): BookingRequest["assets"] {
  const had = new Set(before.assets.map((a) => a.name.trim().toLowerCase()));
  return after.assets.filter((a) => !had.has(a.name.trim().toLowerCase()));
}

export function removedAssetLines(before: BookingRequest, after: BookingRequest): BookingRequest["assets"] {
  const has = new Set(after.assets.map((a) => a.name.trim().toLowerCase()));
  return before.assets.filter((a) => !has.has(a.name.trim().toLowerCase()));
}
