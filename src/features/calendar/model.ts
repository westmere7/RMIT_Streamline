import type { AssetRates, Board, BoardColumn, CalendarKeyDate, CalendarTaskRow, ColorToken, ColumnValue, EntityId, ISODate, LeaveEntry, WorkingCalendar, WorkspaceHoliday } from "@/domain";
import { addDaysIso, isoWeekday, overlaps, resolveColumnRoles, statusLabelRole, workingShare } from "@/domain";
import { itemHours } from "@/features/boards/components/views/workload-hours";

/** A dated task, as the Calendar draws it. */
export interface TaskEvent {
  itemId: EntityId;
  boardId: EntityId;
  parentItemId: EntityId | null;
  name: string;
  ticket: string | null;
  /** The span drawn: the timeline where there is one, else the deadline alone. */
  startsOn: ISODate;
  endsOn: ISODate;
  /** The deadline, where the board keeps one. */
  dueOn: ISODate | null;
  /** The column a drag moves: the deadline's, or the timeline's. */
  dateColumn: BoardColumn;
  status: { name: string; color: ColorToken } | null;
  done: boolean;
  stuck: boolean;
  peopleIds: EntityId[];
  /** What the deliverables take at the workspace's rates. */
  hours: number;
}

export type CalendarView = "month" | "week" | "agenda" | "density" | "lines" | "roster" | "year";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["month", "week", "agenda", "density", "lines", "roster", "year"];
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = { month: "Month", week: "Week", agenda: "Agenda", density: "Density", lines: "Lines", roster: "Roster", year: "Year" };

/** Where the mini month and the details sit around the main calendar. */
export type CalendarLayout = "left" | "right" | "split";
export const CALENDAR_LAYOUTS: readonly CalendarLayout[] = ["left", "right", "split"];
export const CALENDAR_LAYOUT_LABELS: Record<CalendarLayout, string> = { left: "Panel left", right: "Panel right", split: "Either side" };

export type CalendarLayer = "tasks" | "leave" | "holidays" | "keyDates";
export const CALENDAR_LAYERS: readonly CalendarLayer[] = ["tasks", "leave", "holidays", "keyDates"];
export const CALENDAR_LAYER_LABELS: Record<CalendarLayer, string> = { tasks: "Tasks", leave: "Leave", holidays: "Holidays", keyDates: "Key dates" };

export interface CalendarFilters {
  boardIds: EntityId[];
  personIds: EntityId[];
  layers: CalendarLayer[];
  showDone: boolean;
  mine: boolean;
  /** Draw a timeline on every day it covers, not only on its deadline. */
  spans: boolean;
}
export const DEFAULT_FILTERS: CalendarFilters = { boardIds: [], personIds: [], layers: [...CALENDAR_LAYERS], showDone: false, mine: false, spans: false };

export function activeFilterCount(f: CalendarFilters): number {
  return (f.boardIds.length ? 1 : 0) + (f.personIds.length ? 1 : 0) + (f.layers.length < CALENDAR_LAYERS.length ? 1 : 0) + (f.showDone ? 1 : 0) + (f.mine ? 1 : 0) + (f.spans ? 1 : 0);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown): ISODate | null => (typeof v === "string" && ISO.test(v) ? v : null);

