"use client";

import { AlertTriangle, Flag, Palmtree, Plus } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { CalendarKeyDate, ColorToken, DateConflict, EntityId, ISODate, LeaveEntry, LeaveKind, User, WorkingCalendar, WorkspaceHoliday } from "@/domain";
import { LEAVE_KIND_LABELS, addDaysIso, dayCapacity, daysBetween, isWeekend, loadLevel } from "@/domain";
import { WEEKDAYS, densityLevel, holidaysOn, keyDatesOn, leaveOn, leavePart, monthName, packLanes, shortDay, spanLabel, taskCountByDay, tasksOn, viewRange, weekdayOf, type TaskEvent } from "@/features/calendar/model";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export const LEAVE_COLORS: Record<LeaveKind, ColorToken> = { ANNUAL: "sky", SICK: "rose", TRAINING: "violet", CONFERENCE: "teal", OTHER: "gray" };

/** Everything a view draws, read once by the page. */
export interface CalendarData {
  today: ISODate;
  anchor: ISODate;
  tasks: TaskEvent[];
  leave: LeaveEntry[];
  holidays: WorkspaceHoliday[];
  keyDates: CalendarKeyDate[];
  cal: WorkingCalendar;
  people: User[];
  userById: (id: EntityId | null | undefined) => User | undefined;
  weeklyHours: (userId: EntityId) => number;
  conflictsOf: (task: TaskEvent) => DateConflict[];
  canMove: (task: TaskEvent) => boolean;
  showHolidays: boolean;
  showKeyDates: boolean;
  /** Timelines on every day they cover. */
  spans: boolean;
  /** The team's hours of work against the hours it has, per day; empty where nothing is rated. */
  teamLoad: Map<ISODate, { demand: number; capacity: number }>;
  /** The chosen day: ringed on the calendars, read in the details panel when nothing is hovered. */
  selected: ISODate;
  /** A phone: month cells show counts, not chips. */
  compact: boolean;
}

const LOAD_BAR = { IDLE: "bg-transparent", OK: "bg-emerald-500", BUSY: "bg-amber-500", OVER: "bg-rose-500" } as const;

/** A thin bar: how full the team is that day. */
function TeamLoadBar({ day, data }: { day: ISODate; data: CalendarData }) {
  const load = data.teamLoad.get(day);
  if (!load || load.demand <= 0) return null;
  const level = loadLevel(load.demand, load.capacity);
  const share = load.capacity > 0 ? Math.min(1, load.demand / load.capacity) : 1;
  return (
    <SimpleTooltip label={`Team: ${Math.round(load.demand)} h of ${Math.round(load.capacity)} h`}>
      <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-muted" data-testid="calendar-team-load" data-load={level}>
        <div className={cn("h-full rounded-full", LOAD_BAR[level])} style={{ width: `${Math.max(6, share * 100)}%` }} />
      </div>
    </SimpleTooltip>
  );
}

export interface CalendarActions {
  openTask: (task: TaskEvent) => void;
  prefetchTask: (task: TaskEvent) => void;
  /** Moves the task by the days between where it was picked up and where it was dropped. */
  moveTask: (task: TaskEvent, fromDay: ISODate, toDay: ISODate) => void;
  openLeave: (entry: LeaveEntry) => void;
  addLeave: (day: ISODate, userId?: EntityId) => void;
  openHoliday: (holiday: WorkspaceHoliday) => void;
  openKeyDate: (keyDate: CalendarKeyDate) => void;
  /** Present for admins: holidays and key dates are theirs. */
  addHoliday?: (day: ISODate) => void;
  addKeyDate?: (day: ISODate) => void;
  /** Chooses a day: the details panel shows it. */
  showDay: (day: ISODate) => void;
  /** The pointer is over a day (null: off the calendar). */
  focusDay: (day: ISODate | null) => void;
  /** The pointer is over a task (null: off it). */
  focusTask: (task: TaskEvent | null) => void;
}

const DRAG_TYPE = "application/x-streamline-calendar-task";

// ---- pieces --------------------------------------------------------------------------

