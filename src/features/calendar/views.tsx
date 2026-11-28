"use client";

import { AlertTriangle, Flag, Palmtree, Plus } from "lucide-react";
import * as React from "react";
import { AvatarStack } from "@/components/shared/user-avatar";
import type { CalendarKeyDate, ColorToken, DateConflict, EntityId, ISODate, LeaveEntry, LeaveKind, User, WorkspaceHoliday } from "@/domain";
import { LEAVE_KIND_LABELS, addDaysIso, daysBetween, isWeekend } from "@/domain";
import { WEEKDAYS, densityLevel, holidaysOn, keyDatesOn, leaveOn, monthName, shortDay, viewRange, weekdayOf, type TaskEvent } from "@/features/calendar/model";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export const LEAVE_COLORS: Record<LeaveKind, ColorToken> = { ANNUAL: "sky", SICK: "rose", TRAINING: "violet", CONFERENCE: "teal", OTHER: "gray" };

/** Quiet to busy: nought, then five steps of the brand red. */
export const HEAT_SHADES = [
  "bg-muted text-muted-foreground",
  "bg-rose-200 text-rose-950 dark:bg-rose-950 dark:text-rose-200",
  "bg-rose-300 text-rose-950 dark:bg-rose-900 dark:text-rose-100",
  "bg-rose-400 text-white dark:bg-rose-800 dark:text-rose-50",
  "bg-rose-500 text-white dark:bg-rose-600",
  "bg-rose-600 text-white dark:bg-rose-500",
] as const;

/** What a heat view needs: how busy each day is, the holidays to mark, and what the pointer does. */
export interface HeatProps {
  today: ISODate;
  pinned: ISODate;
  /** Tasks active on each day. */
  counts: Map<ISODate, number>;
  max: number;
  holidays: WorkspaceHoliday[];
  onHover: (day: ISODate | null) => void;
  onPin: (day: ISODate) => void;
}

// ---- a day ------------------------------------------------------------------------------

/** One day as a tile: shaded by how much is active, a corner for a holiday, a dashed edge for a closure. */
function HeatTile({ day, props, large = false, children }: { day: ISODate; props: HeatProps; large?: boolean; children: React.ReactNode }) {
  const count = props.counts.get(day) ?? 0;
  const level = densityLevel(count, props.max);
  const marks = holidaysOn(props.holidays, day);
  const pub = marks.some((h) => h.kind === "PUBLIC");
  const campus = marks.some((h) => h.kind === "CAMPUS");
  const closure = marks.some((h) => h.kind === "CLOSURE");
  const label = `${weekdayOf(day)} ${shortDay(day)}: ${count} ${count === 1 ? "task" : "tasks"}${marks.length ? ` · ${marks.map((h) => h.name).join(", ")}` : ""}`;
  return (
    <button
      type="button"
      onMouseEnter={() => props.onHover(day)}
      onFocus={() => props.onHover(day)}
      onClick={() => props.onPin(day)}
      aria-label={label}
      aria-pressed={day === props.pinned}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md font-semibold tabular-nums transition-[box-shadow,transform] hover:z-[1] hover:scale-[1.08]",
        large ? "aspect-[4/5] flex-col gap-0.5 rounded-xl text-[17px] sm:text-[22px]" : "aspect-square rounded-[4px] text-[10px] sm:rounded-md sm:text-[12px]",
        HEAT_SHADES[level],
        closure && "outline-1 outline-offset-[-2px] outline-foreground/60 outline-dashed",
        day === props.today && "ring-1 ring-foreground/50",
        day === props.pinned && "ring-2 ring-foreground",
      )}
      data-testid="heat-day"
      data-day={day}
      data-level={level}
    >
      {pub && <span aria-hidden className="absolute top-0 left-0 size-0 border-t-[9px] border-r-[9px] border-t-amber-400 border-r-transparent" data-testid="heat-public-holiday" />}
      {campus && <span aria-hidden className="absolute top-0 right-0 size-0 border-t-[9px] border-l-[9px] border-t-slate-400 border-l-transparent" />}
      {children}
    </button>
  );
}

// ---- the year -----------------------------------------------------------------------------

/** Twelve months of tiles, each day shaded by the tasks active on it. */
export function HeatYear({ year, props }: { year: string; props: HeatProps }) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-8 sm:gap-y-6 xl:grid-cols-4" onMouseLeave={() => props.onHover(null)} data-testid="calendar-year">
      {months.map((first) => (
        <HeatMonth key={first} first={first} props={props} />
      ))}
    </div>
  );
}

