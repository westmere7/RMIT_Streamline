"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { toISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

export function CalendarView() {
  const { model, openItem, now } = useBoardContext();
  const [month, setMonth] = React.useState(() => startOfMonth(now));

  const byDate = React.useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; color: string; done: boolean }>>();
    for (const group of model.groups) {
      for (const item of model.itemsByGroup.get(group.id) ?? []) {
        const due = model.dueDateOf(item.id);
        if (!due) continue;
        const list = map.get(due) ?? [];
        list.push({ id: item.id, name: item.name, color: group.color, done: model.isDone(item.id) });
        map.set(due, list);
      }
    }
    return map;
  }, [model]);

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="calendar">
      <div className="flex items-center gap-2 px-4 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight />
        </Button>
        <h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setMonth(startOfMonth(now))}>
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7 border-b border-t text-center text-2xs font-medium text-muted-foreground">
        {weekdays.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="scrollbar-thin grid flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {days.map((day) => {
          const key = toISODate(day);
          const items = byDate.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          const today = isSameDay(day, now);
          return (
            <div key={key} className={cn("min-h-24 border-r border-b p-1", !inMonth && "bg-surface/60")}>
              <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular", today ? "bg-primary font-semibold text-white" : inMonth ? "text-foreground" : "text-muted-foreground/50")}>
                {format(day, "d")}
              </div>
              <ul className="space-y-0.5">
                {items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item.id)}
                      title={item.name}
                      className={cn("flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-2xs hover:bg-accent", item.done && "text-muted-foreground line-through")}
                    >
                      <span className={cn("size-1.5 shrink-0 rounded-full", colorClasses(item.color as never).dot)} />
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))}
                {items.length > 4 && <li className="px-1 text-2xs text-muted-foreground">+{items.length - 4} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
