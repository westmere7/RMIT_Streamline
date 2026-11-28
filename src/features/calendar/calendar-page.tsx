"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Filter, Flag, Link2, Palmtree, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { Board, CalendarKeyDate, CalendarTaskRow, ColorToken, DateConflict, EntityId, ISODate, LeaveEntry, User, WorkingCalendar, WorkspaceHoliday } from "@/domain";
import { dueDateConflicts, normaliseAssetRates } from "@/domain";
import { FeedDialog, HolidayDialog, KeyDateDialog, LeaveDialog } from "@/features/calendar/dialogs";
import { createFocusStore, useFocus, type FocusStore } from "@/features/calendar/focus";
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
  periodLabel,
  readView,
  shortDay,
  stepAnchor,
  taskCountByDay,
  todayInVietnam,
  viewRange,
  type CalendarFilters,
} from "@/features/calendar/model";
import { DayPanel, HeatLegend, HeatWeek, HeatYear, type DayPanelProps, type HeatProps } from "@/features/calendar/views";
import { useServices } from "@/features/data/data-context";
import { TaskPanelHost } from "@/features/items/task-panel-host";
import { prefetchTaskPanel } from "@/features/items/task-prefetch";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { canViewBoard, isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

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
  | null;

/**
 * The workspace Calendar: the year (or a week) as heat, each day shaded by the
 * tasks active on it, holidays and closures marked; beside it the day under
 * the pointer, or the one clicked, with its tasks. No text on the days.
 */
export function CalendarPage() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  // The panel sits beside the calendar from 1024 px; below that it stacks under it.
  const wide = useMediaQuery("(min-width: 1024px)");
  const me = ws.currentUser.id;
  const isAdmin = isWorkspaceAdmin(ws.permissions);
  const [today] = React.useState(() => todayInVietnam());
  const [focusStore] = React.useState(createFocusStore);
  const [pinned, setPinned] = React.useState<ISODate>(today);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // ---- where we are: in the address, so a link opens the same view ----
  const view = readView(params.get("view"), isMobile ? "week" : "year");
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
  const departments = useWorkspaceList(ws.workspace.id, "STAKEHOLDER_GROUPS");

  const rates = React.useMemo(() => normaliseAssetRates(ws.workspace.assetRates), [ws.workspace.assetRates]);
  const allTasks = React.useMemo(() => (taskRows.data && columns.data ? buildTaskEvents(taskRows.data, columns.data, rates) : []), [taskRows.data, columns.data, rates]);
  const tasks = React.useMemo(() => filterTasks(allTasks, filters, me, visibleBoards), [allTasks, filters, me, visibleBoards]);
  const toEvents = React.useCallback((rows: CalendarTaskRow[]) => (columns.data ? buildTaskEvents(rows, columns.data, rates).filter((t) => visibleBoards.has(t.boardId)) : []), [columns.data, rates, visibleBoards]);
  const holidays = React.useMemo(() => holidaysQ.data ?? [], [holidaysQ.data]);
  const allLeave = React.useMemo(() => leaveQ.data ?? [], [leaveQ.data]);
  const leave = React.useMemo(() => filterLeave(allLeave, filters, me), [allLeave, filters, me]);
  const keyDates = React.useMemo(() => keyDatesQ.data ?? [], [keyDatesQ.data]);
  const cal = React.useMemo<WorkingCalendar>(() => ({ holidays, leave: allLeave.filter((l) => l.status === "PLANNED") }), [holidays, allLeave]);
  const nameOf = React.useCallback((id: EntityId) => ws.userById(id)?.displayName ?? "Someone", [ws]);
  const conflicts = React.useMemo(() => {
    const map = new Map<EntityId, DateConflict[]>();
    for (const t of allTasks) if (t.dueOn && !t.done) map.set(t.itemId, dueDateConflicts(cal, t.dueOn, t.peopleIds, nameOf));
    return map;
  }, [allTasks, cal, nameOf]);

  // Every task counts on every day it runs: the day's shade is what the team is carrying then.
  const counts = React.useMemo(() => taskCountByDay(tasks, range.from, range.to, true), [tasks, range.from, range.to]);
  const max = React.useMemo(() => Math.max(0, ...counts.values()), [counts]);
  const shownHolidays = filters.layers.includes("holidays") ? holidays : [];

  // ---- the open task ----
  const openTaskId = params.get("task");
  const openBoardId = params.get("board");
  const closeTask = React.useCallback(() => {
    replaceParams({ task: null, board: null });
    void queryClient.invalidateQueries({ queryKey: [...calendarKeys.all(ws.workspace.id), "tasks"] });
  }, [replaceParams, queryClient, ws.workspace.id]);

  const [dialog, setDialog] = React.useState<DialogState>(null);
  const close = () => setDialog(null);

  const pin = (day: ISODate) => {
    setPinned(day);
    focusStore.set({ day: null });
    // Stacked (a phone), the panel is below the calendar: bring it up.
    if (!wide) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const heat: HeatProps = { today, pinned, counts, max, holidays: shownHolidays, onHover: (day) => focusStore.set({ day }), onPin: pin };

  const departmentColor = React.useCallback((name: string): ColorToken => departments.find((d) => d.name.toLowerCase() === name.toLowerCase())?.color ?? "gray", [departments]);
  const panel: Omit<DayPanelProps, "day"> = {
    today,
    tasks,
    leave,
    holidays: shownHolidays,
    keyDates: filters.layers.includes("keyDates") ? keyDates : [],
    userById: ws.userById,
    boardName: (id) => ws.boardById(id)?.name ?? "",
    boardColor: (id) => (ws.boardById(id)?.color as ColorToken | undefined) ?? "gray",
    departmentColor,
    conflictsOf: (t) => conflicts.get(t.itemId) ?? [],
    openTask: (t) => replaceParams({ task: t.itemId, board: t.boardId }),
    prefetchTask: (t) => prefetchTaskPanel(queryClient, services, t.itemId),
    openLeave: (entry) => setDialog({ kind: "leave", entry }),
    openHoliday: (holiday) => setDialog({ kind: "holiday", holiday }),
    openKeyDate: (keyDate) => setDialog({ kind: "keyDate", keyDate }),
    addLeave: (day) => setDialog({ kind: "leave", day }),
    addHoliday: isAdmin ? (day) => setDialog({ kind: "holiday", day }) : undefined,
    addKeyDate: isAdmin ? (day) => setDialog({ kind: "keyDate", day }) : undefined,
  };

  const awayToday = leaveOn(allLeave, today);
  const loading = !holidaysQ.data || (showTasks && (taskRows.isLoading || columns.isLoading));
  const filterCount = activeFilterCount(filters);
  const year = anchor.slice(0, 4);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", !wide && "overflow-y-auto")} data-testid="calendar-page">
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
                <DropdownMenuItem onSelect={() => setDialog({ kind: "leave", day: pinned })} data-testid="calendar-add-leave">
                  <CalendarPlus /> Leave
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "holiday", day: pinned })} data-testid="calendar-add-holiday">
                    <Palmtree /> Holiday
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "keyDate", day: pinned })} data-testid="calendar-add-key-date">
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
          <Button variant="outline" size="sm" onClick={() => (replaceParams({ d: null }), setPinned(today))} data-testid="calendar-today">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="On" onClick={() => replaceParams({ d: stepAnchor(view, anchor, 1) })} data-testid="calendar-next">
            <ChevronRight />
          </Button>
        </div>
        <h2 className="min-w-28 px-1 text-[15px] font-semibold" data-testid="calendar-period">
          {periodLabel(view, anchor)}
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          <div role="tablist" aria-label="View" className="flex rounded-lg border border-border/70 bg-surface p-0.5">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => replaceParams({ view: v, d: v === "week" ? pinned : null })}
                className={cn("shrink-0 rounded-md px-3 py-1 text-[12.5px] font-medium text-muted-foreground max-md:py-2", view === v && "bg-card text-foreground shadow-xs")}
                data-testid={`calendar-view-${v}`}
              >
                {CALENDAR_VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <FilterButton filters={filters} count={filterCount} boards={boards} users={ws.activeUsers} onChange={setFilters} onPatch={patchFilters} />
        </div>
      </div>

      <div className={cn("flex gap-3 px-4 pb-4 sm:px-7", wide ? "min-h-0 flex-1" : "flex-col")} data-testid="calendar-body">
        <section className={cn("flex min-w-0 flex-1 flex-col gap-4 rounded-xl border border-border/70 bg-card p-4", wide && "min-h-0 overflow-y-auto")} data-testid="calendar-main" data-view={view}>
          <div>
            <h3 className="text-[14px] font-semibold">{view === "year" ? `${year} workload` : `Week of ${shortDay(range.from)}`}</h3>
            <p className="text-[12px] text-muted-foreground">Shaded by tasks active that day. Hover a day for its tasks, click to pin it.</p>
          </div>
          {loading && !taskRows.data ? (
            <div className="grid gap-2">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
            </div>
          ) : view === "year" ? (
            <HeatYear year={year} props={heat} />
          ) : (
            <HeatWeek from={range.from} props={heat} />
          )}
          <div className="mt-auto border-t border-border/60 pt-3">
            <HeatLegend />
          </div>
        </section>
        <aside ref={panelRef} className={cn("scroll-mt-4 rounded-xl border border-border/70 bg-card p-4", wide ? "scrollbar-thin w-[22rem] shrink-0 overflow-y-auto xl:w-[24rem]" : "")} data-testid="calendar-panel">
          <PanelDay store={focusStore} pinned={pinned} panel={panel} />
        </aside>
      </div>

      {openTaskId && openBoardId && <TaskPanelHost key={openBoardId} boardId={openBoardId} itemId={openTaskId} onOpen={(id) => replaceParams({ task: id })} onClose={closeTask} popup />}

      <LeaveDialog
        open={dialog?.kind === "leave"}
        onOpenChange={(o) => !o && close()}
        workspaceId={ws.workspace.id}
        me={me}
        defaultUserId={dialog?.kind === "leave" ? dialog.userId : undefined}
        toEvents={toEvents}
        onOpenTask={(t) => (close(), panel.openTask(t))}
        isAdmin={isAdmin}
        people={ws.activeUsers}
        entry={dialog?.kind === "leave" ? dialog.entry : null}
        day={dialog?.kind === "leave" ? dialog.day : null}
      />
      <HolidayDialog open={dialog?.kind === "holiday"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} holiday={dialog?.kind === "holiday" ? dialog.holiday : null} day={dialog?.kind === "holiday" ? dialog.day : null} canEdit={isAdmin} />
      <KeyDateDialog open={dialog?.kind === "keyDate"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} keyDate={dialog?.kind === "keyDate" ? dialog.keyDate : null} day={dialog?.kind === "keyDate" ? dialog.day : null} canEdit={isAdmin} />
      <FeedDialog open={dialog?.kind === "feed"} onOpenChange={(o) => !o && close()} workspaceId={ws.workspace.id} userId={me} />
    </div>
  );
}

/** The day under the pointer, else the pinned one. Reads the hover store, so only the panel re-renders on hover. */
function PanelDay({ store, pinned, panel }: { store: FocusStore; pinned: ISODate; panel: Omit<DayPanelProps, "day"> }) {
  const focus = useFocus(store);
  return <DayPanel {...panel} day={focus.day ?? pinned} />;
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
          <Label htmlFor="cal-done" className="font-normal">
            Count done work
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