/** Every dated task in the rows, read through its board's columns. */
export function buildTaskEvents(rows: readonly CalendarTaskRow[], columns: readonly BoardColumn[], rates: AssetRates): TaskEvent[] {
  const byBoard = new Map<EntityId, BoardColumn[]>();
  for (const c of columns) {
    if (c.removed) continue;
    const list = byBoard.get(c.boardId);
    if (list) list.push(c);
    else byBoard.set(c.boardId, [c]);
  }
  const roles = new Map([...byBoard].map(([id, cols]) => [id, resolveColumnRoles(cols)]));
  const out: TaskEvent[] = [];
  for (const row of rows) {
    const r = roles.get(row.boardId);
    if (!r) continue;
    const value = (column: BoardColumn | null) => (column ? (row.values.find((v) => v.columnId === column.id)?.value as ColumnValue | undefined) : undefined);
    const dueColumn = r.dueDate;
    const due = value(dueColumn);
    const timelineColumn = r.timeline && r.timeline.id !== dueColumn?.id ? r.timeline : null;
    const timeline = value(timelineColumn);
    let dueOn: ISODate | null = null;
    let span: { startsOn: ISODate; endsOn: ISODate; column: BoardColumn } | null = null;
    if (due?.type === "DATE") dueOn = iso(due.date);
    if (due?.type === "TIMELINE" && dueColumn) {
      const s = iso(due.start) ?? iso(due.end);
      const e = iso(due.end) ?? s;
      if (s && e) span = { startsOn: s, endsOn: e < s ? s : e, column: dueColumn };
      dueOn = e;
    }
    if (!span && timeline?.type === "TIMELINE" && timelineColumn) {
      const s = iso(timeline.start) ?? iso(timeline.end);
      const e = iso(timeline.end) ?? s;
      if (s && e) span = { startsOn: s, endsOn: e < s ? s : e, column: timelineColumn };
    }
    // No timeline, but a Start day: the task runs from it to the deadline.
    const startColumn = byBoard.get(row.boardId)?.find((c) => c.type === "START_DATE") ?? null;
    const startValue = value(startColumn);
    const startDay = startValue?.type === "START_DATE" ? iso(startValue.date) : null;
    if (!span && dueOn && dueColumn && startDay && startDay <= dueOn) span = { startsOn: startDay, endsOn: dueOn, column: dueColumn };
    if (!span && dueOn && dueColumn) span = { startsOn: dueOn, endsOn: dueOn, column: dueColumn };
    if (!span) continue;

    const statusColumn = r.status;
    const statusValue = value(statusColumn);
    let status: TaskEvent["status"] = null;
    let done = false;
    let stuck = false;
    if (statusColumn?.settings.kind === "status" && statusValue?.type === "STATUS") {
      const labelId = statusValue.labelId ?? statusColumn.settings.defaultLabelId;
      const label = statusColumn.settings.labels.find((l) => l.id === labelId);
      if (label) status = { name: label.name, color: label.color };
      const role = statusLabelRole(statusColumn.settings, labelId);
      done = role === "done";
      stuck = role === "stuck";
    }
    const people = value(r.pic);
    const peopleIds = new Set(people && "userIds" in people ? people.userIds : []);
    for (const a of row.assets) for (const id of a.assigneeIds) peopleIds.add(id);

    out.push({
      itemId: row.id,
      boardId: row.boardId,
      parentItemId: row.parentItemId,
      name: row.name,
      ticket: row.ticket,
      startsOn: span.startsOn,
      endsOn: span.endsOn,
      dueOn,
      // A drag moves what the chip is drawn on: the deadline where there is one, else the timeline.
      dateColumn: due?.type === "DATE" && dueOn && dueColumn ? dueColumn : span.column,
      status,
      done,
      stuck,
      peopleIds: [...peopleIds],
      hours: itemHours(row.assets.map((a) => ({ assetType: a.assetType, quantity: a.quantity })), rates),
    });
  }
  return out.sort((a, b) => a.startsOn.localeCompare(b.startsOn) || Number(a.done) - Number(b.done) || a.name.localeCompare(b.name));
}

export function filterTasks(events: readonly TaskEvent[], f: CalendarFilters, me: EntityId, visibleBoards: ReadonlySet<EntityId>): TaskEvent[] {
  if (!f.layers.includes("tasks")) return [];
  return events.filter(
    (e) =>
      visibleBoards.has(e.boardId) &&
      (f.showDone || !e.done) &&
      (!f.boardIds.length || f.boardIds.includes(e.boardId)) &&
      (!f.personIds.length || e.peopleIds.some((id) => f.personIds.includes(id))) &&
      (!f.mine || e.peopleIds.includes(me)),
  );
}

export function filterLeave(entries: readonly LeaveEntry[], f: CalendarFilters, me: EntityId): LeaveEntry[] {
  if (!f.layers.includes("leave")) return [];
  return entries.filter((l) => l.status === "PLANNED" && (!f.personIds.length || f.personIds.includes(l.userId)) && (!f.mine || l.userId === me || l.coverUserId === me));
}

// ---- periods -------------------------------------------------------------------

