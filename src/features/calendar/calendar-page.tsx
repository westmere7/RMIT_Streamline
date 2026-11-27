"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Filter, Flag, Link2, Palmtree, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { Board, CalendarKeyDate, CalendarTaskRow, ColumnValue, DateConflict, EntityId, ISODate, LeaveEntry, User, WorkingCalendar, WorkspaceHoliday } from "@/domain";
import { addDaysIso, crunchBefore, dayCapacity, daysBetween, dueDateConflicts, isoToUtc, normaliseAssetRates, weeklyHoursOf, workingDaysBetween } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { FeedDialog, HolidayDialog, KeyDateDialog, LeaveDialog } from "@/features/calendar/dialogs";
import { calendarKeys, useCalendarColumns, useCalendarRealtime, useCalendarTasks, useHolidays, useKeyDates, useLeave } from "@/features/calendar/hooks";
import {
  CALENDAR_LAYERS,
  CALENDAR_LAYER_LABELS,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  DEFAULT_FILTERS,
  activeFilterCount,
  buildTaskEvents,
  calendarBoards,
  filterLeave,
  filterTasks,
  leaveOn,
  loadByPersonDay,
  periodLabel,
  shortDay,
  spanLabel,
  stepAnchor,
  todayInVietnam,
  viewRange,
  type CalendarFilters,
  type CalendarView,
  type TaskEvent,
} from "@/features/calendar/model";
import { AgendaView, DayDetail, MonthView, RosterView, TaskChip, WeekView, YearView, type CalendarActions, type CalendarData } from "@/features/calendar/views";
import { TaskPanelHost } from "@/features/items/task-panel-host";
import { prefetchTaskPanel } from "@/features/items/task-prefetch";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { canEditBoard, canViewBoard, isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readFilters(key: string): CalendarFilters {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<CalendarFilters>;
    return { ...DEFAULT_FILTERS, ...parsed, layers: Array.isArray(parsed.layers) ? parsed.layers.filter((l) => CALENDAR_LAYERS.includes(l)) : DEFAULT_FILTERS.layers };
  } catch {
    return DEFAULT_FILTERS;
  }
}

type DialogState =
  | { kind: "leave"; entry?: LeaveEntry | null; day?: ISODate | null; userId?: EntityId }
  | { kind: "holiday"; holiday?: WorkspaceHoliday | null; day?: ISODate | null }
  | { kind: "keyDate"; keyDate?: CalendarKeyDate | null; day?: ISODate | null }
  | { kind: "feed" }
  | { kind: "day"; day: ISODate }
  | null;

/** The first day before `due` nobody on the task is away and the team is in. */
function safeDayBefore(cal: WorkingCalendar, due: ISODate, people: readonly EntityId[]): ISODate {
  let day = addDaysIso(due, -1);
  for (let i = 0; i < 90 && dueDateConflicts(cal, day, people, () => "").length; i++) day = addDaysIso(day, -1);
  return day;
}

