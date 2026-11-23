"use client";

import * as React from "react";
import { ACTIVITY_HEX, ACTIVITY_SHADES, activityCalendar, activityCount, activityLevel, activityRange, type ActivityDay, type ActivityKind } from "@/features/dashboard/activity";
import { ChartTooltip, formatCount, useSize } from "@/features/dashboard/charts/chart-utils";
import { PanelHelp } from "@/features/dashboard/components/panel-help";
import type { ChartGeometry } from "@/features/dashboard/components/year-comparison";
import { amountOfTasks, useDrill } from "@/features/dashboard/drill/drill";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
/** The columns a month can need: a 31-day month starting on a Sunday spans six weeks. */
const MONTH_COLUMNS = 6;
const TOP = 4;
const MAX_STEP = 17;

const longDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;
/** Monday is 0. */
const weekdayOf = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * The year of work day by day, under the "by month" chart in the same panel:
 * each month a block of week columns (Monday at the top) in the same column as
 * that month's bars, the chart's month labels between the two. Hovering a month
 * on the chart lights its block; a day's square opens the tasks of that day,
 * the chart's bars still open the month.
 */
export function ActivityCalendar({
  facts,
  prefs,
  today,
  measure,
  valueOf,
  report,
  geometry,
  highlightMonth,
}: DashboardViewProps & {
  /** The chart's month columns; until it has drawn, a margin like its own. */
  geometry: ChartGeometry | null;
  /** The month hovered on the chart, lit here. */
  highlightMonth: number | null;
}) {
  const drill = useDrill();
  // The days count new work: the tasks started on each.
  const kind: ActivityKind = "started";
  const year = Number(report.period.current.from.slice(0, 4));
  const months = React.useMemo(() => geometry?.months ?? Array.from({ length: 12 }, (_, i) => i + 1), [geometry?.months]);
  const range = activityRange(year, months);
  const calendar = React.useMemo(
    () => activityCalendar(facts, { from: range.from, to: range.to, label: range.label, today, teamIds: prefs.teamIds, kind }),
    [facts, range.from, range.to, range.label, today, prefs.teamIds, kind],
  );
  const byMonth = React.useMemo(() => {
    const out = new Map<number, ActivityDay[]>();
    for (const day of calendar.weeks.flat()) {
      if (day.outside) continue;
      const month = Number(day.date.slice(5, 7));
      out.set(month, [...(out.get(month) ?? []), day]);
    }
    return out;
  }, [calendar]);

  const [hover, setHover] = React.useState<{ day: ActivityDay; x: number; y: number } | null>(null);
  const [boxRef, box] = useSize<HTMLDivElement>();
  const hex = ACTIVITY_HEX[kind];
  const padLeft = geometry?.padLeft ?? 38;
  const padRight = geometry?.padRight ?? 6;
  const width = Math.max(box.width, 320);
  const slot = (width - padLeft - padRight) / months.length;
  const step = Math.min(MAX_STEP, (slot - 4) / MONTH_COLUMNS);
  const cell = Math.max(2, step - Math.max(1.5, step * 0.18));
  const height = TOP + 7 * step;

  const verb = "started";
  const open = (day: ActivityDay) => {
    const tasks = day.started;
    if (!drill || tasks.length === 0) return;
    drill({ title: `${plural(tasks.length, "task")} ${verb}`, subtitle: longDate(day.date), tasks, amount: amountOfTasks(tasks, measure, valueOf) });
  };
  const shade = (level: number) => (level === 0 ? "var(--color-surface-strong)" : `color-mix(in oklab, ${hex} ${Math.round(ACTIVITY_SHADES[level]! * 100)}%, var(--color-surface-strong))`);

  return (
    <div className="mt-1 shrink-0" data-testid="dashboard-activity">
      <div ref={boxRef} className="relative w-full" onMouseLeave={() => setHover(null)} data-activity-box>
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full select-none" role="group" aria-label={`Tasks ${verb} per day, ${calendar.label}`} data-testid="dashboard-activity-grid">
          {WEEKDAYS.map((label, row) =>
            label ? (
              <text key={row} x={padLeft - 6} y={TOP + row * step + cell / 2 + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {label}
              </text>
            ) : null,
          )}
          {months.map((month, index) => {
            const days = byMonth.get(month) ?? [];
            const offset = days[0] ? weekdayOf(days[0].date) : 0;
            const columns = Math.ceil((offset + days.length) / 7);
            const left = padLeft + index * slot + (slot - columns * step) / 2;
            const lit = highlightMonth === month;
            const dim = highlightMonth !== null && !lit;
            return (
              <g key={month} data-month={month} data-testid="dashboard-activity-month" data-lit={lit || undefined}>
                {/* The month's column, lit when the chart above is on it, as the chart lights its own. */}
                <rect x={padLeft + index * slot} y={0} width={slot} height={height} rx={4} className={cn("fill-transparent transition-colors", lit && "fill-foreground/[0.06]")} />
                {days.map((day, i) => {
                  const count = activityCount(day, kind);
                  const clickable = !!drill && count > 0;
                  const level = activityLevel(count, calendar.thresholds);
                  return (
                    <rect
                      key={day.date}
                      x={left + Math.floor((offset + i) / 7) * step}
                      y={TOP + ((offset + i) % 7) * step}
                      width={cell}
                      height={cell}
                      rx={Math.min(3, cell / 4)}
                      style={{ fill: shade(level), opacity: day.future ? 0.35 : dim ? 0.3 : 1 }}
                      className={cn("outline-none transition-opacity duration-150 focus-visible:stroke-foreground", clickable && "cursor-pointer hover:stroke-foreground/60")}
                      strokeWidth={1}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={`${longDate(day.date)}: ${plural(count, "task")} ${verb}`}
                      data-date={day.date}
                      data-count={count}
                      data-testid="dashboard-activity-day"
                      onMouseEnter={(event) => {
                        const rect = (event.currentTarget as Element).closest("[data-activity-box]")?.getBoundingClientRect();
                        if (rect) setHover({ day, x: event.clientX - rect.left, y: event.clientY - rect.top });
                      }}
                      onClick={clickable ? () => open(day) : undefined}
                      onKeyDown={
                        clickable
                          ? (event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              open(day);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover && (
          <ChartTooltip x={hover.x} y={hover.y} width={box.width || 0} height={box.height || 0}>
            <p className="font-medium">{longDate(hover.day.date)}</p>
            {hover.day.future ? (
              <p className="text-muted-foreground">Not yet</p>
            ) : (
              <>
                <p className="font-medium">{plural(hover.day.started.length, "task")} started</p>
                {/* Names only where the tasks can be opened: a shared link carries none. */}
                {drill &&
                  hover.day.started.slice(0, 3).map((task) => (
                    <p key={task.id} className="mt-0.5 truncate text-2xs text-muted-foreground">
                      · {task.name || "Private task"}
                    </p>
                  ))}
                {drill && activityCount(hover.day, kind) > 0 && <p className="mt-1 text-2xs text-muted-foreground">Click for the tasks</p>}
              </>
            )}
          </ChartTooltip>
        )}
      </div>

      {/* The days' own line: what each square counts, its figures and its scale. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" data-testid="dashboard-activity-summary">
        <Stat value={formatCount(calendar.total)} label={`${calendar.total === 1 ? "task" : "tasks"} ${verb}${prefs.teamIds ? " · selected teams" : ""}`} testId="dashboard-activity-total" />
        <Stat value={formatCount(calendar.activeDays)} label={calendar.activeDays === 1 ? "active day" : "active days"} />
        {calendar.busiest && <Stat value={formatCount(calendar.busiest.count)} label={`on the busiest day, ${longDate(calendar.busiest.date)}`} />}
        <Stat value={formatCount(calendar.longestStreak)} label={`${calendar.longestStreak === 1 ? "day" : "days"} in the longest run`} />
        {calendar.currentStreak > 0 && <Stat value={formatCount(calendar.currentStreak)} label={`${calendar.currentStreak === 1 ? "day" : "days"} running now`} />}
        <span className="ml-auto flex items-center gap-1 text-2xs text-muted-foreground">
          <span aria-hidden className="flex items-center gap-1">
            Less
            {ACTIVITY_SHADES.map((_, level) => (
              <span key={level} className="size-2.5 rounded-[3px]" style={{ background: shade(level) }} />
            ))}
            More
          </span>
          <PanelHelp topic="activity" title="the days" />
        </span>
      </div>
    </div>
  );
}

function Stat({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-testid={testId}>
      <span className="text-sm font-semibold tabular">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
