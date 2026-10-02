import { addDays, differenceInCalendarDays, isWeekend } from "date-fns";
import type { AssetRates, ItemAsset } from "@/domain";
import { assetCount, effortHours, WORKING_DAYS_PER_WEEK } from "@/domain";
import { parseISODate, toISODate } from "@/lib/dates/dates";
import { itemDueDate, type AggregateContext, type LoadLevel, type Period, type PeriodKind, type WorkloadMode } from "./view-aggregates";

/**
 * Hours against capacity, for the Workload view: what each person's tasks need
 * in a week (or a day), set against the hours they have in it.
 *
 * A task's hours are its deliverables weighed by the workspace's output rates
 * (Settings → Lists), shared evenly between its owners. A task with no rated
 * deliverables needs no hours here, and the view says how many those are
 * rather than guessing for them.
 */

type Line = Pick<ItemAsset, "assetType" | "quantity">;

/** Hours one task's deliverables take at the workspace's rates. */
export function itemHours(lines: ReadonlyArray<Line> | undefined, rates: AssetRates): number {
  if (!lines?.length) return 0;
  return effortHours(
    lines.map((line) => ({ type: line.assetType ?? "", units: assetCount(line) })),
    rates,
  );
}

/**
 * Where a task's hours fall across the periods. In "active" mode they are
 * spread evenly over the working days of its timeline (every day, if it only
 * covers a weekend), so a fortnight's job puts half in each week; days outside
 * the window are simply not shown. Otherwise, and for a task with only a due
 * date, all of it lands in the period holding the due date.
 */
export function spreadHours(itemId: string, hours: number, periodList: ReadonlyArray<Period>, ctx: Pick<AggregateContext, "columns" | "getValue">, mode: WorkloadMode): number[] {
  const out = periodList.map(() => 0);
  if (hours <= 0 || periodList.length === 0) return out;
  const indexOf = (iso: string) => periodList.findIndex((p) => p.startIso <= iso && iso <= p.endIso);
  if (mode === "active") {
    const timeline = ctx.columns.find((c) => c.type === "TIMELINE");
    const v = timeline ? ctx.getValue(itemId, timeline.id) : undefined;
    if (v?.type === "TIMELINE" && (v.start || v.end)) {
      const start = parseISODate(v.start ?? v.end);
      const end = parseISODate(v.end ?? v.start);
      if (start && end && end >= start) {
        const span = differenceInCalendarDays(end, start) + 1;
        const all = Array.from({ length: span }, (_, i) => addDays(start, i));
        const working = all.filter((d) => !isWeekend(d));
        const days = working.length ? working : all;
        for (const day of days) {
          const i = indexOf(toISODate(day));
          if (i >= 0) out[i]! += hours / days.length;
        }
        return out;
      }
    }
  }
  const due = itemDueDate(itemId, ctx);
  if (!due) return out;
  const i = indexOf(due);
  if (i >= 0) out[i] = hours;
  return out;
}

/** The hours someone has in one period: their week, or a fifth of it on a working day. */
export function periodCapacity(weeklyHours: number, period: Period, kind: PeriodKind): number {
  if (kind === "weeks") return weeklyHours;
  return isWeekend(period.start) ? 0 : weeklyHours / WORKING_DAYS_PER_WEEK;
}

/** Booked against available: under 85% is room to spare, up to 100% is full, past it is too much. */
export function utilisationLevel(booked: number, capacity: number): LoadLevel {
  if (booked <= 0.05) return 0;
  if (capacity <= 0) return 3;
  const share = booked / capacity;
  if (share <= 0.85) return 1;
  if (share <= 1.0001) return 2;
  return 3;
}

/** "7.5 h", "12 h", "<1 h": hours as a cell reads them. */
export function formatHours(hours: number): string {
  if (hours <= 0) return "0 h";
  if (hours < 1) return "<1 h";
  return `${hours < 10 ? (Math.round(hours * 2) / 2).toString() : Math.round(hours)} h`;
}
