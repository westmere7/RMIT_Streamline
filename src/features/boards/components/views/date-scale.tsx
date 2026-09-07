"use client";

import { addDays, differenceInCalendarDays, format, isSameDay, isWeekend, startOfDay, startOfWeek, subDays } from "date-fns";
import * as React from "react";
import type { BoardColumn, ColorToken, Item } from "@/domain";
import { columnLabels, isStuckLabel } from "@/domain";
import type { BoardModel } from "@/features/boards/board-model";
import { colorClasses } from "@/lib/colors";
import { parseISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * The date axis the Timeline and Gantt share: one range, one zoom, one header,
 * so the two read the same and a reader who learns one has learnt the other.
 */
export type Zoom = "day" | "week" | "month";

export const ZOOM_OPTIONS: ReadonlyArray<{ value: Zoom; label: string }> = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
];

/** Pixels per day at each zoom. */
export const DAY_WIDTH: Record<Zoom, number> = { day: 30, week: 11, month: 4 };

export interface Scheduled {
  item: Item;
  start: Date;
  end: Date;
  /** True when the item has a due date only: drawn as a milestone, not a bar. */
  milestone: boolean;
}

/**
 * Where an item sits in time: its Timeline column, else its due date. Items
 * without either are returned separately so the view can say how many it is
 * not showing, instead of quietly dropping them.
 */
export function scheduleOf(model: BoardModel, item: Item): Scheduled | null {
  let start: Date | null = null;
  let end: Date | null = null;
  if (model.timelineColumn) {
    const v = model.getValue(item.id, model.timelineColumn.id);
    if (v?.type === "TIMELINE") {
      start = parseISODate(v.start);
      end = parseISODate(v.end);
    }
  }
  if (!start && !end) {
    const due = model.dueDateOf(item.id);
    const date = parseISODate(due);
    if (!date) return null;
    return { item, start: date, end: date, milestone: true };
  }
  return { item, start: start ?? end!, end: end ?? start!, milestone: false };
}

export interface DateRange {
  rangeStart: Date;
  rangeEnd: Date;
  totalDays: number;
  dayWidth: number;
  /** Pixel offset of a date's left edge from the range start. */
  x: (date: Date) => number;
  /** Pixel width of a span, inclusive of both ends. */
  width: (start: Date, end: Date) => number;
  todayX: number;
}

/** A range that holds every bar with some air either side, always including today. */
export function useDateRange(items: readonly Scheduled[], now: Date, zoom: Zoom): DateRange {
  return React.useMemo(() => {
    const dayWidth = DAY_WIDTH[zoom];
    const today = startOfDay(now);
    let min = today;
    let max = today;
    for (const s of items) {
      if (s.start < min) min = s.start;
      if (s.end > max) max = s.end;
    }
    const pad = zoom === "day" ? 4 : zoom === "week" ? 10 : 30;
    const rangeStart = startOfWeek(subDays(min, pad), { weekStartsOn: 1 });
    const rangeEnd = addDays(max, pad + 7);
    const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
    const x = (date: Date) => differenceInCalendarDays(date, rangeStart) * dayWidth;
    return {
      rangeStart,
      rangeEnd,
      totalDays,
      dayWidth,
      x,
      width: (start, end) => (differenceInCalendarDays(end, start) + 1) * dayWidth,
      todayX: x(today) + dayWidth / 2,
    };
  }, [items, now, zoom]);
}

/** The colour a bar takes: the item's status label when the board has one, else its group. */
export function barColor(model: BoardModel, item: Item, groupColor: ColorToken): { hex: string; token: ColorToken; stuck: boolean } {
  const column = model.statusColumn;
  if (column) {
    const v = model.getValue(item.id, column.id);
    const label = v?.type === "STATUS" ? columnLabels(column).find((l) => l.id === v.labelId) : undefined;
    if (label) return { hex: colorClasses(label.color).hex, token: label.color, stuck: isStuckLabel(column, label.id) };
  }
  return { hex: colorClasses(groupColor).hex, token: groupColor, stuck: false };
}

/** Diagonal hatching for stuck work, on top of the bar's own colour. */
export const STUCK_STRIPES = "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 4px, transparent 4px 8px)";

