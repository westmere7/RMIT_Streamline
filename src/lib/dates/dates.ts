import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isBefore,
  isSameDay,
  isSameYear,
  isValid,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { ISODate } from "@/domain/common/types";

export const ISO_DATE_FORMAT = "yyyy-MM-dd";

export function toISODate(date: Date): ISODate {
  return format(date, ISO_DATE_FORMAT);
}

export function parseISODate(value: ISODate | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** "Sep 8" or "Sep 8, 2025" if not in the current year. */
export function formatShortDate(value: ISODate | null | undefined, now: Date = new Date()): string {
  const date = parseISODate(value);
  if (!date) return "";
  return isSameYear(date, now) ? format(date, "MMM d") : format(date, "MMM d, yyyy");
}

export function formatDateRange(start: ISODate | null, end: ISODate | null, now: Date = new Date()): string {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (s && e) {
    if (isSameDay(s, e)) return formatShortDate(start, now);
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) return `${format(s, "MMM d")} – ${format(e, "d")}`;
    return `${formatShortDate(start, now)} – ${formatShortDate(end, now)}`;
  }
  if (s) return `From ${formatShortDate(start, now)}`;
  if (e) return `Until ${formatShortDate(end, now)}`;
  return "";
}

export function isOverdue(value: ISODate | null | undefined, now: Date = new Date()): boolean {
  const date = parseISODate(value);
  if (!date) return false;
  return isBefore(startOfDay(date), startOfDay(now));
}

export function isToday(value: ISODate | null | undefined, now: Date = new Date()): boolean {
  const date = parseISODate(value);
  return !!date && isSameDay(date, now);
}

export function daysUntil(value: ISODate | null | undefined, now: Date = new Date()): number | null {
  const date = parseISODate(value);
  if (!date) return null;
  return differenceInCalendarDays(date, now);
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseISO(iso);
  if (!isValid(date)) return "";
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 45) return "just now";
  return `${formatDistanceToNowStrict(date, { addSuffix: false })} ago`;
}

export function formatDateTime(iso: string): string {
  const date = parseISO(iso);
  if (!isValid(date)) return "";
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

export type DateBucket = "overdue" | "today" | "thisWeek" | "later" | "noDate";

/** Buckets a due date relative to `now`. Week runs Monday–Sunday. */
export function bucketDate(value: ISODate | null | undefined, now: Date = new Date()): DateBucket {
  const date = parseISODate(value);
  if (!date) return "noDate";
  const today = startOfDay(now);
  const day = startOfDay(date);
  if (isBefore(day, today)) return "overdue";
  if (isSameDay(day, today)) return "today";
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  if (!isBefore(weekEnd, day)) return "thisWeek";
  return "later";
}

export function weekRange(now: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
}

export function shiftISODate(value: ISODate, days: number): ISODate {
  const date = parseISODate(value);
  if (!date) return value;
  return toISODate(addDays(date, days));
}