function HeatMonth({ first, props }: { first: ISODate; props: HeatProps }) {
  const { from, to } = viewRange("month", first);
  const month = first.slice(0, 7);
  return (
    <section aria-label={monthName(first)}>
      <h3 className="mb-1.5 text-center text-[11.5px] font-semibold tracking-wide uppercase">{monthName(first)}</h3>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground sm:gap-1 sm:text-[11px]">
        {WEEKDAYS.map((d) => (
          <span key={d} className="truncate pb-0.5" title={d}>
            {d.slice(0, 2)}
          </span>
        ))}
        {daysBetween(from, to).map((d) =>
          d.startsWith(month) ? (
            <HeatTile key={d} day={d} props={props}>
              {Number(d.slice(8))}
            </HeatTile>
          ) : (
            <span key={d} aria-hidden />
          ),
        )}
      </div>
    </section>
  );
}

// ---- the week -----------------------------------------------------------------------------

/** Seven large tiles, Monday to Sunday, shaded the same way. */
export function HeatWeek({ from, props }: { from: ISODate; props: HeatProps }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  return (
    <div className="grid grid-cols-7 gap-2" onMouseLeave={() => props.onHover(null)} data-testid="calendar-week">
      {days.map((d) => (
        <HeatTile key={d} day={d} props={props} large>
          <span className={cn("text-[11.5px] font-medium opacity-80", isWeekend(d) && "opacity-60")}>{weekdayOf(d)}</span>
          {Number(d.slice(8))}
        </HeatTile>
      ))}
    </div>
  );
}

// ---- the key ------------------------------------------------------------------------------

export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground" data-testid="heat-legend">
      <span className="flex items-center gap-1">
        Quieter
        {HEAT_SHADES.slice(1).map((c) => (
          <span key={c} className={cn("size-3 rounded-sm", c)} />
        ))}
        Busier
      </span>
      <span className="flex items-center gap-1.5">
        <span className="relative size-3 overflow-hidden rounded-sm bg-muted">
          <span className="absolute top-0 left-0 size-0 border-t-[7px] border-r-[7px] border-t-amber-400 border-r-transparent" />
        </span>
        Public holiday
      </span>
      <span className="flex items-center gap-1.5">
        <span className="relative size-3 overflow-hidden rounded-sm bg-muted">
          <span className="absolute top-0 right-0 size-0 border-t-[7px] border-l-[7px] border-t-slate-400 border-l-transparent" />
        </span>
        Campus closure
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm outline-1 outline-offset-[-1px] outline-foreground/60 outline-dashed" />
        Team closure
      </span>
    </div>
  );
}

// ---- the day panel ------------------------------------------------------------------------

export interface DayPanelProps {
  day: ISODate;
  today: ISODate;
  /** Every task in view; the panel takes the ones active on the day. */
  tasks: TaskEvent[];
  leave: LeaveEntry[];
  holidays: WorkspaceHoliday[];
  keyDates: CalendarKeyDate[];
  userById: (id: EntityId | null | undefined) => User | undefined;
  boardName: (id: EntityId) => string;
  boardColor: (id: EntityId) => ColorToken;
  departmentColor: (name: string) => ColorToken;
  conflictsOf: (task: TaskEvent) => DateConflict[];
  openTask: (task: TaskEvent) => void;
  prefetchTask: (task: TaskEvent) => void;
  openLeave: (entry: LeaveEntry) => void;
  openHoliday: (holiday: WorkspaceHoliday) => void;
  openKeyDate: (keyDate: CalendarKeyDate) => void;
  addLeave: (day: ISODate) => void;
  addHoliday?: (day: ISODate) => void;
  addKeyDate?: (day: ISODate) => void;
}