export function todayInVietnam(now = new Date()): ISODate {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function startOfWeek(day: ISODate): ISODate {
  return addDaysIso(day, -((isoWeekday(day) + 6) % 7));
}

export function startOfMonth(day: ISODate): ISODate {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: ISODate): ISODate {
  const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
  return `${day.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function addMonths(day: ISODate, n: number): ISODate {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** The days a view shows, first to last. */
export function viewRange(view: CalendarView, anchor: ISODate): { from: ISODate; to: ISODate } {
  switch (view) {
    case "lines":
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case "month":
    case "density": {
      const from = startOfWeek(startOfMonth(anchor));
      const lastWeek = startOfWeek(endOfMonth(anchor));
      return { from, to: addDaysIso(lastWeek, 6) };
    }
    case "week": {
      const from = startOfWeek(anchor);
      return { from, to: addDaysIso(from, 6) };
    }
    case "agenda":
      return { from: anchor, to: addDaysIso(anchor, 27) };
    case "roster": {
      const from = startOfWeek(anchor);
      return { from, to: addDaysIso(from, 27) };
    }
    case "year":
      return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  }
}

/** The anchor one step back or on. */
export function stepAnchor(view: CalendarView, anchor: ISODate, dir: -1 | 1): ISODate {
  switch (view) {
    case "month":
    case "density":
    case "lines":
      return addMonths(anchor, dir);
    case "week":
      return addDaysIso(anchor, 7 * dir);
    case "agenda":
    case "roster":
      return addDaysIso(anchor, 28 * dir);
    case "year":
      return `${Number(anchor.slice(0, 4)) + dir}-01-01`;
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon" to "Sun". */
export function weekdayOf(day: ISODate): string {
  return WEEKDAYS[(isoWeekday(day) + 6) % 7] ?? "";
}

export function monthName(day: ISODate): string {
  return MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

export function shortDay(day: ISODate): string {
  return `${Number(day.slice(8, 10))} ${SHORT_MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

export function spanLabel(startsOn: ISODate, endsOn: ISODate): string {
  return startsOn === endsOn ? shortDay(startsOn) : `${shortDay(startsOn)} – ${shortDay(endsOn)}`;
}

export function periodLabel(view: CalendarView, anchor: ISODate): string {
  const { from, to } = viewRange(view, anchor);
  if (view === "month" || view === "density" || view === "lines") return `${monthName(anchor)} ${anchor.slice(0, 4)}`;
  if (view === "year") return anchor.slice(0, 4);
  return `${spanLabel(from, to)} ${to.slice(0, 4)}`;
}

// ---- reading a day ---------------------------------------------------------------

export function holidaysOn(holidays: readonly WorkspaceHoliday[], day: ISODate): WorkspaceHoliday[] {
  return holidays.filter((h) => h.startsOn <= day && day <= h.endsOn);
}

export function keyDatesOn(keyDates: readonly CalendarKeyDate[], day: ISODate): CalendarKeyDate[] {
  return keyDates.filter((k) => k.startsOn <= day && day <= k.endsOn);
}

export function leaveOn(entries: readonly LeaveEntry[], day: ISODate): LeaveEntry[] {
  return entries.filter((l) => l.status === "PLANNED" && l.startsOn <= day && day <= l.endsOn);
}

/** The tasks to draw on a day: on their deadline (or last day), or on every day they cover. */
export function tasksOn(events: readonly TaskEvent[], day: ISODate, spans = false): TaskEvent[] {
  return events.filter((e) => (spans ? e.startsOn <= day && day <= e.endsOn : (e.dueOn ?? e.endsOn) === day));
}

/** Which half of the day someone is away: the whole day, or a morning or afternoon. */
export function leavePart(entry: LeaveEntry, day: ISODate): "day" | "am" | "pm" {
  if (day === entry.startsOn && entry.startHalf) return "pm";
  if (day === entry.endsOn && entry.endHalf) return "am";
  return "day";
}

/**
 * Who has how much work in [from, to] against the hours they have: each task's
 * hours shared evenly between its people and over the working days of its span.
 */
export function loadByPersonDay(events: readonly TaskEvent[], cal: WorkingCalendar, from: ISODate, to: ISODate): Map<EntityId, Map<ISODate, number>> {
  const out = new Map<EntityId, Map<ISODate, number>>();
  for (const e of events) {
    if (e.done || e.hours <= 0 || !e.peopleIds.length || !overlaps(e, from, to)) continue;
    const days: ISODate[] = [];
    for (let d = e.startsOn; d <= e.endsOn; d = addDaysIso(d, 1)) if (workingShare(cal, d) > 0) days.push(d);
    if (!days.length) days.push(e.endsOn);
    const each = e.hours / e.peopleIds.length / days.length;
    for (const person of e.peopleIds) {
      const m = out.get(person) ?? new Map<ISODate, number>();
      for (const d of days) if (d >= from && d <= to) m.set(d, (m.get(d) ?? 0) + each);
      out.set(person, m);
    }
  }
  return out;
}

/** The boards a reader can see on the Calendar: live team boards they may open. */
export function calendarBoards(boards: readonly Board[], canView: (b: Board) => boolean): Board[] {
  return boards.filter((b) => !b.archivedAt && !b.system && canView(b));
}

/** How many tasks touch each day: on their deadline, or (spans) every day they run. */
export function taskCountByDay(events: readonly TaskEvent[], from: ISODate, to: ISODate, spans: boolean): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (const e of events) {
    if (spans) {
      for (let d = e.startsOn < from ? from : e.startsOn; d <= e.endsOn && d <= to; d = addDaysIso(d, 1)) out.set(d, (out.get(d) ?? 0) + 1);
    } else {
      const d = e.dueOn ?? e.endsOn;
      if (d >= from && d <= to) out.set(d, (out.get(d) ?? 0) + 1);
    }
  }
  return out;
}

/** 0 (nothing) to 5 (the busiest days in view), so the shades mean the same whatever the month. */
export function densityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.min(5, Math.ceil((count / max) * 5))) as 1 | 2 | 3 | 4 | 5;
}

/**
 * Tasks laid out as lines across [from, to], each in the first lane free when
 * it starts: a busy day is one with many lanes running through it.
 */
export function packLanes(events: readonly TaskEvent[], from: ISODate, to: ISODate): { task: TaskEvent; lane: number; start: ISODate; end: ISODate }[] {
  const shown = events
    .filter((e) => e.startsOn <= to && e.endsOn >= from)
    .map((task) => ({ task, start: task.startsOn < from ? from : task.startsOn, end: task.endsOn > to ? to : task.endsOn }))
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.task.name.localeCompare(b.task.name));
  const laneEnds: ISODate[] = [];
  return shown.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.start);
    if (lane === -1) lane = laneEnds.push(s.end) - 1;
    else laneEnds[lane] = s.end;
    return { ...s, lane };
  });
}