export function TaskChip({ task, data, actions, day, compact = false }: { task: TaskEvent; data: CalendarData; actions: CalendarActions; day?: ISODate; compact?: boolean }) {
  const conflicts = task.done ? [] : data.conflictsOf(task);
  const movable = data.canMove(task);
  const tone = colorClasses(task.status?.color ?? "gray");
  const timer = React.useRef<number | null>(null);
  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, `${task.itemId}|${day ?? task.startsOn}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        actions.openTask(task);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") actions.focusTask(task);
        timer.current = window.setTimeout(() => actions.prefetchTask(task), 120);
      }}
      onPointerLeave={() => {
        actions.focusTask(null);
        if (timer.current !== null) window.clearTimeout(timer.current);
      }}
      title={`${task.ticket ? `${task.ticket} · ` : ""}${task.name}${task.status ? ` · ${task.status.name}` : ""} · ${spanLabel(task.startsOn, task.endsOn)}${conflicts.length ? `\n${conflicts.map((c) => c.label).join("\n")}` : ""}`}
      className={cn(
        "group/chip flex w-full min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-card px-1.5 text-left text-[12px] leading-5 shadow-xs transition-colors hover:border-input hover:bg-accent/60",
        task.done && "opacity-55",
        movable && "cursor-grab active:cursor-grabbing",
        compact ? "py-0" : "py-0.5",
      )}
      data-testid="calendar-task"
      data-item-id={task.itemId}
    >
      <span aria-hidden className={cn("h-3 w-1 shrink-0 rounded-full", tone.dot, task.stuck && "bg-[repeating-linear-gradient(45deg,currentColor_0_2px,transparent_2px_4px)]")} />
      <span className={cn("min-w-0 flex-1 truncate", task.done && "line-through")}>{task.name}</span>
      {conflicts.length > 0 && <AlertTriangle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Clash" data-testid="calendar-task-clash" />}
    </button>
  );
}

function HolidayBand({ holiday, onOpen }: { holiday: WorkspaceHoliday; onOpen: (h: WorkspaceHoliday) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), onOpen(holiday))}
      className="flex w-full min-w-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 text-left text-[11.5px] font-medium leading-5 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
      data-testid="calendar-holiday"
    >
      <Palmtree className="size-3 shrink-0" />
      <span className="truncate">
        {holiday.name}
        {holiday.halfDay ? ` (${holiday.halfDay === "AM" ? "morning" : "afternoon"})` : ""}
      </span>
    </button>
  );
}

function KeyDateBand({ keyDate, onOpen }: { keyDate: CalendarKeyDate; onOpen: (k: CalendarKeyDate) => void }) {
  return (
    <button type="button" onClick={(e) => (e.stopPropagation(), onOpen(keyDate))} className={cn("flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left text-[11.5px] font-medium leading-5", colorClasses(keyDate.color as ColorToken).soft)} data-testid="calendar-key-date">
      <Flag className="size-3 shrink-0" />
      <span className="truncate">{keyDate.name}</span>
    </button>
  );
}

function AwayRow({ entries, data, actions }: { entries: LeaveEntry[]; data: CalendarData; actions: CalendarActions }) {
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5" data-testid="calendar-away">
      {entries.slice(0, 5).map((l) => {
        const user = data.userById(l.userId);
        return (
          <SimpleTooltip key={l.id} label={`${user?.displayName ?? "Someone"} · ${LEAVE_KIND_LABELS[l.kind]}${l.note ? ` · ${l.note}` : ""}`}>
            <button type="button" onClick={(e) => (e.stopPropagation(), actions.openLeave(l))} className={cn("rounded-full border-2 p-px", colorClasses(LEAVE_COLORS[l.kind]).border)} data-testid="calendar-leave">
              <UserAvatar user={user} size="xs" tooltip={false} />
            </button>
          </SimpleTooltip>
        );
      })}
      {entries.length > 5 && <span className="text-[11px] text-muted-foreground">+{entries.length - 5}</span>}
    </div>
  );
}

/** Everything on one day, with the ways to add to it. */
export function DayDetail({ day, data, actions, summary = false }: { day: ISODate; data: CalendarData; actions: CalendarActions; summary?: boolean }) {
  const holidays = data.showHolidays ? holidaysOn(data.holidays, day) : [];
  const keyDates = data.showKeyDates ? keyDatesOn(data.keyDates, day) : [];
  const away = leaveOn(data.leave, day);
  const tasks = tasksOn(data.tasks, day, data.spans);
  // Under way that day without being due on it: listed under the deadlines, so a busy day never reads as empty.
  const runningTasks = data.spans ? [] : data.tasks.filter((t) => t.startsOn <= day && day <= t.endsOn && (t.dueOn ?? t.endsOn) !== day);
  const running = summary ? data.tasks.filter((t) => t.startsOn <= day && day <= t.endsOn).length : 0;
  return (
    <div className="grid gap-2" data-testid="calendar-day-detail">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold">
          {weekdayOf(day)} {shortDay(day)}
          {day === data.today && <span className="ml-1.5 rounded bg-primary/10 px-1 text-[11px] font-medium text-primary">Today</span>}
        </div>
        {summary && (
          <div className="text-[11.5px] text-muted-foreground tabular-nums" data-testid="calendar-day-summary">
            {tasks.length} due · {running} running · {away.length} away
          </div>
        )}
      </div>
      {holidays.map((h) => (
        <HolidayBand key={h.id} holiday={h} onOpen={actions.openHoliday} />
      ))}
      {keyDates.map((k) => (
        <KeyDateBand key={k.id} keyDate={k} onOpen={actions.openKeyDate} />
      ))}
      {away.length > 0 && (
        <div className="grid gap-1">
          {away.map((l) => {
            const part = leavePart(l, day);
            return (
              <button key={l.id} type="button" onClick={() => actions.openLeave(l)} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12.5px] hover:bg-accent/60">
                <UserAvatar user={data.userById(l.userId)} size="xs" tooltip={false} />
                <span className="min-w-0 flex-1 truncate">{data.userById(l.userId)?.displayName ?? "Someone"}</span>
                <span className={cn("rounded px-1 text-[11px]", colorClasses(LEAVE_COLORS[l.kind]).soft)}>
                  {LEAVE_KIND_LABELS[l.kind]}
                  {part !== "day" ? ` · ${part === "am" ? "morning" : "afternoon"}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid max-h-72 gap-1 overflow-y-auto">
        {tasks.map((t) => (
          <TaskChip key={t.itemId} task={t} data={data} actions={actions} day={day} />
        ))}
        {runningTasks.length > 0 && (
          <>
            <div className="pt-1 text-[11.5px] font-medium text-muted-foreground" data-testid="calendar-day-running">
              Running · {runningTasks.length}
            </div>
            {runningTasks.slice(0, 8).map((t) => (
              <TaskChip key={t.itemId} task={t} data={data} actions={actions} day={day} compact />
            ))}
            {runningTasks.length > 8 && <span className="px-1 text-[11.5px] text-muted-foreground">+{runningTasks.length - 8} more</span>}
          </>
        )}
        {!tasks.length && !runningTasks.length && !away.length && !holidays.length && <p className="text-[12.5px] text-muted-foreground">Nothing on.</p>}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
        <AddButton label="Leave" onClick={() => actions.addLeave(day)} testId="day-add-leave" />
        {actions.addHoliday && <AddButton label="Holiday" onClick={() => actions.addHoliday?.(day)} testId="day-add-holiday" />}
        {actions.addKeyDate && <AddButton label="Key date" onClick={() => actions.addKeyDate?.(day)} testId="day-add-key-date" />}
      </div>
    </div>
  );
}