export function CalendarPage() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const me = ws.currentUser.id;
  const isAdmin = isWorkspaceAdmin(ws.permissions);
  const [today] = React.useState(() => todayInVietnam());

  // ---- where we are: in the address, so a link opens the same view ----
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(params.get("view") ?? "") ? (params.get("view") as CalendarView) : isMobile ? "agenda" : "month";
  const anchorParam = params.get("d");
  const anchor: ISODate = anchorParam && ISO.test(anchorParam) ? anchorParam : today;
  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      router.replace(`${window.location.pathname}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [router],
  );

  // ---- filters: this browser's, per workspace ----
  const filterKey = `streamline.calendar.filters.${ws.workspace.id}`;
  // Drawn in the browser only (the workspace is read there), so storage is there to read.
  const [filters, setFiltersState] = React.useState<CalendarFilters>(() => (typeof window === "undefined" ? DEFAULT_FILTERS : readFilters(filterKey)));
  const setFilters = (next: CalendarFilters) => {
    setFiltersState(next);
    try {
      window.localStorage.setItem(filterKey, JSON.stringify(next));
    } catch {
      // Kept for the page only.
    }
  };
  const patchFilters = (p: Partial<CalendarFilters>) => setFilters({ ...filters, ...p });

  // ---- data ----
  const boards = React.useMemo(() => calendarBoards(ws.boards, (b) => canViewBoard(ws.permissions, b)), [ws.boards, ws.permissions]);
  const boardIds = React.useMemo(() => boards.map((b) => b.id), [boards]);
  const visibleBoards = React.useMemo(() => new Set(boardIds), [boardIds]);
  const range = viewRange(view, anchor);
  const showTasks = filters.layers.includes("tasks");
  const columns = useCalendarColumns(ws.workspace.id, boardIds);
  const taskRows = useCalendarTasks(ws.workspace.id, range.from, range.to, showTasks);
  const holidaysQ = useHolidays(ws.workspace.id);
  const leaveQ = useLeave(ws.workspace.id);
  const keyDatesQ = useKeyDates(ws.workspace.id);
  useCalendarRealtime(ws.workspace.id);

  const rates = React.useMemo(() => normaliseAssetRates(ws.workspace.assetRates), [ws.workspace.assetRates]);
  const allTasks = React.useMemo(() => (taskRows.data && columns.data ? buildTaskEvents(taskRows.data, columns.data, rates) : []), [taskRows.data, columns.data, rates]);
  const tasks = React.useMemo(() => filterTasks(allTasks, filters, me, visibleBoards), [allTasks, filters, me, visibleBoards]);
  const toEvents = React.useCallback((rows: CalendarTaskRow[]) => (columns.data ? buildTaskEvents(rows, columns.data, rates).filter((t) => visibleBoards.has(t.boardId)) : []), [columns.data, rates, visibleBoards]);
  const holidays = React.useMemo(() => holidaysQ.data ?? [], [holidaysQ.data]);
  const allLeave = React.useMemo(() => leaveQ.data ?? [], [leaveQ.data]);
  const leave = React.useMemo(() => filterLeave(allLeave, filters, me), [allLeave, filters, me]);
  const keyDates = React.useMemo(() => keyDatesQ.data ?? [], [keyDatesQ.data]);
  // Working days count every holiday and everyone's leave, whatever is shown.
  const cal = React.useMemo<WorkingCalendar>(() => ({ holidays, leave: allLeave.filter((l) => l.status === "PLANNED") }), [holidays, allLeave]);

  const people = React.useMemo(() => {
    const list = [...ws.activeUsers].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return filters.personIds.length ? list.filter((u) => filters.personIds.includes(u.id)) : filters.mine ? list.filter((u) => u.id === me) : list;
  }, [ws.activeUsers, filters.personIds, filters.mine, me]);
  const hoursOf = React.useMemo(() => {
    const byUser = new Map(ws.members.map((m) => [m.userId, weeklyHoursOf(m)]));
    return (id: EntityId) => byUser.get(id) ?? 40;
  }, [ws.members]);
  const nameOf = React.useCallback((id: EntityId) => ws.userById(id)?.displayName ?? "Someone", [ws]);

  const conflicts = React.useMemo(() => {
    const map = new Map<EntityId, DateConflict[]>();
    for (const t of allTasks) if (t.dueOn && !t.done) map.set(t.itemId, dueDateConflicts(cal, t.dueOn, t.peopleIds, nameOf));
    return map;
  }, [allTasks, cal, nameOf]);

  const canMove = React.useCallback(
    (t: TaskEvent) => {
      const board = ws.boardById(t.boardId);
      return !!board && canEditBoard(ws.permissions, board) && (t.dateColumn.type === "DATE" || t.dateColumn.type === "TIMELINE");
    },
    [ws],
  );

  const moveTask = React.useCallback(
    async (t: TaskEvent, fromDay: ISODate, toDay: ISODate) => {
      const board = ws.boardById(t.boardId) as Board | undefined;
      if (!board || !canMove(t)) return;
      const shift = Math.round((isoToUtc(toDay) - isoToUtc(fromDay)) / 86_400_000);
      if (!shift) return;
      const column = t.dateColumn;
      try {
        const item = await services.repos.items.getById(t.itemId);
        if (!item) throw new Error("The task is gone");
        const current = (await services.repos.items.listValuesByItem(t.itemId)).find((v) => v.columnId === column.id)?.value;
        let value: ColumnValue;
        if (column.type === "TIMELINE") {
          if (current?.type !== "TIMELINE") throw new Error("The task's dates changed. Try again.");
          value = { type: "TIMELINE", start: current.start ? addDaysIso(current.start, shift) : null, end: current.end ? addDaysIso(current.end, shift) : null };
        } else value = { type: "DATE", date: addDaysIso(t.dueOn ?? t.endsOn, shift) };
        await services.items.setValue(item.id, column.id, value, { column, item, board, users: ws.users }, me);
        toast.success(`${t.name} moved to ${shortDay(addDaysIso(t.dueOn ?? t.endsOn, shift))}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not move the task");
      } finally {
        void queryClient.invalidateQueries({ queryKey: [...calendarKeys.all(ws.workspace.id), "tasks"] });
      }
    },
    [ws, services, me, queryClient, canMove],
  );

  // ---- the open task ----
  const openTaskId = params.get("task");
  const openBoardId = params.get("board");
  const closeTask = React.useCallback(() => {
    replaceParams({ task: null, board: null });
    void queryClient.invalidateQueries({ queryKey: [...calendarKeys.all(ws.workspace.id), "tasks"] });
  }, [replaceParams, queryClient, ws.workspace.id]);

  const [dialog, setDialog] = React.useState<DialogState>(null);
  const close = () => setDialog(null);

  const actions: CalendarActions = {
    openTask: (t) => replaceParams({ task: t.itemId, board: t.boardId }),
    prefetchTask: (t) => prefetchTaskPanel(queryClient, services, t.itemId),
    moveTask: (t, from, to) => void moveTask(t, from, to),
    openLeave: (entry) => setDialog({ kind: "leave", entry }),
    addLeave: (day, userId) => (isAdmin || !userId || userId === me ? setDialog({ kind: "leave", day, userId }) : undefined),
    openHoliday: (holiday) => setDialog({ kind: "holiday", holiday }),
    openKeyDate: (keyDate) => setDialog({ kind: "keyDate", keyDate }),
    addHoliday: isAdmin ? (day) => setDialog({ kind: "holiday", day }) : undefined,
    addKeyDate: isAdmin ? (day) => setDialog({ kind: "keyDate", day }) : undefined,
    showDay: (day) => setDialog({ kind: "day", day }),
  };

  const load = React.useMemo(() => (view === "year" ? new Map<EntityId, Map<ISODate, number>>() : loadByPersonDay(tasks, cal, range.from, range.to)), [view, tasks, cal, range.from, range.to]);
  // The whole team's day: every person's hours of work against what they have.
  const teamLoad = React.useMemo(() => {
    const out = new Map<ISODate, { demand: number; capacity: number }>();
    if (view !== "month" && view !== "week") return out;
    let any = false;
    for (const days of load.values()) for (const [d, h] of days) {
      const cur = out.get(d) ?? { demand: 0, capacity: 0 };
      cur.demand += h;
      out.set(d, cur);
      any = any || h > 0;
    }
    if (!any) return new Map<ISODate, { demand: number; capacity: number }>();
    for (const d of daysBetween(range.from, range.to)) {
      const cur = out.get(d) ?? { demand: 0, capacity: 0 };
      cur.capacity = people.reduce((sum, u) => sum + dayCapacity(cal, hoursOf(u.id), d, u.id), 0);
      out.set(d, cur);
    }
    return out;
  }, [view, load, range.from, range.to, people, cal, hoursOf]);

  const data: CalendarData = {
    today,
    anchor,
    tasks,
    leave,
    holidays,
    keyDates,
    cal,
    people,
    userById: ws.userById,
    weeklyHours: hoursOf,
    conflictsOf: (t) => conflicts.get(t.itemId) ?? [],
    canMove,
    showHolidays: filters.layers.includes("holidays"),
    showKeyDates: filters.layers.includes("keyDates"),
    spans: filters.spans,
    teamLoad,
  };

  const awayToday = leaveOn(allLeave, today);
  const loading = holidaysQ.isLoading || leaveQ.isLoading || (showTasks && (taskRows.isLoading || columns.isLoading));
  const filterCount = activeFilterCount(filters);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Calendar"
        description={
          leaveQ.data ? (
            awayToday.length ? (
              <span className="inline-flex items-center gap-1.5" data-testid="calendar-away-today">
                {awayToday.slice(0, 4).map((l) => (
                  <UserAvatar key={l.id} user={ws.userById(l.userId)} size="xs" />
                ))}
                {awayToday.length} away today
              </span>
            ) : (
              "Everyone in today."
            )
          ) : (
            <SkeletonLine className="w-48" />
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "feed" })} data-testid="calendar-subscribe">
              <Link2 /> Subscribe
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="calendar-add">
                  <Plus /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog({ kind: "leave", day: today })} data-testid="calendar-add-leave">
                  <CalendarPlus /> Leave
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "holiday", day: today })} data-testid="calendar-add-holiday">
                    <Palmtree /> Holiday
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "keyDate", day: today })} data-testid="calendar-add-key-date">
                    <Flag /> Key date
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-7" data-testid="calendar-toolbar">
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => replaceParams({ d: stepAnchor(view, anchor, -1) })} data-testid="calendar-prev">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => replaceParams({ d: null })} data-testid="calendar-today">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="On" onClick={() => replaceParams({ d: stepAnchor(view, anchor, 1) })} data-testid="calendar-next">
            <ChevronRight />
          </Button>
        </div>
        <h2 className="min-w-36 px-1 text-[15px] font-semibold" data-testid="calendar-period">
          {periodLabel(view, anchor)}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div role="tablist" aria-label="View" className="flex rounded-lg border border-border/70 bg-surface p-0.5">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => replaceParams({ view: v })}
                className={cn("rounded-md px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground", view === v && "bg-card text-foreground shadow-xs")}
                data-testid={`calendar-view-${v}`}
              >
                {CALENDAR_VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <FilterButton filters={filters} count={filterCount} boards={boards} users={ws.activeUsers} onChange={setFilters} onPatch={patchFilters} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 sm:px-7">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {loading && !taskRows.data && !holidaysQ.data ? (
            <div className="grid gap-2 rounded-xl border border-border/70 p-4">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
            </div>
          ) : view === "month" ? (
            <MonthView data={data} actions={actions} />
          ) : view === "week" ? (
            <WeekView data={data} actions={actions} />
          ) : view === "agenda" ? (
            <AgendaView data={data} actions={actions} />
          ) : view === "roster" ? (
            <RosterView data={data} actions={actions} load={load} />
          ) : (
            <YearView data={data} onMonth={(d) => replaceParams({ view: "month", d })} />
          )}
        </div>
        {view !== "year" && view !== "roster" && <HeadsUp data={data} actions={actions} allTasks={tasks} conflicts={conflicts} cal={cal} today={today} onMove={(t, to) => void moveTask(t, t.dueOn ?? t.endsOn, to)} />}
      </div>

      {openTaskId && openBoardId && <TaskPanelHost key={openBoardId} boardId={openBoardId} itemId={openTaskId} onOpen={(id) => replaceParams({ task: id })} onClose={closeTask} popup />}

      <LeaveDialog
        open={dialog?.kind === "leave"}
        onOpenChange={(o) => !o && close()}
        workspaceId={ws.workspace.id}
        me={me}
        defaultUserId={dialog?.kind === "leave" ? dialog.userId : undefined}
        toEvents={toEvents}
        onOpenTask={(t) => (close(), actions.openTask(t))}
        isAdmin={isAdmin}
        people={ws.activeUsers}
        entry={dialog?.kind === "leave" ? dialog.entry : null}
        day={dialog?.kind === "leave" ? dialog.day : null}
      />
      <HolidayDialog open={dialog?.kind === "holiday"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} holiday={dialog?.kind === "holiday" ? dialog.holiday : null} day={dialog?.kind === "holiday" ? dialog.day : null} canEdit={isAdmin} />
      <KeyDateDialog open={dialog?.kind === "keyDate"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} keyDate={dialog?.kind === "keyDate" ? dialog.keyDate : null} day={dialog?.kind === "keyDate" ? dialog.day : null} canEdit={isAdmin} />
      <FeedDialog open={dialog?.kind === "feed"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} userId={me} />
      <Dialog open={dialog?.kind === "day"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="sr-only">Day</DialogTitle>
          {dialog?.kind === "day" && <DayDetail day={dialog.day} data={data} actions={actions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- filters -----------------------------------------------------------------------

function FilterButton({ filters, count, boards, users, onChange, onPatch }: { filters: CalendarFilters; count: number; boards: Board[]; users: User[]; onChange: (f: CalendarFilters) => void; onPatch: (p: Partial<CalendarFilters>) => void }) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="calendar-filter">
          <Filter /> Filter{count ? ` · ${count}` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div className="flex flex-wrap gap-1">
          {CALENDAR_LAYERS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={filters.layers.includes(l)}
              onClick={() => onPatch({ layers: toggle(filters.layers, l) })}
              className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", filters.layers.includes(l) ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground")}
              data-testid={`calendar-layer-${l}`}
            >
              {CALENDAR_LAYER_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <Label htmlFor="cal-mine" className="font-normal">
            Only mine
          </Label>
          <Switch id="cal-mine" checked={filters.mine} onCheckedChange={(mine) => onPatch({ mine })} />
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <Label htmlFor="cal-spans" className="font-normal">
            Whole timelines
          </Label>
          <Switch id="cal-spans" checked={filters.spans} onCheckedChange={(spans) => onPatch({ spans })} />
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <Label htmlFor="cal-done" className="font-normal">
            Show done
          </Label>
          <Switch id="cal-done" checked={filters.showDone} onCheckedChange={(showDone) => onPatch({ showDone })} />
        </div>
        <CheckList title="Boards" options={boards.map((b) => ({ id: b.id, label: b.name }))} selected={filters.boardIds} onToggle={(id) => onPatch({ boardIds: toggle(filters.boardIds, id) })} />
        <CheckList title="People" options={users.map((u) => ({ id: u.id, label: u.displayName }))} selected={filters.personIds} onToggle={(id) => onPatch({ personIds: toggle(filters.personIds, id) })} />
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CheckList({ title, options, selected, onToggle }: { title: string; options: { id: string; label: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="grid gap-1">
      <div className="text-[12px] font-medium text-muted-foreground">{title}</div>
      <div className="grid max-h-40 gap-0.5 overflow-y-auto">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-accent/60">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} className="accent-[var(--primary)]" />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---- heads-up ------------------------------------------------------------------------

/** What to plan around: the next break and the deadlines that clash. */
function HeadsUp({ data, actions, allTasks, conflicts, cal, today, onMove }: { data: CalendarData; actions: CalendarActions; allTasks: TaskEvent[]; conflicts: Map<EntityId, DateConflict[]>; cal: WorkingCalendar; today: ISODate; onMove: (t: TaskEvent, to: ISODate) => void }) {
  const crunch = crunchBefore(cal, today, 10);
  const clashes = allTasks.filter((t) => t.dueOn && t.dueOn >= today && (conflicts.get(t.itemId)?.length ?? 0) > 0).slice(0, 12);
  const daysLeft = crunch ? workingDaysBetween(cal, today, crunch.to) : 0;
  const dueBefore = crunch ? allTasks.filter((t) => !t.done && t.dueOn && t.dueOn >= today && t.dueOn <= crunch.to).length : 0;
  const breakDays = crunch ? daysBetween(crunch.holiday.startsOn, crunch.holiday.endsOn).length : 0;
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto xl:flex" data-testid="calendar-heads-up">
      {crunch && (
        <section className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/10" data-testid="calendar-next-break">
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
    </aside>
  );
}
