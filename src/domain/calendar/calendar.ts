import type { EntityId, ISODate } from "../common/types";

/**
 * The workspace Calendar: holidays, the leave roster and key dates, and the
 * dated tasks the page reads in one go (migration 0162).
 *
 * Every date here is a calendar day in Vietnam ("YYYY-MM-DD"), as the team
 * works: a holiday is a whole day (or the morning or afternoon of one), and
 * leave runs from one day to another with an optional half at either end.
 */

export const HOLIDAY_KINDS = ["PUBLIC", "CLOSURE", "CAMPUS"] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];
export const HOLIDAY_KIND_LABELS: Record<HolidayKind, string> = { PUBLIC: "Public holiday", CLOSURE: "Team closure", CAMPUS: "Campus closure" };

export interface WorkspaceHoliday {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  startsOn: ISODate;
  endsOn: ISODate;
  /** A single half day: the morning or the afternoon off. */
  halfDay: "AM" | "PM" | null;
  kind: HolidayKind;
  note: string | null;
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
}
export type WorkspaceHolidayInput = Pick<WorkspaceHoliday, "workspaceId" | "name" | "startsOn" | "endsOn" | "halfDay" | "kind" | "note">;
export type WorkspaceHolidayPatch = Partial<Omit<WorkspaceHolidayInput, "workspaceId">>;

export const LEAVE_KINDS = ["ANNUAL", "SICK", "TRAINING", "CONFERENCE", "OTHER"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = { ANNUAL: "Annual leave", SICK: "Sick leave", TRAINING: "Training", CONFERENCE: "Conference", OTHER: "Other" };

export interface LeaveEntry {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  startsOn: ISODate;
  endsOn: ISODate;
  /** Away from midday on the first day. */
  startHalf: boolean;
  /** Back at midday on the last day. */
  endHalf: boolean;
  kind: LeaveKind;
  coverUserId: EntityId | null;
  note: string | null;
  status: "PLANNED" | "CANCELLED";
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
}
export type LeaveEntryInput = Pick<LeaveEntry, "workspaceId" | "userId" | "startsOn" | "endsOn" | "startHalf" | "endHalf" | "kind" | "coverUserId" | "note">;
export type LeaveEntryPatch = Partial<Omit<LeaveEntryInput, "workspaceId">> & { status?: LeaveEntry["status"] };

export interface CalendarKeyDate {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  startsOn: ISODate;
  endsOn: ISODate;
  color: string;
  note: string | null;
  createdBy: EntityId | null;
  createdAt: string;
  updatedAt: string;
}
export type CalendarKeyDateInput = Pick<CalendarKeyDate, "workspaceId" | "name" | "startsOn" | "endsOn" | "color" | "note">;
export type CalendarKeyDatePatch = Partial<Omit<CalendarKeyDateInput, "workspaceId">>;

/** A dated task as the page reads it: the task, all its values, its deliverables. */
export interface CalendarTaskRow {
  id: EntityId;
  boardId: EntityId;
  groupId: EntityId;
  parentItemId: EntityId | null;
  name: string;
  ticket: string | null;
  createdAt: string;
  values: Array<{ columnId: EntityId; value: unknown }>;
  assets: Array<{ assetType: string | null; quantity: number | null; dueDate: ISODate | null; completedAt: string | null; assigneeIds: EntityId[] }>;
}

export interface CalendarFeed {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  token: string;
  createdAt: string;
  revokedAt: string | null;
}

// ---- days ---------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function isoToUtc(day: ISODate): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function utcToIso(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysIso(day: ISODate, days: number): ISODate {
  return utcToIso(isoToUtc(day) + days * DAY_MS);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let t = isoToUtc(from), end = isoToUtc(to); t <= end; t += DAY_MS) out.push(utcToIso(t));
  return out;
}

