import type { EntityId, ISODate } from "@/domain/common/types";
import type { BookingFormTemplate } from "@/domain/booking/booking-template";

/**
 * Scheduled forms (v0.152.0): a saved form put live for a window of days, after
 * which the workspace's default form (the one published the ordinary way) is
 * served again by itself.
 *
 * Nothing switches the form over at midnight. Whoever opens the form, or books
 * through it, is served whichever form's window covers today: the switch is on
 * time to the day and nothing has to run at 2am for it to happen.
 *
 * A window keeps its own copy of the form, taken when it was scheduled, so a
 * saved form edited afterwards does not change a window already planned.
 */
export interface BookingFormSchedule {
  id: EntityId;
  workspaceId: EntityId;
  /** The saved form it was taken from; null once that saved form has been deleted. */
  templateId: EntityId | null;
  /** What it goes live as. */
  name: string;
  /** The form, as it was when it was scheduled. */
  template: BookingFormTemplate;
  /** The first day it is live, and the last, both included (in FORM_SCHEDULE_TIME_ZONE). */
  startsOn: ISODate;
  endsOn: ISODate;
  createdBy: EntityId | null;
  createdAt: string;
}

export type BookingFormScheduleInput = Omit<BookingFormSchedule, "id" | "createdAt">;
export type BookingFormSchedulePatch = Partial<Pick<BookingFormSchedule, "startsOn" | "endsOn" | "name" | "template">>;

/** The team works in Vietnam: a window's days are Vietnam days. */
export const FORM_SCHEDULE_TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Vietnam keeps UTC+7 all year round, with no daylight saving. */
const VIETNAM_OFFSET = "+07:00";

/**
 * How long a form someone already had open is still accepted after the form
 * changed under them: they fill in what they were shown, not what replaced it
 * while they were typing.
 */
export const FORM_SWITCH_GRACE_MS = 6 * 60 * 60 * 1000;

/** What the version of the default form is called on a booking. */
export const DEFAULT_FORM_VERSION = "default";

/** Today's date in Vietnam. */
export function scheduleToday(now: Date = new Date()): ISODate {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FORM_SCHEDULE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The moment a window opens: the start of its first day in Vietnam. */
export function windowOpensAt(schedule: Pick<BookingFormSchedule, "startsOn">): number {
  return Date.parse(`${schedule.startsOn}T00:00:00${VIETNAM_OFFSET}`);
}

/** The moment a window closes: the end of its last day in Vietnam. */
export function windowClosesAt(schedule: Pick<BookingFormSchedule, "endsOn">): number {
  return Date.parse(`${schedule.endsOn}T00:00:00${VIETNAM_OFFSET}`) + 24 * 60 * 60 * 1000;
}

/** The window whose days include today, if any. */
export function activeSchedule<T extends Pick<BookingFormSchedule, "startsOn" | "endsOn">>(schedules: readonly T[], today: ISODate): T | null {
  return schedules.find((s) => s.startsOn <= today && today <= s.endsOn) ?? null;
}

/** The windows still to come or running, soonest first. */
export function upcomingSchedules<T extends Pick<BookingFormSchedule, "startsOn" | "endsOn">>(schedules: readonly T[], today: ISODate): T[] {
  return schedules.filter((s) => s.endsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** A window that shares a day with this one, if any (windows never overlap). */
export function overlappingSchedule<T extends Pick<BookingFormSchedule, "id" | "startsOn" | "endsOn">>(schedules: readonly T[], startsOn: ISODate, endsOn: ISODate, exceptId?: EntityId | null): T | null {
  return schedules.find((s) => s.id !== exceptId && s.startsOn <= endsOn && startsOn <= s.endsOn) ?? null;
}

/** Why these dates can't be a window, or null when they can. */
export function scheduleDatesProblem(startsOn: string, endsOn: string, today: ISODate): string | null {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(startsOn) || !date.test(endsOn)) return "Pick a first and a last day.";
  if (endsOn < startsOn) return "The last day comes before the first.";
  if (endsOn < today) return "Those days have passed.";
  return null;
}

/** The form a workspace serves right now, and where it came from. */
export interface LiveBookingForm {
  template: BookingFormTemplate;
  /** What it went live as; null for a default form published without a name. */
  name: string | null;
  /** DEFAULT_FORM_VERSION, or the id of the scheduled window being served. */
  version: string;
  /** The window being served, if a scheduled form is live. */
  schedule: BookingFormSchedule | null;
}

/**
 * The form to check a booking against. Normally the live one; but a booking
 * made on the form that was live a moment ago (the visitor opened it before
 * the switch) is checked against that form, for FORM_SWITCH_GRACE_MS after it
 * changed. A version that can't be found, or is older than that, gets the live form.
 */
export function formForSubmission(
  live: LiveBookingForm,
  submittedVersion: string | null | undefined,
  defaultForm: { template: BookingFormTemplate; name: string | null },
  schedules: readonly BookingFormSchedule[],
  now: Date = new Date(),
): LiveBookingForm {
  if (!submittedVersion || submittedVersion === live.version) return live;
  const t = now.getTime();
  if (submittedVersion === DEFAULT_FORM_VERSION) {
    // The default form was replaced by a window that has only just opened.
    if (live.schedule && t - windowOpensAt(live.schedule) <= FORM_SWITCH_GRACE_MS) return { ...defaultForm, version: DEFAULT_FORM_VERSION, schedule: null };
    return live;
  }
  const was = schedules.find((s) => s.id === submittedVersion);
  // A window that closed a moment ago (or that the default took over from).
  if (was && t >= windowOpensAt(was) && t - windowClosesAt(was) <= FORM_SWITCH_GRACE_MS) return { template: was.template, name: was.name, version: was.id, schedule: was };
  return live;
}