/** Month row plus a day or week row, matching the zoom. Sticky at the top of the scroller. */
export function DateScaleHeader({ range, zoom, now, labelWidth, className }: { range: DateRange; zoom: Zoom; now: Date; labelWidth: number; className?: string }) {
  const days = React.useMemo(() => Array.from({ length: range.totalDays }, (_, i) => addDays(range.rangeStart, i)), [range]);
  const months = React.useMemo(() => {
    const out: Array<{ label: string; days: number }> = [];
    for (const day of days) {
      const label = format(day, zoom === "month" ? "MMM yyyy" : "MMMM yyyy");
      const last = out[out.length - 1];
      if (last && last.label === label) last.days += 1;
      else out.push({ label, days: 1 });
    }
    return out;
  }, [days, zoom]);
  const weeks = React.useMemo(() => days.filter((d) => d.getDay() === 1), [days]);
  return (
    <div className={cn("sticky top-0 z-10 flex bg-background", className)}>
      <div className="sticky left-0 z-20 shrink-0 border-r border-b bg-background" style={{ width: labelWidth }} />
      <div>
        <div className="flex border-b">
          {months.map((m, i) => (
            <div key={`${m.label}-${i}`} style={{ width: m.days * range.dayWidth }} className="truncate border-r px-2 py-1 text-2xs font-semibold text-muted-foreground">
              {m.days * range.dayWidth > 40 ? m.label : ""}
            </div>
          ))}
        </div>
        {zoom === "day" ? (
          <div className="flex border-b">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                style={{ width: range.dayWidth }}
                className={cn("py-1 text-center text-2xs tabular", isWeekend(day) ? "bg-surface text-muted-foreground/60" : "text-muted-foreground", isSameDay(day, now) && "font-semibold text-primary")}
                title={format(day, "EEEE d MMMM")}
              >
                {format(day, "d")}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative h-6 border-b">
            {weeks.map((monday) => (
              <div
                key={monday.toISOString()}
                className={cn("absolute top-0 flex h-full items-center border-l border-border/60 pl-1 text-2xs tabular text-muted-foreground", isSameDay(startOfWeek(now, { weekStartsOn: 1 }), monday) && "font-semibold text-primary")}
                style={{ left: range.x(monday), width: range.dayWidth * 7 }}
              >
                {zoom === "week" || monday.getDate() <= 7 ? format(monday, "d MMM") : ""}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Weekend shading and week gridlines behind one row of bars. */
export function RowBackdrop({ range, zoom }: { range: DateRange; zoom: Zoom }) {
  const marks = React.useMemo(() => {
    const out: Array<{ left: number; width: number; weekend: boolean }> = [];
    for (let i = 0; i < range.totalDays; i += 1) {
      const day = addDays(range.rangeStart, i);
      if (zoom === "day" && isWeekend(day)) out.push({ left: i * range.dayWidth, width: range.dayWidth, weekend: true });
      if (zoom !== "day" && day.getDay() === 1) out.push({ left: i * range.dayWidth, width: 1, weekend: false });
    }
    return out;
  }, [range, zoom]);
  return (
    <>
      {marks.map((m, i) => (
        <div key={i} aria-hidden className={cn("absolute inset-y-0", m.weekend ? "bg-surface/70" : "bg-border/50")} style={{ left: m.left, width: m.width }} />
      ))}
    </>
  );
}

/** The thin line marking today, with a tag at the top. */
export function TodayLine({ range, labelWidth, showTag }: { range: DateRange; labelWidth: number; showTag?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-primary/70" style={{ left: labelWidth + range.todayX }}>
      {showTag && <span className="absolute -top-0 left-1 rounded-b bg-primary px-1 text-[9px] font-semibold text-white">Today</span>}
    </div>
  );
}

/** Scrolls a date scroller so today sits a third of the way in, once per board and zoom. */
export function useScrollToToday(scroller: React.RefObject<HTMLDivElement | null>, range: DateRange, labelWidth: number, key: string) {
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, labelWidth + range.todayX - el.clientWidth / 3) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board and zoom; the reader's own scrolling is left alone afterwards
  }, [key]);
  return () => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, labelWidth + range.todayX - el.clientWidth / 3), behavior: "smooth" });
  };
}

export type { BoardColumn };
