"use client";

import { addDays, differenceInCalendarDays, format, isSameDay, isWeekend, startOfDay, subDays } from "date-fns";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { parseISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

const DAY_WIDTH = 28;
const LABEL_WIDTH = 260;

interface Bar {
  itemId: string;
  name: string;
  start: Date;
  end: Date;
  color: string;
  done: boolean;
  groupName: string;
}

export function TimelineView() {
  const { model, openItem, now } = useBoardContext();
  const bars = React.useMemo<Bar[]>(() => {
    const result: Bar[] = [];
    for (const group of model.groups) {
      for (const item of model.itemsByGroup.get(group.id) ?? []) {
        let start: Date | null = null;
        let end: Date | null = null;
        if (model.timelineColumn) {
          const v = model.getValue(item.id, model.timelineColumn.id);
          if (v?.type === "TIMELINE") {
            start = parseISODate(v.start);
            end = parseISODate(v.end);
          }
        }
        if (!start && !end && model.dateColumn) {
          const v = model.getValue(item.id, model.dateColumn.id);
          if (v?.type === "DATE") end = parseISODate(v.date);
        }
        if (!start && !end) continue;
        result.push({ itemId: item.id, name: item.name, start: start ?? end!, end: end ?? start!, color: colorClasses(group.color).hex, done: model.isDone(item.id), groupName: group.name });
      }
    }
    return result;
  }, [model]);

  if (bars.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface/50">
        <EmptyState title="Nothing to plot yet" description="Add a Timeline or Date column value to items to see them here." />
      </div>
    );
  }

  const lastBarId = bars[bars.length - 1]!.itemId;
  const minStart = bars.reduce((min, b) => (b.start < min ? b.start : min), bars[0]!.start);
  const maxEnd = bars.reduce((max, b) => (b.end > max ? b.end : max), bars[0]!.end);
  const rangeStart = startOfDay(subDays(minStart < now ? minStart : now, 3));
  const rangeEnd = addDays(maxEnd > now ? maxEnd : now, 7);
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));
  const todayOffset = differenceInCalendarDays(startOfDay(now), rangeStart);

  const months: Array<{ label: string; days: number }> = [];
  for (const day of days) {
    const label = format(day, "MMMM yyyy");
    const last = months[months.length - 1];
    if (last && last.label === label) last.days += 1;
    else months.push({ label, days: 1 });
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-auto bg-surface/50 pl-6" data-testid="timeline">
      <div style={{ width: LABEL_WIDTH + totalDays * DAY_WIDTH }} className="relative my-4 mr-6 rounded-xl border border-border/60 bg-background shadow-xs">
        <div className="sticky top-0 z-10 flex rounded-t-xl bg-background">
          <div className="sticky left-0 z-20 shrink-0 rounded-tl-xl border-r border-b bg-background" style={{ width: LABEL_WIDTH }} />
          <div>
            <div className="flex border-b">
              {months.map((m) => (
                <div key={m.label} style={{ width: m.days * DAY_WIDTH }} className="truncate border-r px-2 py-1 text-2xs font-semibold text-muted-foreground">
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex border-b">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  style={{ width: DAY_WIDTH }}
                  className={cn("py-1 text-center text-2xs tabular", isWeekend(day) ? "bg-surface text-muted-foreground/60" : "text-muted-foreground", isSameDay(day, now) && "font-semibold text-primary")}
                >
                  {format(day, "d")}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-primary/70" style={{ left: LABEL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }} />
          {model.groups.map((group) => {
            const groupBars = bars.filter((b) => b.groupName === group.name);
            if (groupBars.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="flex h-8 items-center">
                  <div className={cn("sticky left-0 z-[2] flex h-full items-center border-r bg-background px-3 text-xs font-semibold", colorClasses(group.color).text)} style={{ width: LABEL_WIDTH }}>
                    {group.name}
                  </div>
                </div>
                {groupBars.map((bar) => {
                  const offset = differenceInCalendarDays(bar.start, rangeStart);
                  const span = differenceInCalendarDays(bar.end, bar.start) + 1;
                  return (
                    <div key={bar.itemId} className={cn("flex h-9 items-center border-b border-border/60", bar.itemId === lastBarId && "border-b-0")}>
                      <div className="sticky left-0 z-[2] h-full shrink-0 border-r bg-background" style={{ width: LABEL_WIDTH }}>
                        <button type="button" onClick={() => openItem(bar.itemId)} className={cn("flex h-full w-full items-center truncate px-3 pl-6 text-left text-[13px] hover:underline", bar.done && "text-muted-foreground line-through")}>
                          <span className="truncate">{bar.name}</span>
                        </button>
                      </div>
                      <div className="relative h-full flex-1">
                        {days.map((day) => isWeekend(day) ? <div key={day.toISOString()} aria-hidden className="absolute inset-y-0 bg-surface/70" style={{ left: differenceInCalendarDays(day, rangeStart) * DAY_WIDTH, width: DAY_WIDTH }} /> : null)}
                        <button
                          type="button"
                          onClick={() => openItem(bar.itemId)}
                          title={`${bar.name}: ${format(bar.start, "MMM d")} – ${format(bar.end, "MMM d")}`}
                          className={cn("absolute top-1.5 h-6 rounded-full px-2 text-left text-2xs font-medium text-white shadow-xs hover:brightness-95", bar.done && "opacity-50")}
                          style={{ left: offset * DAY_WIDTH + 2, width: Math.max(span * DAY_WIDTH - 4, DAY_WIDTH - 4), backgroundColor: bar.color }}
                        >
                          <span className="block truncate">{span >= 3 ? bar.name : ""}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
