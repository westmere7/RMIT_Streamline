"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Palmtree, SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";
import { AvatarStack } from "@/components/shared/user-avatar";
import type { DateConflict, EntityId, ISODate, User, WorkingCalendar } from "@/domain";
import { addDaysIso, crunchBefore, daysBetween, dueDateConflicts, isWeekend, workingDaysBetween } from "@/domain";
import { useFocus, type FocusStore } from "@/features/calendar/focus";
import { WEEKDAYS, addMonths, holidaysOn, keyDatesOn, leaveOn, monthName, shortDay, spanLabel, taskCountByDay, viewRange, weekdayOf, type TaskEvent } from "@/features/calendar/model";
import { DayDetail, TaskChip, type CalendarActions, type CalendarData } from "@/features/calendar/views";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

// ---- the compact month ----------------------------------------------------------------

/**
 * A small month in the side panel: pick a day to go to it, hover one to read
 * it in the details. Shades holidays, dots leave and deadlines. Keyed by the
 * main calendar's month, so it follows when that moves.
 */
export function MiniMonth({ data, actions, selected, onPick }: { data: CalendarData; actions: CalendarActions; selected: ISODate; onPick: (day: ISODate) => void }) {
  const [shown, setShown] = React.useState(`${data.anchor.slice(0, 7)}-01`);
  const { from, to } = viewRange("month", shown);
  const days = daysBetween(from, to);
  const month = shown.slice(0, 7);
  const counts = taskCountByDay(data.tasks, from, to, data.spans);
  return (
    <section className="rounded-xl border border-border/70 bg-card p-2.5" data-testid="calendar-mini-calendar" onMouseLeave={() => actions.focusDay(null)}>
      <div className="mb-1.5 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setShown(addMonths(shown, -1))} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold">
          {monthName(shown)} {shown.slice(0, 4)}
        </span>
        <button type="button" aria-label="Next month" onClick={() => setShown(addMonths(shown, 1))} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10.5px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-0.5">
            {d.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-[12px] tabular-nums">
        {days.map((d) => {
          const inMonth = d.startsWith(month);
          const holiday = data.showHolidays && holidaysOn(data.holidays, d).length > 0;
          const away = leaveOn(data.leave, d).length;
          const due = counts.get(d) ?? 0;
          const key = data.showKeyDates && keyDatesOn(data.keyDates, d).length > 0;
          return (
            <button
              key={d}
              type="button"
              onMouseEnter={() => actions.focusDay(d)}
              onFocus={() => actions.focusDay(d)}
              onClick={() => onPick(d)}
              className={cn(
                "relative flex h-8 flex-col items-center justify-center rounded-md hover:bg-accent max-md:h-10",
                !inMonth && "text-muted-foreground/50",
                isWeekend(d) && inMonth && "text-muted-foreground",
                holiday && "bg-amber-100 font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-200",
                d === selected && "ring-2 ring-inset ring-primary/60",
                d === data.today && "font-bold text-primary",
              )}
              data-testid="mini-day"
              data-day={d}
            >
              {Number(d.slice(8))}
              {(due > 0 || away > 0 || key) && (
                <span className="absolute bottom-0.5 flex gap-px">
                  {due > 0 && <span className={cn("h-1 rounded-full bg-foreground/55", due > 4 ? "w-3" : due > 1 ? "w-2" : "w-1")} />}
                  {away > 0 && <span className="size-1 rounded-full bg-sky-500" />}
                  {key && <span className="size-1 rounded-full bg-indigo-500" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---- the details --------------------------------------------------------------------

/** The hovered task or day, else the chosen one. Reads the hover store, so only this re-renders on hover. */
export function DetailsPanel({ store, data, actions, selected, boardName }: { store: FocusStore; data: CalendarData; actions: CalendarActions; selected: ISODate; boardName: (id: EntityId) => string }) {
  const focus = useFocus(store);
  const day = focus.day ?? selected;
  // A chip inside the panel opens its task, but does not swap the list it sits in for the task.
  const inPanel = React.useMemo<CalendarActions>(() => ({ ...actions, focusTask: () => undefined, focusDay: () => undefined }), [actions]);
  return (
    <section className="rounded-xl border border-border/70 bg-card p-3" data-testid="calendar-details" data-day={focus.task ? undefined : day}>
      {focus.task ? <TaskDetail task={focus.task} data={data} boardName={boardName} onOpen={() => actions.openTask(focus.task!)} /> : <DayDetail day={day} data={data} actions={inPanel} summary />}
    </section>
  );
}

function TaskDetail({ task, data, boardName, onOpen }: { task: TaskEvent; data: CalendarData; boardName: (id: EntityId) => string; onOpen: () => void }) {
  const people = task.peopleIds.map((id) => data.userById(id)).filter((u): u is User => !!u);
  const clashes = task.done ? [] : data.conflictsOf(task);
  return (
    <div className="grid gap-2" data-testid="calendar-task-detail">
      <div className="flex items-start gap-2">
        <span aria-hidden className={cn("mt-1 h-3.5 w-1 shrink-0 rounded-full", colorClasses(task.status?.color ?? "gray").dot)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-snug">{task.name}</div>
          <div className="text-[12px] text-muted-foreground">
            {task.ticket ? `${task.ticket} · ` : ""}
            {boardName(task.boardId)}
          </div>
        </div>
        <button type="button" aria-label="Open task" onClick={onOpen} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <SquareArrowOutUpRight className="size-4" />
        </button>
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
        {task.status && (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <span className={cn("rounded px-1.5 py-px text-[11.5px] font-medium", colorClasses(task.status.color).soft)}>{task.status.name}</span>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{task.startsOn === task.endsOn ? "Day" : "Runs"}</dt>
        <dd className="tabular-nums">
          {spanLabel(task.startsOn, task.endsOn)}
          {task.startsOn !== task.endsOn && <span className="text-muted-foreground"> · {workingDaysBetween(data.cal, task.startsOn, task.endsOn)} working days</span>}
        </dd>
        {task.dueOn && (
          <>
            <dt className="text-muted-foreground">Deadline</dt>
            <dd className="tabular-nums">
              {weekdayOf(task.dueOn)} {shortDay(task.dueOn)}
            </dd>
          </>
        )}
        {people.length > 0 && (
          <>
            <dt className="text-muted-foreground">People</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <AvatarStack users={people} size="xs" max={4} />
              <span className="truncate">{people.map((u) => u.displayName.split(" ")[0]).join(", ")}</span>
            </dd>
          </>
        )}
        {task.hours > 0 && (
          <>
            <dt className="text-muted-foreground">Effort</dt>
            <dd className="tabular-nums">{task.hours.toFixed(1).replace(/\.0$/, "")} h</dd>
          </>
        )}
      </dl>
      {clashes.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {clashes.map((c) => (c.kind === "LEAVE" ? `${c.label} away` : c.label)).join(", ")}
        </div>
      )}
    </div>
  );
}

// ---- heads-up -------------------------------------------------------------------------

/** The first day before `due` nobody on the task is away and the team is in. */
export function safeDayBefore(cal: WorkingCalendar, due: ISODate, people: readonly EntityId[]): ISODate {
  let day = addDaysIso(due, -1);
  for (let i = 0; i < 90 && dueDateConflicts(cal, day, people, () => "").length; i++) day = addDaysIso(day, -1);
  return day;
}

/** What to plan around: the next break and the deadlines that clash. */
export function HeadsUp({ data, actions, conflicts, today, onMove }: { data: CalendarData; actions: CalendarActions; conflicts: Map<EntityId, DateConflict[]>; today: ISODate; onMove: (t: TaskEvent, to: ISODate) => void }) {
  const cal = data.cal;
  const crunch = crunchBefore(cal, today, 10);
  const clashes = data.tasks.filter((t) => t.dueOn && t.dueOn >= today && (conflicts.get(t.itemId)?.length ?? 0) > 0).slice(0, 12);
  const daysLeft = crunch ? workingDaysBetween(cal, today, crunch.to) : 0;
  const dueBefore = crunch ? data.tasks.filter((t) => !t.done && t.dueOn && t.dueOn >= today && t.dueOn <= crunch.to).length : 0;
  const breakDays = crunch ? daysBetween(crunch.holiday.startsOn, crunch.holiday.endsOn).length : 0;
  return (
    <div className="grid gap-3" data-testid="calendar-heads-up">
      {crunch && (
        <section className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/10" data-testid="calendar-next-break" onMouseEnter={() => actions.focusDay(crunch.holiday.startsOn)} onMouseLeave={() => actions.focusDay(null)}>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Palmtree className="size-4 text-amber-600" /> {crunch.holiday.name}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {spanLabel(crunch.holiday.startsOn, crunch.holiday.endsOn)} · {breakDays} {breakDays === 1 ? "day" : "days"} off
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-card px-2 py-1.5">
              <div className="text-[18px] font-semibold tabular-nums">{daysLeft}</div>
              <div className="text-[11px] text-muted-foreground">working days left</div>
            </div>
            <div className="rounded-lg bg-card px-2 py-1.5">
              <div className="text-[18px] font-semibold tabular-nums">{dueBefore}</div>
              <div className="text-[11px] text-muted-foreground">due before it</div>
            </div>
          </div>
        </section>
      )}
      <section className="rounded-xl border border-border/70 bg-card p-3" data-testid="calendar-clashes">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
          <AlertTriangle className="size-4 text-amber-600" /> Clashes
        </div>
        {clashes.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No deadline lands on a day off.</p>
        ) : (
          <div className="grid gap-2">
            {clashes.map((t) => {
              const to = safeDayBefore(cal, t.dueOn!, t.peopleIds);
              return (
                <div key={t.itemId} className="grid gap-1" data-testid="calendar-clash">
                  <TaskChip task={t} data={data} actions={actions} day={t.dueOn!} />
                  <div className="flex items-center justify-between gap-2 pl-1 text-[11.5px] text-muted-foreground">
                    <span className="truncate">
                      {shortDay(t.dueOn!)} · {(conflicts.get(t.itemId) ?? []).map((c) => (c.kind === "LEAVE" ? `${c.label} away` : c.label)).join(", ")}
                    </span>
                    {data.canMove(t) && to >= today && (
                      <button type="button" className="shrink-0 font-medium text-primary hover:underline" onClick={() => onMove(t, to)} data-testid="calendar-clash-move">
                        Move to {shortDay(to)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