function AddButton({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 text-[12px] hover:bg-accent/60" data-testid={testId}>
      <Plus className="size-3" /> {label}
    </button>
  );
}

function useDrop(day: ISODate, actions: CalendarActions, data: CalendarData) {
  const [over, setOver] = React.useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const [id, grabbed] = e.dataTransfer.getData(DRAG_TYPE).split("|");
        const task = data.tasks.find((t) => t.itemId === id);
        if (task && grabbed && grabbed !== day) {
          e.preventDefault();
          actions.moveTask(task, grabbed, day);
        }
      },
    },
  };
}

// ---- month ----------------------------------------------------------------------------

export function MonthView({ data, actions }: { data: CalendarData; actions: CalendarActions }) {
  const { from, to } = viewRange("month", data.anchor);
  const weeks: ISODate[][] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)));
  const month = data.anchor.slice(0, 7);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card" data-testid="calendar-month">
      <div className="grid grid-cols-7 border-b border-border/70 bg-surface text-[11.5px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr overflow-y-auto [--cal-row:4rem] md:[--cal-row:7.5rem]" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(var(--cal-row), 1fr))` }} onMouseLeave={() => actions.focusDay(null)}>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b border-border/60 last:border-b-0">
            {week.map((day) => (
              <MonthCell key={day} day={day} inMonth={day.startsWith(month)} data={data} actions={actions} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const MONTH_CELL_TASKS = 3;

function MonthCell({ day, inMonth, data, actions }: { day: ISODate; inMonth: boolean; data: CalendarData; actions: CalendarActions }) {
  const holidays = data.showHolidays ? holidaysOn(data.holidays, day) : [];
  const keyDates = data.showKeyDates ? keyDatesOn(data.keyDates, day) : [];
  const away = leaveOn(data.leave, day);
  const tasks = tasksOn(data.tasks, day, data.spans);
  const drop = useDrop(day, actions, data);
  const off = isWeekend(day) || holidays.some((h) => !h.halfDay);
  return (
    <div
      {...drop.props}
      onMouseEnter={() => actions.focusDay(day)}
      onClick={() => actions.showDay(day)}
      className={cn(
        "flex min-w-0 cursor-default flex-col gap-0.5 border-r border-border/60 p-1 last:border-r-0",
        off && "bg-muted/40",
        !inMonth && "opacity-55",
        day === data.selected && "ring-2 ring-inset ring-primary/50",
        drop.over && "bg-primary/10 ring-2 ring-inset ring-primary/40",
      )}
      data-testid="calendar-day"
      data-day={day}
    >
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={(e) => (e.stopPropagation(), actions.showDay(day))} className={cn("rounded-md px-1.5 text-[12px] font-medium tabular-nums hover:bg-accent", day === data.today && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="calendar-day-number">
          {Number(day.slice(8))}
        </button>
        {!data.compact && <AwayRow entries={away} data={data} actions={actions} />}
      </div>
      {data.compact ? (
        <CompactDay holidays={holidays.length} away={away.length} tasks={tasks.length} />
      ) : (
        <>
      {holidays.map((h) => (
        <HolidayBand key={h.id} holiday={h} onOpen={actions.openHoliday} />
      ))}
      {keyDates.map((k) => (
        <KeyDateBand key={k.id} keyDate={k} onOpen={actions.openKeyDate} />
      ))}
      {tasks.slice(0, MONTH_CELL_TASKS).map((t) => (
        <TaskChip key={t.itemId} task={t} data={data} actions={actions} day={day} compact />
      ))}
      {tasks.length > MONTH_CELL_TASKS && (
        <button type="button" onClick={(e) => (e.stopPropagation(), actions.showDay(day))} className="rounded px-1 text-left text-[11.5px] text-muted-foreground hover:text-foreground" data-testid="calendar-more">
          +{tasks.length - MONTH_CELL_TASKS} more
        </button>
      )}
        </>
      )}
      <TeamLoadBar day={day} data={data} />
    </div>
  );
}

/** A day on a phone: a dot for a holiday, a count of deadlines, a dot for leave. */
function CompactDay({ holidays, away, tasks }: { holidays: number; away: number; tasks: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0.5" data-testid="calendar-compact-day">
      {tasks > 0 && <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{tasks}</span>}
      <span className="flex gap-0.5">
        {holidays > 0 && <span className="size-1.5 rounded-full bg-amber-500" />}
        {away > 0 && <span className="size-1.5 rounded-full bg-sky-500" />}
      </span>
    </div>
  );
}

// ---- week -----------------------------------------------------------------------------

export function WeekView({ data, actions }: { data: CalendarData; actions: CalendarActions }) {
  const { from } = viewRange("week", data.anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden rounded-xl border border-border/70 bg-card" data-testid="calendar-week">
      {days.map((day) => (
        <WeekColumn key={day} day={day} data={data} actions={actions} />
      ))}
    </div>
  );
}

function WeekColumn({ day, data, actions }: { day: ISODate; data: CalendarData; actions: CalendarActions }) {
  const holidays = data.showHolidays ? holidaysOn(data.holidays, day) : [];
  const keyDates = data.showKeyDates ? keyDatesOn(data.keyDates, day) : [];
  const away = leaveOn(data.leave, day);
  const tasks = tasksOn(data.tasks, day, data.spans);
  const drop = useDrop(day, actions, data);
  const off = isWeekend(day) || holidays.some((h) => !h.halfDay);
  return (
    <div {...drop.props} onMouseEnter={() => actions.focusDay(day)} onMouseLeave={() => actions.focusDay(null)} className={cn("flex min-h-0 min-w-0 flex-col border-r border-border/60 last:border-r-0", off && "bg-muted/40", day === data.selected && "ring-2 ring-inset ring-primary/50", drop.over && "bg-primary/10")} data-testid="calendar-day" data-day={day}>
      <button type="button" onClick={() => actions.showDay(day)} className="border-b border-border/60 px-2 py-1.5 text-left hover:bg-accent/50">
        <div className="text-[11.5px] text-muted-foreground">{weekdayOf(day)}</div>
        <div className={cn("text-[15px] font-semibold tabular-nums", day === data.today && "text-primary")}>{Number(day.slice(8))}</div>
        <TeamLoadBar day={day} data={data} />
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {holidays.map((h) => (
          <HolidayBand key={h.id} holiday={h} onOpen={actions.openHoliday} />
        ))}
        {keyDates.map((k) => (
          <KeyDateBand key={k.id} keyDate={k} onOpen={actions.openKeyDate} />
        ))}
        {away.map((l) => {
          const part = leavePart(l, day);
          return (
            <button key={l.id} type="button" onClick={() => actions.openLeave(l)} className={cn("flex items-center gap-1 rounded-md px-1 text-left text-[11.5px] leading-5", colorClasses(LEAVE_COLORS[l.kind]).soft)} data-testid="calendar-leave">
              <UserAvatar user={data.userById(l.userId)} size="xs" tooltip={false} />
              <span className="truncate">
                {data.userById(l.userId)?.displayName.split(" ")[0] ?? "Someone"}
                {part !== "day" ? (part === "am" ? " · am" : " · pm") : ""}
              </span>
            </button>
          );
        })}
        {tasks.map((t) => (
          <TaskChip key={t.itemId} task={t} data={data} actions={actions} day={day} />
        ))}
      </div>
    </div>
  );
}

// ---- agenda ---------------------------------------------------------------------------

export function AgendaView({ data, actions }: { data: CalendarData; actions: CalendarActions }) {
  const { from, to } = viewRange("agenda", data.anchor);
  const days: ISODate[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d);
  const rows = days
    .map((day) => ({
      day,
      holidays: data.showHolidays ? holidaysOn(data.holidays, day) : [],
      keyDates: data.showKeyDates ? keyDatesOn(data.keyDates, day) : [],
      away: leaveOn(data.leave, day),
      // On its deadline, or (timelines shown whole) on its first day, and on the window's first day.
      tasks: data.spans ? data.tasks.filter((t) => t.startsOn === day || (day === from && t.startsOn < from && t.endsOn >= from)) : tasksOn(data.tasks, day),
    }))
    .filter((r) => r.holidays.length || r.keyDates.length || r.away.length || r.tasks.length);
  if (!rows.length) return <p className="px-2 py-10 text-center text-[13px] text-muted-foreground">Nothing in these four weeks.</p>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-card" data-testid="calendar-agenda">
      {rows.map((r) => (
        <div key={r.day} onMouseEnter={() => actions.focusDay(r.day)} onMouseLeave={() => actions.focusDay(null)} className={cn("grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 max-sm:grid-cols-1 max-sm:gap-1", isWeekend(r.day) && "bg-muted/30")} data-day={r.day}>
          <div className={cn("pt-0.5 text-[12.5px] font-medium", r.day === data.today && "text-primary")}>
            {weekdayOf(r.day)} {shortDay(r.day)}
          </div>
          <div className="grid gap-1">
            {r.holidays.map((h) => (
              <HolidayBand key={h.id} holiday={h} onOpen={actions.openHoliday} />
            ))}
            {r.keyDates.map((k) => (
              <KeyDateBand key={k.id} keyDate={k} onOpen={actions.openKeyDate} />
            ))}
            {r.away.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {r.away.map((l) => (
                  <button key={l.id} type="button" onClick={() => actions.openLeave(l)} className={cn("flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[12px]", colorClasses(LEAVE_COLORS[l.kind]).soft)} data-testid="calendar-leave">
                    <UserAvatar user={data.userById(l.userId)} size="xs" tooltip={false} />
                    {data.userById(l.userId)?.displayName ?? "Someone"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {r.tasks.map((t) => (
                <TaskChip key={t.itemId} task={t} data={data} actions={actions} day={r.day} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- roster ---------------------------------------------------------------------------

/** People down the side, four weeks across: leave, holidays and how full each day is. */
export function RosterView({ data, actions, load }: { data: CalendarData; actions: CalendarActions; load: Map<EntityId, Map<ISODate, number>> }) {
  const { from, to } = viewRange("roster", data.anchor);
  const days: ISODate[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d);
  // Deadlines per person and day, for boards without output rates (no hours to weigh).
  const due = new Map<string, number>();
  for (const t of data.tasks) {
    if (t.done) continue;
    const day = t.dueOn ?? t.endsOn;
    if (day < from || day > to) continue;
    for (const id of t.peopleIds) due.set(`${id}|${day}`, (due.get(`${id}|${day}`) ?? 0) + 1);
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-card" data-testid="calendar-roster">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="sticky left-0 z-20 min-w-44 border-b border-r border-border/70 bg-surface px-2 py-1.5 text-left font-medium text-muted-foreground">Person</th>
            {days.map((d) => {
              const hol = data.showHolidays ? holidaysOn(data.holidays, d) : [];
              return (
                <th key={d} onMouseEnter={() => actions.focusDay(d)} onMouseLeave={() => actions.focusDay(null)} className={cn("w-9 min-w-9 border-b border-border/70 px-0 py-1 text-center font-normal", (isWeekend(d) || hol.length) && "bg-muted/60", d === data.today && "text-primary")} title={hol.map((h) => h.name).join(", ") || undefined}>
                  <div className="text-[10px] text-muted-foreground">{weekdayOf(d).slice(0, 2)}</div>
                  <div className="font-medium tabular-nums">{Number(d.slice(8))}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.people.map((u) => (
            <tr key={u.id} data-testid="roster-row" data-user-id={u.id}>
              <th className="sticky left-0 z-[5] border-b border-r border-border/60 bg-card px-2 py-1 text-left font-normal">
                <div className="flex items-center gap-2">
                  <UserAvatar user={u} size="xs" tooltip={false} />
                  <span className="truncate">{u.displayName}</span>
                </div>
              </th>
              {days.map((d) => (
                <RosterCell key={d} day={d} user={u} data={data} actions={actions} hours={load.get(u.id)?.get(d) ?? 0} due={due.get(`${u.id}|${d}`) ?? 0} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LOAD_TINT = { IDLE: "", OK: "bg-emerald-100/70 dark:bg-emerald-500/15", BUSY: "bg-amber-100 dark:bg-amber-500/20", OVER: "bg-rose-200/80 dark:bg-rose-500/25" } as const;

function RosterCell({ day, user, data, actions, hours, due }: { day: ISODate; user: User; data: CalendarData; actions: CalendarActions; hours: number; due: number }) {
  const entry = data.leave.find((l) => l.userId === user.id && l.startsOn <= day && day <= l.endsOn && l.status === "PLANNED");
  const holiday = data.showHolidays ? holidaysOn(data.holidays, day) : [];
  const off = isWeekend(day) || holiday.some((h) => !h.halfDay);
  const capacity = dayCapacity(data.cal, data.weeklyHours(user.id), day, user.id);
  const level = hours > 0 ? loadLevel(hours, capacity) : "IDLE";
  const part = entry ? leavePart(entry, day) : null;
  const dueLabel = due ? `${due} due` : "";
  const label = entry
    ? `${LEAVE_KIND_LABELS[entry.kind]}${part !== "day" ? ` (${part === "am" ? "morning" : "afternoon"})` : ""}${due ? ` · ${dueLabel}` : ""}`
    : [hours > 0 ? `${hours.toFixed(1)} h of ${capacity.toFixed(1)} h` : "", dueLabel, holiday.map((h) => h.name).join(", ")].filter(Boolean).join(" · ");
  return (
    <td onMouseEnter={() => actions.focusDay(day)} onMouseLeave={() => actions.focusDay(null)} className={cn("h-8 border-b border-border/50 p-0.5", off && "bg-muted/50")} data-day={day}>
      <button
        type="button"
        title={label || undefined}
        onClick={() => (entry ? actions.openLeave(entry) : actions.addLeave(day, user.id))}
        className={cn("relative flex size-full items-center justify-center rounded text-[10.5px] tabular-nums", !entry && LOAD_TINT[level], !entry && "hover:ring-1 hover:ring-border")}
        data-testid={entry ? "roster-leave" : "roster-cell"}
        data-load={level}
      >
        {entry && (
          <span
            aria-hidden
            className={cn("absolute inset-y-0.5 rounded", colorClasses(LEAVE_COLORS[entry.kind]).dot, part === "day" && "inset-x-0.5", part === "am" && "right-1/2 left-0.5", part === "pm" && "right-0.5 left-1/2")}
          />
        )}
        {!entry && hours > 0 && <span>{hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace(/\.0$/, "")}</span>}
        {!entry && hours <= 0 && due > 0 && <span className="text-muted-foreground">{due}</span>}
        {entry && due > 0 && <span className="relative z-[1] font-semibold text-white" data-testid="roster-due-on-leave">{due}</span>}
      </button>
    </td>
  );
}

// ---- year -----------------------------------------------------------------------------

export function YearView({ data, actions, onMonth }: { data: CalendarData; actions: CalendarActions; onMonth: (anchor: ISODate) => void }) {
  const year = data.anchor.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4" data-testid="calendar-year">
      {months.map((m) => (
        <YearMonth key={m} first={m} data={data} actions={actions} onOpen={() => onMonth(m)} />
      ))}
    </div>
  );
}

function YearMonth({ first, data, actions, onOpen }: { first: ISODate; data: CalendarData; actions: CalendarActions; onOpen: () => void }) {
  const { from, to } = viewRange("month", first);
  const days: ISODate[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d);
  const month = first.slice(0, 7);
  const monthHolidays = data.holidays.filter((h) => h.startsOn.slice(0, 7) <= month && h.endsOn.slice(0, 7) >= month);
  return (
    <button type="button" onClick={onOpen} onMouseLeave={() => actions.focusDay(null)} className="rounded-xl border border-border/70 bg-card p-2.5 text-left hover:border-input" data-testid="calendar-mini-month">
      <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
        {monthName(first)}
        {monthHolidays.length > 0 && <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300">{monthHolidays.length} off</span>}
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-[10.5px] tabular-nums">
        {days.map((d) => {
          const inMonth = d.startsWith(month);
          const hol = inMonth && data.showHolidays && holidaysOn(data.holidays, d).length > 0;
          const key = inMonth && data.showKeyDates && keyDatesOn(data.keyDates, d).length > 0;
          const away = inMonth ? leaveOn(data.leave, d).length : 0;
          const due = inMonth ? data.tasks.filter((t) => t.dueOn === d && !t.done).length : 0;
          return (
            <span key={d} onMouseEnter={() => inMonth && actions.focusDay(d)} className={cn("relative rounded py-0.5 hover:bg-accent", !inMonth && "invisible", isWeekend(d) && "text-muted-foreground", hol && "bg-amber-200/80 font-semibold text-amber-950 dark:bg-amber-500/30 dark:text-amber-100", d === data.today && "ring-1 ring-primary")}>
              {Number(d.slice(8))}
              {(key || away > 0 || due > 0) && (
                <span className="absolute inset-x-0 bottom-0 flex justify-center gap-px">
                  {key && <span className="size-1 rounded-full bg-indigo-500" />}
                  {away > 0 && <span className="size-1 rounded-full bg-sky-500" />}
                  {due > 0 && <span className="size-1 rounded-full bg-foreground/50" />}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </button>
  );
}

// ---- density ---------------------------------------------------------------------------

const DENSITY_SHADES = ["", "bg-indigo-100 dark:bg-indigo-500/15", "bg-indigo-200 dark:bg-indigo-500/30", "bg-indigo-300 dark:bg-indigo-500/45", "bg-indigo-500 text-white dark:bg-indigo-500/70", "bg-indigo-700 text-white dark:bg-indigo-400 dark:text-indigo-950"] as const;

/** The month as heat: how much lands on each day, at a glance. Hover a day for what it is. */
export function DensityView({ data, actions }: { data: CalendarData; actions: CalendarActions }) {
  const { from, to } = viewRange("density", data.anchor);
  const counts = taskCountByDay(data.tasks, from, to, data.spans);
  const max = Math.max(0, ...counts.values());
  const weeks: ISODate[][] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)));
  const month = data.anchor.slice(0, 7);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="calendar-density">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card p-2">
        <div className="grid grid-cols-7 gap-1.5 pb-1 text-[11.5px] font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid flex-1 gap-1.5 [--cal-row:3.5rem] md:[--cal-row:5.5rem]" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(var(--cal-row), 1fr))` }} onMouseLeave={() => actions.focusDay(null)}>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-1.5">
              {week.map((day) => {
                const count = counts.get(day) ?? 0;
                const level = densityLevel(count, max);
                const holiday = data.showHolidays ? holidaysOn(data.holidays, day).find((h) => !h.halfDay) : undefined;
                const away = leaveOn(data.leave, day).length;
                return (
                  <button
                    key={day}
                    type="button"
                    onMouseEnter={() => actions.focusDay(day)}
                    onFocus={() => actions.focusDay(day)}
                    onClick={() => actions.showDay(day)}
                    className={cn(
                      "relative flex flex-col items-start justify-between rounded-lg border border-transparent p-1.5 text-left transition-[transform,box-shadow] hover:z-[1] hover:scale-[1.03] hover:shadow-md",
                      level === 0 && "bg-muted/40",
                      DENSITY_SHADES[level],
                      holiday && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(245_158_11/0.25)_6px_9px)]",
                      !day.startsWith(month) && "opacity-45",
                      day === data.selected && "border-primary",
                      day === data.today && "ring-2 ring-primary/60",
                    )}
                    data-testid="density-day"
                    data-day={day}
                    data-level={level}
                    aria-label={`${shortDay(day)}: ${count} ${count === 1 ? "task" : "tasks"}`}
                  >
                    <span className="text-[11px] font-medium tabular-nums opacity-80">{Number(day.slice(8))}</span>
                    <span className="flex w-full items-end justify-between gap-1">
                      <span className="text-[18px] leading-none font-semibold tabular-nums md:text-[22px]">{count || ""}</span>
                      {away > 0 && (
                        <span className="rounded-full bg-sky-500 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums" title={`${away} away`}>
                          {away}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-1 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          Fewer
          {DENSITY_SHADES.slice(1).map((c) => (
            <span key={c} className={cn("size-3 rounded", c)} />
          ))}
          More {data.spans ? "running" : "due"}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(245_158_11/0.5)_3px_5px)]" /> Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-sky-500" /> Away
        </span>
      </div>
    </div>
  );
}

