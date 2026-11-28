import type { BoardColumn } from "@/domain/board/column";
import { resolveColumnRoles } from "@/domain/board/column-role";
import type { ISODate } from "@/domain/common/types";
import type { ColumnValue } from "@/domain/item/item";

/**
 * Start day, deadline and timeline, kept in step.
 *
 * A board's Start day (START_DATE) and Due date (DATE) are the two ends of its
 * Timeline. When one changes:
 * - the others are filled where they are empty ("fills": nobody is asked);
 * - where they already hold something else, the change is offered
 *   ("conflicts": the app asks, automations leave it).
 * Where they still disagree, the timeline's start is the one counted (see
 * productionStart).
 */
export interface DateTrio {
  start: BoardColumn | null;
  due: BoardColumn | null;
  timeline: BoardColumn | null;
}

/** The board's three date columns, where it has them. The deadline counts only as a Due date column. */
export function dateTrio(columns: readonly BoardColumn[]): DateTrio {
  const live = columns.filter((c) => !c.removed);
  const roles = resolveColumnRoles(live);
  const due = roles.dueDate?.type === "DATE" ? roles.dueDate : null;
  const timeline = roles.timeline?.type === "TIMELINE" ? roles.timeline : (live.find((c) => c.type === "TIMELINE") ?? null);
  return { start: live.find((c) => c.type === "START_DATE") ?? null, due, timeline };
}

export interface DateWrite {
  column: BoardColumn;
  value: ColumnValue;
  /** What the column holds now, for the question ("1 – 5 Dec"). Null when empty. */
  from: string | null;
  to: string;
}

export interface DatePlan {
  fills: DateWrite[];
  conflicts: DateWrite[];
}

/** The three dates as they stand (after the change), read off the values. */
export interface DateState {
  start: ISODate | null;
  due: ISODate | null;
  timelineStart: ISODate | null;
  timelineEnd: ISODate | null;
}

export function readDateState(trio: DateTrio, valueOf: (columnId: string) => ColumnValue | undefined): DateState {
  const start = trio.start ? valueOf(trio.start.id) : undefined;
  const due = trio.due ? valueOf(trio.due.id) : undefined;
  const timeline = trio.timeline ? valueOf(trio.timeline.id) : undefined;
  return {
    start: start?.type === "START_DATE" ? start.date : null,
    due: due?.type === "DATE" ? due.date : null,
    timelineStart: timeline?.type === "TIMELINE" ? timeline.start : null,
    timelineEnd: timeline?.type === "TIMELINE" ? timeline.end : null,
  };
}

const span = (a: string | null, b: string | null) => (a || b ? `${a ?? "…"} – ${b ?? "…"}` : null);

/**
 * What else to write after `changed` took its new value (already in `now`).
 * A start after the deadline fills nothing: the two are wrong, not a span.
 */
export function planDateSync(trio: DateTrio, now: DateState, changed: "start" | "due" | "timeline"): DatePlan {
  const plan: DatePlan = { fills: [], conflicts: [] };
  const put = (write: DateWrite, empty: boolean) => (empty ? plan.fills : plan.conflicts).push(write);

  if (changed === "start" || changed === "due") {
    const { start, due } = now;
    if (!trio.timeline || !start || !due || start > due) return plan;
    if (now.timelineStart === start && now.timelineEnd === due) return plan;
    const empty = !now.timelineStart && !now.timelineEnd;
    put({ column: trio.timeline, value: { type: "TIMELINE", start, end: due }, from: span(now.timelineStart, now.timelineEnd), to: `${start} – ${due}` }, empty);
    return plan;
  }

  const { timelineStart, timelineEnd } = now;
  if (trio.start && timelineStart && now.start !== timelineStart) {
    put({ column: trio.start, value: { type: "START_DATE", date: timelineStart }, from: now.start, to: timelineStart }, !now.start);
  }
  if (trio.due && timelineEnd && now.due !== timelineEnd) {
    put({ column: trio.due, value: { type: "DATE", date: timelineEnd }, from: now.due, to: timelineEnd }, !now.due);
  }
  return plan;
}

/** Which end of the trio a column is, if any. */
export function trioPart(trio: DateTrio, columnId: string): "start" | "due" | "timeline" | null {
  if (trio.start?.id === columnId) return "start";
  if (trio.due?.id === columnId) return "due";
  if (trio.timeline?.id === columnId) return "timeline";
  return null;
}

/**
 * The day production began, for the dashboard: the timeline's start where the
 * task has one (it wins when the two disagree), else the Start day, else the
 * day the task reached its team, else the day it was booked or made.
 */
export function productionStart(task: { timelineStart: ISODate | null; startDate: ISODate | null; allocatedOn: ISODate | null; createdOn: ISODate }): { day: ISODate; set: boolean } {
  if (task.timelineStart) return { day: task.timelineStart, set: true };
  if (task.startDate) return { day: task.startDate, set: true };
  return { day: task.allocatedOn ?? task.createdOn, set: false };
}
