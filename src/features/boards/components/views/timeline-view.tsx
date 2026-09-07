"use client";

import { format } from "date-fns";
import { CalendarX2, Crosshair, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { BoardGroup, Item, User } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { formatDateRange, toISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { barColor, DateScaleHeader, RowBackdrop, STUCK_STRIPES, TodayLine, useDateRange, useScrollToToday, ZOOM_OPTIONS, scheduleOf, type Scheduled, type Zoom } from "./date-scale";
import { useViewSettings } from "./view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewStat } from "./view-shell";

const LABEL_WIDTH = 280;
const ROW = 40;

/**
 * Every dated item as a bar under its group, on one shared date axis. Bars take
 * the item's status colour (hatched when stuck, faded when done), carry the
 * owner's avatar, and show their dates beside them when too short to hold a
 * label. Items with no date are counted and listed rather than dropped.
 */
export function TimelineView() {
  const { model, users, openItem, now } = useBoardContext();
  const [settings, updateSettings] = useViewSettings("timeline", { zoom: "day" as Zoom });
  const zoom = settings.zoom;
  const setZoom = (next: Zoom) => updateSettings({ zoom: next });
  const [showUnscheduled, setShowUnscheduled] = React.useState(false);

  const rows = React.useMemo(() => {
    const scheduled: Array<{ group: BoardGroup; bars: Scheduled[] }> = [];
    const unscheduled: Array<{ item: Item; group: BoardGroup }> = [];
    for (const group of model.groups) {
      const bars: Scheduled[] = [];
      for (const item of model.itemsByGroup.get(group.id) ?? []) {
        const s = scheduleOf(model, item);
        if (s) bars.push(s);
        else unscheduled.push({ item, group });
      }
      if (bars.length) scheduled.push({ group, bars });
    }
    return { scheduled, unscheduled };
  }, [model]);
  const all = React.useMemo(() => rows.scheduled.flatMap((g) => g.bars), [rows]);
  const range = useDateRange(all, now, zoom);
  const scroller = React.useRef<HTMLDivElement>(null);
  const boardId = model.groups[0]?.boardId ?? "";
  const scrollToToday = useScrollToToday(scroller, range, LABEL_WIDTH, `${boardId}:${zoom}`);
  const today = toISODate(now);
  const overdue = all.filter((s) => toISODate(s.end) < today && !model.isDone(s.item.id)).length;

  if (all.length === 0 && rows.unscheduled.length === 0) {
    return <ViewEmpty title="Nothing to plot yet" description="Add a Timeline or Date column value to items to see them here." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="timeline">
      <ViewBar
        stats={
          <>
            <ViewStat value={all.length} label="scheduled" />
            {overdue > 0 && <ViewStat value={overdue} label="overdue" tone="warn" testId="timeline-overdue" />}
            {rows.unscheduled.length > 0 && (
              <button type="button" onClick={() => setShowUnscheduled((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-accent hover:text-foreground" aria-pressed={showUnscheduled} data-testid="timeline-unscheduled">
                <CalendarX2 className="size-3" /> <span className="font-semibold text-foreground tabular">{rows.unscheduled.length}</span> without a date
              </button>
            )}
          </>
        }
      >
        <Segmented value={zoom} onChange={setZoom} options={ZOOM_OPTIONS} ariaLabel="Zoom" testId="timeline-zoom" />
        <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={scrollToToday}>
          <Crosshair /> Today
        </Button>
      </ViewBar>

      {all.length === 0 ? (
        <ViewEmpty title="Nothing on the calendar" description="Every item here is missing a date. Give them a Timeline or Due Date to place them." />
      ) : (
        <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-surface/50">
          <div style={{ width: LABEL_WIDTH + range.totalDays * range.dayWidth }} className="relative m-4 rounded-xl border border-border/60 bg-background shadow-xs">
            <DateScaleHeader range={range} zoom={zoom} now={now} labelWidth={LABEL_WIDTH} className="rounded-t-xl" />
            <div className="relative">
              <TodayLine range={range} labelWidth={LABEL_WIDTH} showTag />
              {rows.scheduled.map(({ group, bars }) => {
                const first = bars.reduce((min, b) => (b.start < min ? b.start : min), bars[0]!.start);
                const last = bars.reduce((max, b) => (b.end > max ? b.end : max), bars[0]!.end);
                return (
                  <div key={group.id} data-testid={`timeline-group-${group.name}`}>
                    <div className="flex h-8 items-center border-b border-border/60 bg-surface/40">
                      <div className={cn("sticky left-0 z-[2] flex h-full items-center gap-2 border-r bg-background px-3 text-xs font-semibold", colorClasses(group.color).text)} style={{ width: LABEL_WIDTH }}>
                        <span className={cn("size-2 rounded-full", colorClasses(group.color).dot)} />
                        <span className="truncate">{group.name}</span>
                        <span className="ml-auto font-normal text-muted-foreground tabular">{bars.length}</span>
                      </div>
                      <div className="relative h-full flex-1">
                        {/* The group's whole span, so a glance shows when a phase runs. */}
                        <div aria-hidden className="absolute top-3 h-1.5 rounded-full opacity-40" style={{ left: range.x(first), width: range.width(first, last), backgroundColor: colorClasses(group.color).hex }} />
                        <span className="absolute top-1 text-2xs text-muted-foreground tabular" style={{ left: range.x(last) + range.width(last, last) + 6 }}>
                          {formatDateRange(toISODate(first), toISODate(last))}
                        </span>
                      </div>
                    </div>
                    {bars.map((bar) => (
                      <BarRow key={bar.item.id} bar={bar} group={group} range={range} zoom={zoom} users={users} today={today} onOpen={() => openItem(bar.item.id)} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showUnscheduled && rows.unscheduled.length > 0 && (
        <div className="max-h-48 shrink-0 overflow-y-auto border-t bg-card px-5 py-2" data-testid="timeline-unscheduled-list">
          <p className="mb-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Without a date</p>
          <ul className="flex flex-wrap gap-1.5">
            {rows.unscheduled.map(({ item, group }) => (
              <li key={item.id}>
                <button type="button" onClick={() => openItem(item.id)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs hover:bg-accent">
                  <span className={cn("size-1.5 rounded-full", colorClasses(group.color).dot)} /> {item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BarRow({ bar, group, range, zoom, users, today, onOpen }: { bar: Scheduled; group: BoardGroup; range: ReturnType<typeof useDateRange>; zoom: Zoom; users: User[]; today: string; onOpen: () => void }) {
  const { model } = useBoardContext();
  const { item } = bar;
  const done = model.isDone(item.id);
  const colour = barColor(model, item, group.color);
  const owners = model.personColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    return v?.type === "PERSON" ? v.userIds : [];
  });
  const owner = users.find((u) => u.id === owners[0]);
  const left = range.x(bar.start);
  const width = Math.max(range.width(bar.start, bar.end), bar.milestone ? 14 : range.dayWidth);
  const wide = width >= 96;
  const late = !done && toISODate(bar.end) < today;
  const dates = bar.milestone ? format(bar.end, "MMM d") : formatDateRange(toISODate(bar.start), toISODate(bar.end));
  return (
    <div className="flex items-center border-b border-border/60 last:border-b-0" style={{ height: ROW }} data-testid="timeline-row">
      <div className="sticky left-0 z-[2] h-full shrink-0 border-r bg-background" style={{ width: LABEL_WIDTH }}>
        <button type="button" onClick={onOpen} className="flex h-full w-full min-w-0 items-center gap-2 px-3 pl-6 text-left hover:bg-accent/50">
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px]", done && "text-muted-foreground line-through")}>{item.name}</span>
            <span className={cn("block truncate text-2xs tabular", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{dates}</span>
          </span>
          {late && <TriangleAlert className="size-3 shrink-0 text-red-600 dark:text-red-400" aria-label="Overdue" />}
        </button>
      </div>
      <div className="relative h-full flex-1">
        <RowBackdrop range={range} zoom={zoom} />
        {bar.milestone ? (
          <button
            type="button"
            onClick={onOpen}
            title={`${item.name}: due ${dates}`}
            aria-label={`${item.name}, due ${dates}`}
            className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 hover:brightness-95"
            style={{ left: left + range.dayWidth / 2 - 7 }}
            data-testid="timeline-milestone"
          >
            <span className={cn("block size-3.5 rotate-45 rounded-[2px] shadow-xs", done && "opacity-50")} style={{ backgroundColor: colour.hex }} />
            {zoom !== "month" && <span className={cn("text-2xs whitespace-nowrap", done ? "text-muted-foreground line-through" : "text-foreground/80")}>{item.name}</span>}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpen}
              title={`${item.name}: ${dates}`}
              aria-label={`${item.name}, ${dates}`}
              className={cn("absolute top-1/2 flex h-6 -translate-y-1/2 items-center gap-1.5 overflow-hidden rounded-full pr-2 pl-1 text-left text-2xs font-medium text-white shadow-xs hover:brightness-95", done && "opacity-50", late && "ring-2 ring-red-400/70")}
              style={{ left, width, backgroundColor: colour.hex, backgroundImage: colour.stuck ? STUCK_STRIPES : undefined }}
              data-testid="timeline-bar"
            >
              {owner && width >= 40 && <UserAvatar user={owner} size="xs" tooltip={false} className="shrink-0 ring-1 ring-white/70" />}
              {wide && <span className="truncate">{item.name}</span>}
            </button>
            {!wide && zoom !== "month" && (
              <span className={cn("absolute top-1/2 -translate-y-1/2 truncate text-2xs whitespace-nowrap", done ? "text-muted-foreground line-through" : "text-foreground/80")} style={{ left: left + width + 6, maxWidth: 220 }}>
                {item.name}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
