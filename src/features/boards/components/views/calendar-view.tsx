"use client";

import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWeekend, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BoardGroup, ColumnLabel, Item, User } from "@/domain";
import { columnLabels, isStuckLabel } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { toISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { useViewSettings } from "./view-settings";
import { Segmented, ViewBar, ViewStat } from "./view-shell";

type Mode = "month" | "week";

interface Entry {
  item: Item;
  group: BoardGroup;
  status: ColumnLabel | null;
  stuck: boolean;
  priority: ColumnLabel | null;
  owners: User[];
  done: boolean;
}

/**
 * Due dates on a calendar. The month shows each day's items as compact chips —
 * status colour, name, owner — and folds the rest into "+N more" that opens in
 * place; the week gives every item a card with status, priority and owner.
 */
export function CalendarView() {
  const { model, users, openItem, now } = useBoardContext();
  const [settings, updateSettings] = useViewSettings("calendar", { mode: "month" as Mode });
  const mode = settings.mode;
  const setMode = (next: Mode) => updateSettings({ mode: next });
  const [cursor, setCursor] = React.useState(() => now);

  const byDate = React.useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const group of model.groups) {
      for (const item of model.itemsByGroup.get(group.id) ?? []) {
        const due = model.dueDateOf(item.id);
        if (!due) continue;
        const status = model.statusColumn ? model.getValue(item.id, model.statusColumn.id) : undefined;
        const statusLabel = model.statusColumn && status?.type === "STATUS" ? columnLabels(model.statusColumn).find((l) => l.id === status.labelId) ?? null : null;
        const priority = model.priorityColumn ? model.getValue(item.id, model.priorityColumn.id) : undefined;
        const priorityLabel = model.priorityColumn && priority?.type === "PRIORITY" ? columnLabels(model.priorityColumn).find((l) => l.id === priority.labelId) ?? null : null;
        const ownerIds = model.personColumns.flatMap((c) => {
          const v = model.getValue(item.id, c.id);
          return v?.type === "PERSON" ? v.userIds : [];
        });
        const list = map.get(due) ?? [];
        list.push({ item, group, status: statusLabel, stuck: isStuckLabel(model.statusColumn, statusLabel?.id), priority: priorityLabel, owners: [...new Set(ownerIds)].map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u), done: model.isDone(item.id) });
        map.set(due, list);
      }
    }
    return map;
  }, [model, users]);

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = mode === "month" ? eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }) : eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const inPeriod = (day: Date) => (mode === "month" ? isSameMonth(day, cursor) : true);
  const shown = days.filter(inPeriod).flatMap((d) => byDate.get(toISODate(d)) ?? []);
  const today = toISODate(now);
  const overdue = shown.filter((e) => !e.done && model.dueDateOf(e.item.id)! < today).length;
  const done = shown.filter((e) => e.done).length;
  const title = mode === "month" ? format(cursor, "MMMM yyyy") : `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM yyyy")}`;
  const step = (direction: -1 | 1) => setCursor((c) => (mode === "month" ? (direction < 0 ? subMonths(c, 1) : addMonths(c, 1)) : direction < 0 ? subWeeks(c, 1) : addWeeks(c, 1)));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="calendar">
      <ViewBar
        stats={
          <>
            <ViewStat value={shown.length} label={mode === "month" ? "due this month" : "due this week"} />
            {done > 0 && <ViewStat value={done} label="done" tone="good" />}
            {overdue > 0 && <ViewStat value={overdue} label="overdue" tone="warn" testId="calendar-overdue" />}
          </>
        }
      >
        <div className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={mode === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={mode === "month" ? "Next month" : "Next week"} onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
        <h3 className="text-sm font-semibold tabular" data-testid="calendar-title">{title}</h3>
        <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => setCursor(now)}>
          Today
        </Button>
        <Segmented value={mode} onChange={setMode} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }]} ariaLabel="Calendar layout" testId="calendar-mode" />
      </ViewBar>

      <div className="grid grid-cols-7 border-b text-center text-2xs font-medium text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className={cn("py-1", mode === "week" && isSameDay(d, now) && "text-primary")}>
            {mode === "month" ? format(d, "EEE") : format(d, "EEE d")}
          </div>
        ))}
      </div>

      {mode === "month" ? (
        <div className="scrollbar-thin grid flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
          {days.map((day) => {
            const key = toISODate(day);
            const entries = byDate.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const isNow = isSameDay(day, now);
            const visible = entries.slice(0, 3);
            return (
              <div key={key} className={cn("min-h-24 border-r border-b p-1", !inMonth && "bg-surface/60", isWeekend(day) && inMonth && "bg-surface/30")} data-testid={`calendar-day-${key}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular", isNow ? "bg-primary font-semibold text-white" : inMonth ? "text-foreground" : "text-muted-foreground/50")}>{format(day, "d")}</span>
                  {entries.length > 0 && <span className="pr-1 text-2xs text-muted-foreground tabular">{entries.length}</span>}
                </div>
                <ul className="space-y-0.5">
                  {visible.map((entry) => (
                    <li key={entry.item.id}>
                      <Chip entry={entry} late={!entry.done && key < today} onOpen={() => openItem(entry.item.id)} />
                    </li>
                  ))}
                  {entries.length > visible.length && (
                    <li>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="w-full rounded px-1 py-0.5 text-left text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" data-testid="calendar-more">
                            +{entries.length - visible.length} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-2">
                          <p className="mb-1.5 px-1 label-quiet">{format(day, "EEEE d MMMM")}</p>
                          <ul className="max-h-72 space-y-1 overflow-y-auto">
                            {entries.map((entry) => (
                              <li key={entry.item.id}>
                                <DayCard entry={entry} late={!entry.done && key < today} onOpen={() => openItem(entry.item.id)} />
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="scrollbar-thin grid flex-1 grid-cols-7 overflow-y-auto">
          {days.map((day) => {
            const key = toISODate(day);
            const entries = byDate.get(key) ?? [];
            const isNow = isSameDay(day, now);
            return (
              <div key={key} className={cn("min-h-40 space-y-1.5 border-r p-1.5", isWeekend(day) && "bg-surface/30", isNow && "bg-primary/[0.04]")} data-testid={`calendar-day-${key}`}>
                {entries.map((entry) => (
                  <DayCard key={entry.item.id} entry={entry} late={!entry.done && key < today} onOpen={() => openItem(entry.item.id)} />
                ))}
                {entries.length === 0 && <p className="px-1 pt-2 text-center text-2xs text-muted-foreground/50">—</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One line in a month cell: status colour, name, owner. */
function Chip({ entry, late, onOpen }: { entry: Entry; late: boolean; onOpen: () => void }) {
  const color = entry.status ? colorClasses(entry.status.color) : colorClasses(entry.group.color);
  return (
    <button type="button" onClick={onOpen} title={`${entry.item.name}${entry.status ? ` · ${entry.status.name}` : ""}${entry.owners.length ? ` · ${entry.owners.map((u) => u.displayName).join(", ")}` : ""}`} className={cn("flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-2xs hover:bg-accent", entry.done && "text-muted-foreground line-through")} data-testid="calendar-chip">
      <span className={cn("size-1.5 shrink-0 rounded-full", color.dot)} style={entry.stuck ? { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 2px)" } : undefined} />
      <span className="min-w-0 flex-1 truncate">{entry.item.name}</span>
      {late && <TriangleAlert className="size-2.5 shrink-0 text-red-600 dark:text-red-400" aria-label="Overdue" />}
      {entry.owners[0] && <UserAvatar user={entry.owners[0]} size="xs" tooltip={false} className="shrink-0 scale-75" />}
    </button>
  );
}

/** The week view's card, also used in the "+N more" list. */
function DayCard({ entry, late, onOpen }: { entry: Entry; late: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn("block w-full rounded-lg border border-border/60 bg-card p-2 text-left shadow-xs hover:shadow-md", entry.done && "opacity-70")} data-testid="calendar-card">
      <span className={cn("block text-xs font-medium leading-snug", entry.done && "line-through")}>{entry.item.name}</span>
      <span className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", colorClasses(entry.group.color).dot)} />
        <span className="truncate">{entry.group.name}</span>
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        {entry.status && <LabelPill label={entry.status} appearance="soft" size="sm" striped={entry.stuck} />}
        {entry.priority && <LabelPill label={entry.priority} appearance="soft" size="sm" />}
        {late && <TriangleAlert className="size-3 text-red-600 dark:text-red-400" aria-label="Overdue" />}
        {entry.owners.length > 0 && <AvatarStack users={entry.owners} size="xs" max={3} className="ml-auto" />}
      </span>
    </button>
  );
}
