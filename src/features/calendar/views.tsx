"use client";

import { AlertTriangle, Flag, Palmtree, Plus } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { CalendarKeyDate, ColorToken, DateConflict, EntityId, ISODate, LeaveEntry, LeaveKind, User, WorkingCalendar, WorkspaceHoliday } from "@/domain";
import { LEAVE_KIND_LABELS, addDaysIso, dayCapacity, isWeekend, loadLevel } from "@/domain";
import { WEEKDAYS, holidaysOn, weekdayOf, keyDatesOn, leaveOn, leavePart, monthName, shortDay, spanLabel, tasksOn, viewRange, type TaskEvent } from "@/features/calendar/model";
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
  showDay: (day: ISODate) => void;
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
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => actions.prefetchTask(task), 120);
      }}
      onPointerLeave={() => timer.current !== null && window.clearTimeout(timer.current)}
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
export function DayDetail({ day, data, actions }: { day: ISODate; data: CalendarData; actions: CalendarActions }) {
  const holidays = data.showHolidays ? holidaysOn(data.holidays, day) : [];
  const keyDates = data.showKeyDates ? keyDatesOn(data.keyDates, day) : [];
  const away = leaveOn(data.leave, day);
  const tasks = tasksOn(data.tasks, day, data.spans);
  return (
    <div className="grid gap-2" data-testid="calendar-day-detail">
      <div className="text-[13px] font-semibold">
        {weekdayOf(day)} {shortDay(day)}
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
        {!tasks.length && !away.length && !holidays.length && <p className="text-[12.5px] text-muted-foreground">Nothing on.</p>}
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
      <div className="grid flex-1 auto-rows-fr overflow-y-auto" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(7.5rem, 1fr))` }}>
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
      className={cn("flex min-w-0 flex-col gap-0.5 border-r border-border/60 p-1 last:border-r-0", off && "bg-muted/40", !inMonth && "opacity-55", drop.over && "bg-primary/10 ring-2 ring-inset ring-primary/40")}
      data-testid="calendar-day"
      data-day={day}
    >
      <div className="flex items-center justify-between gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn("rounded-md px-1.5 text-[12px] font-medium tabular-nums hover:bg-accent", day === data.today && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="calendar-day-number">
              {Number(day.slice(8))}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <DayDetail day={day} data={data} actions={actions} />
          </PopoverContent>
        </Popover>
        <AwayRow entries={away} data={data} actions={actions} />
      </div>
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
        <Popover key="more">
          <PopoverTrigger asChild>
            <button type="button" className="rounded px-1 text-left text-[11.5px] text-muted-foreground hover:text-foreground" data-testid="calendar-more">
              +{tasks.length - MONTH_CELL_TASKS} more
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <DayDetail day={day} data={data} actions={actions} />
          </PopoverContent>
        </Popover>
      )}
      <TeamLoadBar day={day} data={data} />
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
    <div {...drop.props} className={cn("flex min-h-0 min-w-0 flex-col border-r border-border/60 last:border-r-0", off && "bg-muted/40", drop.over && "bg-primary/10")} data-testid="calendar-day" data-day={day}>
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
        <div key={r.day} className={cn("grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border/60 px-3 py-2 last:border-b-0", isWeekend(r.day) && "bg-muted/30")} data-day={r.day}>
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
                <th key={d} className={cn("w-9 min-w-9 border-b border-border/70 px-0 py-1 text-center font-normal", (isWeekend(d) || hol.length) && "bg-muted/60", d === data.today && "text-primary")} title={hol.map((h) => h.name).join(", ") || undefined}>
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
    <td className={cn("h-8 border-b border-border/50 p-0.5", off && "bg-muted/50")} data-day={day}>
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

export function YearView({ data, onMonth }: { data: CalendarData; onMonth: (anchor: ISODate) => void }) {
  const year = data.anchor.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4" data-testid="calendar-year">
      {months.map((m) => (
        <MiniMonth key={m} first={m} data={data} onOpen={() => onMonth(m)} />
      ))}
    </div>
  );
}

function MiniMonth({ first, data, onOpen }: { first: ISODate; data: CalendarData; onOpen: () => void }) {
  const { from, to } = viewRange("month", first);
  const days: ISODate[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d);
  const month = first.slice(0, 7);
  const monthHolidays = data.holidays.filter((h) => h.startsOn.slice(0, 7) <= month && h.endsOn.slice(0, 7) >= month);
  return (
    <button type="button" onClick={onOpen} className="rounded-xl border border-border/70 bg-card p-2.5 text-left hover:border-input" data-testid="calendar-mini-month">
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
            <span key={d} className={cn("relative rounded py-0.5", !inMonth && "invisible", isWeekend(d) && "text-muted-foreground", hol && "bg-amber-200/80 font-semibold text-amber-950 dark:bg-amber-500/30 dark:text-amber-100", d === data.today && "ring-1 ring-primary")}>
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