// ---- lines -----------------------------------------------------------------------------

const LANE_PX = 9;

/**
 * Every task as a line from its first day to its last: the busy days are where
 * the lines pile up. Hover a line for the task, a column for the day.
 */
export function LinesView({ data, actions }: { data: CalendarData; actions: CalendarActions }) {
  const { from, to } = viewRange("lines", data.anchor);
  const days = daysBetween(from, to);
  const lanes = packLanes(data.tasks, from, to);
  const laneCount = lanes.reduce((n, l) => Math.max(n, l.lane + 1), 0);
  const index = new Map(days.map((d, i) => [d, i]));
  const columns = `repeat(${days.length}, minmax(1.75rem, 1fr))`;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-card" data-testid="calendar-lines" onMouseLeave={() => (actions.focusDay(null), actions.focusTask(null))}>
      <div style={{ minWidth: `${days.length * 1.75}rem` }}>
        <div className="sticky top-0 z-10 grid border-b border-border/70 bg-surface" style={{ gridTemplateColumns: columns }}>
          {days.map((d) => {
            const holiday = data.showHolidays && holidaysOn(data.holidays, d).length > 0;
            return (
              <button key={d} type="button" onMouseEnter={() => (actions.focusDay(d), actions.focusTask(null))} onClick={() => actions.showDay(d)} className={cn("flex flex-col items-center py-1 text-center hover:bg-accent", (isWeekend(d) || holiday) && "bg-muted/60", holiday && "text-amber-700 dark:text-amber-300", d === data.selected && "bg-primary/10")} data-testid="lines-day" data-day={d}>
                <span className="text-[10px] text-muted-foreground">{weekdayOf(d).slice(0, 2)}</span>
                <span className={cn("text-[12px] font-medium tabular-nums", d === data.today && "rounded-full bg-primary px-1.5 text-primary-foreground")}>{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
        <div className="relative" style={{ minHeight: `${Math.max(laneCount * LANE_PX + 16, 240)}px` }}>
          {/* The days, behind the lines: shading, and the hover that reads a day. */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: columns }}>
            {days.map((d) => {
              const off = isWeekend(d) || (data.showHolidays && holidaysOn(data.holidays, d).some((h) => !h.halfDay));
              return <div key={d} onMouseEnter={() => (actions.focusDay(d), actions.focusTask(null))} onClick={() => actions.showDay(d)} className={cn("border-r border-border/40 hover:bg-accent/40", off && "bg-muted/40", d === data.today && "bg-primary/5")} data-testid="lines-column" data-day={d} />;
            })}
          </div>
          <div className="pointer-events-none relative grid py-2" style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${Math.max(laneCount, 1)}, ${LANE_PX}px)` }}>
            {lanes.map(({ task, lane, start, end }) => {
              const tone = colorClasses(task.status?.color ?? "gray");
              const clash = !task.done && data.conflictsOf(task).length > 0;
              return (
                <button
                  key={task.itemId}
                  type="button"
                  onMouseEnter={() => actions.focusTask(task)}
                  onPointerEnter={() => actions.prefetchTask(task)}
                  onClick={() => actions.openTask(task)}
                  style={{ gridColumn: `${(index.get(start) ?? 0) + 1} / ${(index.get(end) ?? 0) + 2}`, gridRow: lane + 1 }}
                  className="group/line pointer-events-auto relative mx-0.5 flex items-center"
                  aria-label={`${task.name}, ${spanLabel(task.startsOn, task.endsOn)}`}
                  data-testid="calendar-line"
                  data-item-id={task.itemId}
                >
                  <span className={cn("h-1.5 w-full rounded-full transition-[height] group-hover/line:h-2.5", tone.dot, task.done && "opacity-35", clash && "ring-1 ring-amber-500 ring-offset-1 ring-offset-card")} />
                </button>
              );
            })}
          </div>
          {lanes.length === 0 && <p className="relative py-16 text-center text-[13px] text-muted-foreground">Nothing runs this month.</p>}
        </div>
      </div>
    </div>
  );
}