/** Monday 1 … Sunday 7. */
export function isoWeekday(day: ISODate): number {
  const d = new Date(isoToUtc(day)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isWeekend(day: ISODate): boolean {
  return isoWeekday(day) >= 6;
}

export function spansDay(span: { startsOn: ISODate; endsOn: ISODate }, day: ISODate): boolean {
  return span.startsOn <= day && day <= span.endsOn;
}

export function overlaps(span: { startsOn: ISODate; endsOn: ISODate }, from: ISODate, to: ISODate): boolean {
  return span.startsOn <= to && span.endsOn >= from;
}

/** How much of a working day a holiday takes: 1 for a whole day, 0.5 for a morning or an afternoon. */
export function holidayShare(holidays: readonly WorkspaceHoliday[], day: ISODate): number {
  let share = 0;
  for (const h of holidays) if (spansDay(h, day)) share = Math.max(share, h.halfDay ? 0.5 : 1);
  return share;
}

/** How much of a working day a person's leave takes on `day` (cancelled leave takes none). */
export function leaveShare(entries: readonly LeaveEntry[], userId: EntityId, day: ISODate): number {
  let share = 0;
  for (const e of entries) {
    if (e.status === "CANCELLED" || e.userId !== userId || !spansDay(e, day)) continue;
    const half = (day === e.startsOn && e.startHalf) || (day === e.endsOn && e.endHalf);
    share = Math.max(share, half ? 0.5 : 1);
  }
  return share;
}

export interface WorkingCalendar {
  holidays: readonly WorkspaceHoliday[];
  leave?: readonly LeaveEntry[];
}

/**
 * The part of `day` that is a working day: 0 at a weekend or a whole holiday,
 * 0.5 for a half holiday, and with `userId` less again for their leave.
 */
export function workingShare(cal: WorkingCalendar, day: ISODate, userId?: EntityId): number {
  if (isWeekend(day)) return 0;
  const left = 1 - holidayShare(cal.holidays, day);
  if (!userId || !cal.leave) return Math.max(0, left);
  return Math.max(0, Math.min(left, 1 - leaveShare(cal.leave, userId, day)));
}

export function isWorkingDay(cal: WorkingCalendar, day: ISODate, userId?: EntityId): boolean {
  return workingShare(cal, day, userId) > 0;
}

/** `n` working days after `from` (before it when negative); `from` itself does not count. */
export function addWorkingDays(cal: WorkingCalendar, from: ISODate, n: number, userId?: EntityId): ISODate {
  if (n === 0) return from;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let day = from;
  for (let guard = 0; left > 0 && guard < 3660; guard++) {
    day = addDaysIso(day, step);
    if (isWorkingDay(cal, day, userId)) left--;
  }
  return day;
}

/** The nearest working day on or before `day`. */
export function workingDayOnOrBefore(cal: WorkingCalendar, day: ISODate, userId?: EntityId): ISODate {
  let d = day;
  for (let guard = 0; guard < 366 && !isWorkingDay(cal, d, userId); guard++) d = addDaysIso(d, -1);
  return d;
}

/** Working days from `from` to `to`, both included (half days count half). */
export function workingDaysBetween(cal: WorkingCalendar, from: ISODate, to: ISODate, userId?: EntityId): number {
  if (to < from) return 0;
  return daysBetween(from, to).reduce((sum, day) => sum + workingShare(cal, day, userId), 0);
}

// ---- conflicts and the run-up to a holiday -------------------------------------------

export type ConflictKind = "HOLIDAY" | "LEAVE" | "WEEKEND";
export interface DateConflict {
  kind: ConflictKind;
  /** The holiday's name, or the person away. */
  label: string;
  userId?: EntityId;
}

/**
 * Why a task due on `due` is a problem: the team is closed that day, it is a
 * weekend, or someone working on it is away.
 */
export function dueDateConflicts(cal: WorkingCalendar, due: ISODate, peopleIds: readonly EntityId[], nameOf: (id: EntityId) => string): DateConflict[] {
  const out: DateConflict[] = [];
  const holiday = cal.holidays.find((h) => spansDay(h, due) && !h.halfDay);
  if (holiday) out.push({ kind: "HOLIDAY", label: holiday.name });
  else if (isWeekend(due)) out.push({ kind: "WEEKEND", label: "Weekend" });
  for (const id of peopleIds) if (cal.leave && leaveShare(cal.leave, id, due) >= 1) out.push({ kind: "LEAVE", label: nameOf(id), userId: id });
  return out;
}

/** The next holiday starting on or after `from`, and the `n` working days before it. */
export function crunchBefore(cal: WorkingCalendar, from: ISODate, n: number): { holiday: WorkspaceHoliday; from: ISODate; to: ISODate } | null {
  const next = [...cal.holidays].filter((h) => h.endsOn >= from && !h.halfDay).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  if (!next) return null;
  const to = addDaysIso(next.startsOn, -1);
  const start = addWorkingDays({ holidays: cal.holidays }, next.startsOn, -n);
  return { holiday: next, from: start < from ? from : start, to };
}

// ---- capacity ---------------------------------------------------------------------

/**
 * The hours a person can give on `day`: their weekly hours spread over five
 * days, less weekends, holidays and their leave.
 */
export function dayCapacity(cal: WorkingCalendar, weeklyHours: number, day: ISODate, userId: EntityId): number {
  return (weeklyHours / 5) * workingShare(cal, day, userId);
}

export type LoadLevel = "IDLE" | "OK" | "BUSY" | "OVER";
export function loadLevel(demand: number, capacity: number): LoadLevel {
  if (capacity <= 0) return demand > 0 ? "OVER" : "IDLE";
  const ratio = demand / capacity;
  if (ratio > 1) return "OVER";
  if (ratio > 0.8) return "BUSY";
  if (ratio > 0) return "OK";
  return "IDLE";
}

// ---- the pre-filled Vietnam list ---------------------------------------------------

/** What 0162 puts in every workspace; also what "Add Vietnam holidays" offers when a year is missing. */
export const VIETNAM_HOLIDAYS: ReadonlyArray<{ name: string; startsOn: ISODate; endsOn: ISODate }> = [
  { name: "New Year's Day", startsOn: "2026-01-01", endsOn: "2026-01-01" },
  { name: "Tết (Lunar New Year)", startsOn: "2026-02-14", endsOn: "2026-02-22" },
  { name: "Hùng Kings Commemoration", startsOn: "2026-04-26", endsOn: "2026-04-27" },
  { name: "Reunification Day", startsOn: "2026-04-30", endsOn: "2026-04-30" },
  { name: "Labour Day", startsOn: "2026-05-01", endsOn: "2026-05-01" },
  { name: "National Day", startsOn: "2026-09-01", endsOn: "2026-09-02" },
  { name: "Vietnam Culture Day", startsOn: "2026-11-24", endsOn: "2026-11-24" },
  { name: "New Year's Day", startsOn: "2027-01-01", endsOn: "2027-01-01" },
  { name: "Tết (Lunar New Year)", startsOn: "2027-02-04", endsOn: "2027-02-10" },
  { name: "Hùng Kings Commemoration", startsOn: "2027-04-16", endsOn: "2027-04-16" },
  { name: "Reunification Day", startsOn: "2027-04-30", endsOn: "2027-04-30" },
  { name: "Labour Day", startsOn: "2027-05-01", endsOn: "2027-05-01" },
  { name: "National Day", startsOn: "2027-09-01", endsOn: "2027-09-02" },
  { name: "Vietnam Culture Day", startsOn: "2027-11-24", endsOn: "2027-11-24" },
];

/** Fixed-date holidays move a year on as they are; lunar ones (Tết, Hùng Kings) need their new dates typed in. */
export function isLunarHoliday(name: string): boolean {
  return /tết|tet|hùng|hung kings/i.test(name);
}