/** The day's tasks, busiest first, with what else is on: a holiday, a key date, who is away. */
export function DayPanel(p: DayPanelProps) {
  const active = p.tasks
    .filter((t) => t.startsOn <= p.day && p.day <= t.endsOn)
    .sort((a, b) => b.units - a.units || daysBetween(b.startsOn, b.endsOn).length - daysBetween(a.startsOn, a.endsOn).length || a.name.localeCompare(b.name));
  const holidays = holidaysOn(p.holidays, p.day);
  const keyDates = keyDatesOn(p.keyDates, p.day);
  const away = leaveOn(p.leave, p.day);
  return (
    <div className="grid gap-3" data-testid="calendar-day-panel" data-day={p.day}>
      <div>
        <div className="text-[15px] font-semibold">
          {Number(p.day.slice(8))} {monthName(p.day).slice(0, 3)} {p.day.slice(0, 4)}
          {p.day === p.today && <span className="ml-1.5 rounded bg-primary/10 px-1 align-middle text-[11px] font-medium text-primary">Today</span>}
        </div>
        <div className="text-[12.5px] text-muted-foreground" data-testid="calendar-day-count">
          {active.length} {active.length === 1 ? "task" : "tasks"}
        </div>
      </div>

      {(holidays.length > 0 || keyDates.length > 0 || away.length > 0) && (
        <div className="grid gap-1">
          {holidays.map((h) => (
            <button key={h.id} type="button" onClick={() => p.openHoliday(h)} className="flex min-w-0 items-center gap-1.5 text-left text-[12.5px] font-medium text-amber-700 dark:text-amber-300" data-testid="calendar-panel-holiday">
              <Palmtree className="size-3.5 shrink-0" /> <span className="truncate">{h.name}</span>
            </button>
          ))}
          {keyDates.map((k) => (
            <button key={k.id} type="button" onClick={() => p.openKeyDate(k)} className="flex min-w-0 items-center gap-1.5 text-left text-[12.5px]">
              <Flag className={cn("size-3.5 shrink-0", colorClasses(k.color as ColorToken).text)} /> <span className="truncate">{k.name}</span>
            </button>
          ))}
          {away.map((l) => {
            const user = p.userById(l.userId);
            return (
              <button key={l.id} type="button" onClick={() => p.openLeave(l)} className="flex min-w-0 items-center gap-1.5 text-left text-[12.5px] text-muted-foreground" data-testid="calendar-panel-leave">
                <AvatarStack users={user ? [user] : []} size="xs" max={1} />
                <span className="truncate">
                  {user?.displayName ?? "Someone"} · {LEAVE_KIND_LABELS[l.kind]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {active.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">Nothing on.</p>
      ) : (
        <ul className="grid gap-0.5" data-testid="calendar-day-tasks">
          {active.map((t) => (
            <DayTask key={t.itemId} task={t} p={p} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
        <AddButton label="Leave" onClick={() => p.addLeave(p.day)} testId="day-add-leave" />
        {p.addHoliday && <AddButton label="Holiday" onClick={() => p.addHoliday?.(p.day)} testId="day-add-holiday" />}
        {p.addKeyDate && <AddButton label="Key date" onClick={() => p.addKeyDate?.(p.day)} testId="day-add-key-date" />}
      </div>
    </div>
  );
}

function DayTask({ task: t, p }: { task: TaskEvent; p: DayPanelProps }) {
  const timer = React.useRef<number | null>(null);
  const clashes = t.done ? [] : p.conflictsOf(t);
  const span = daysBetween(t.startsOn, t.endsOn).length;
  const facts = [t.ticket, t.startsOn === t.endsOn ? shortDay(t.endsOn) : `${shortDay(t.startsOn)} → ${shortDay(t.endsOn)} · ${span} days`, p.boardName(t.boardId)].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={() => p.openTask(t)}
        onPointerEnter={() => {
          timer.current = window.setTimeout(() => p.prefetchTask(t), 120);
        }}
        onPointerLeave={() => timer.current !== null && window.clearTimeout(timer.current)}
        className={cn("grid w-full min-w-0 gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/60", t.done && "opacity-60")}
        data-testid="calendar-day-task"
        data-item-id={t.itemId}
      >
        <span className="flex min-w-0 items-center gap-2">
          {t.department ? (
            <span className={cn("max-w-[5.5rem] shrink-0 truncate rounded px-1.5 py-px text-[10.5px] font-bold uppercase", colorClasses(p.departmentColor(t.department)).solid)}>{t.department}</span>
          ) : (
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorClasses(p.boardColor(t.boardId)).dot)} />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", t.done && "line-through")}>{t.name}</span>
          {clashes.length > 0 && (
            <span title={clashes.map((c) => (c.kind === "LEAVE" ? `${c.label} away` : c.label)).join(", ")} className="shrink-0">
              <AlertTriangle className="size-3.5 text-amber-500" aria-label="Clash" />
            </span>
          )}
          {t.units > 0 && <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{t.units}</span>}
        </span>
        <span className="truncate pl-0.5 text-[11.5px] text-muted-foreground">{facts}</span>
      </button>
    </li>
  );
}

function AddButton({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 text-[12px] hover:bg-accent/60 max-md:py-1.5" data-testid={testId}>
      <Plus className="size-3" /> {label}
    </button>
  );
}
