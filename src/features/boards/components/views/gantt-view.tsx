"use client";

import { format } from "date-fns";
import { ChevronDown, ChevronRight, Crosshair, GitBranch, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { BoardGroup, Item, User } from "@/domain";
import { columnLabels } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { formatDateRange, toISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { barColor, DateScaleHeader, RowBackdrop, STUCK_STRIPES, TodayLine, useDateRange, useScrollToToday, ZOOM_OPTIONS, scheduleOf, type DateRange, type Scheduled, type Zoom } from "./date-scale";
import { useViewSettings } from "./view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewStat } from "./view-shell";

const NAME_WIDTH = 250;
const OWNER_WIDTH = 44;
const STATUS_WIDTH = 116;
const DATES_WIDTH = 118;
const LABEL_WIDTH = NAME_WIDTH + OWNER_WIDTH + STATUS_WIDTH + DATES_WIDTH;
const ROW = 36;
const GROUP_ROW = 32;

type Row =
  | { kind: "group"; key: string; group: BoardGroup; count: number; first: Date | null; last: Date | null }
  | { kind: "item"; key: string; group: BoardGroup; item: Item; schedule: Scheduled | null; depth: 0 | 1; children: number };

/**
 * The plan as a schedule: groups, items and their subitems down the left with
 * owner, status and dates; bars and milestones on the right; arrows for the
 * Dependency column, red when the work upstream is not done and the dependent
 * work has already started. Progress on a parent is the share of its subitems
 * that are done. Read-only: dates are changed on the item, not by dragging.
 */
export function GanttView() {
  const { model, users, openItem, now } = useBoardContext();
  const [settings, updateSettings] = useViewSettings("gantt", { zoom: "week" as Zoom });
  const zoom = settings.zoom;
  const setZoom = (next: Zoom) => updateSettings({ zoom: next });
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set());
  const today = toISODate(now);

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const group of model.groups) {
      const items = model.itemsByGroup.get(group.id) ?? [];
      if (items.length === 0) continue;
      const schedules = items.map((i) => scheduleOf(model, i)).filter((s): s is Scheduled => !!s);
      const first = schedules.length ? schedules.reduce((min, s) => (s.start < min ? s.start : min), schedules[0]!.start) : null;
      const last = schedules.length ? schedules.reduce((max, s) => (s.end > max ? s.end : max), schedules[0]!.end) : null;
      out.push({ kind: "group", key: `g:${group.id}`, group, count: items.length, first, last });
      if (collapsedGroups.has(group.id)) continue;
      for (const item of items) {
        const children = model.subitemsByParent.get(item.id) ?? [];
        out.push({ kind: "item", key: item.id, group, item, schedule: scheduleOf(model, item), depth: 0, children: children.length });
        if (expanded.has(item.id)) for (const sub of children) out.push({ kind: "item", key: sub.id, group, item: sub, schedule: scheduleOf(model, sub), depth: 1, children: 0 });
      }
    }
    return out;
  }, [model, expanded, collapsedGroups]);

  const scheduled = React.useMemo(() => rows.flatMap((r) => (r.kind === "item" && r.schedule ? [r.schedule] : [])), [rows]);
  const range = useDateRange(scheduled, now, zoom);
  const scroller = React.useRef<HTMLDivElement>(null);
  const boardId = model.groups[0]?.boardId ?? "";
  const scrollToToday = useScrollToToday(scroller, range, LABEL_WIDTH, `${boardId}:${zoom}`);

  // Where each visible item's bar sits, for the dependency arrows.
  const geometry = React.useMemo(() => {
    const map = new Map<string, { x1: number; x2: number; y: number; done: boolean; start: Date }>();
    let y = 0;
    for (const row of rows) {
      const height = row.kind === "group" ? GROUP_ROW : ROW;
      if (row.kind === "item" && row.schedule) {
        const x1 = range.x(row.schedule.start);
        const x2 = x1 + Math.max(range.width(row.schedule.start, row.schedule.end), row.schedule.milestone ? 14 : range.dayWidth);
        map.set(row.item.id, { x1, x2, y: y + height / 2, done: model.isDone(row.item.id), start: row.schedule.start });
      }
      y += height;
    }
    return { map, height: y };
  }, [rows, range, model]);

  const arrows = React.useMemo(() => {
    const column = model.dependencyColumn;
    if (!column) return [];
    const out: Array<{ key: string; d: string; blocked: boolean }> = [];
    for (const [itemId, to] of geometry.map) {
      const v = model.getValue(itemId, column.id);
      if (v?.type !== "DEPENDENCY") continue;
      for (const depId of v.itemIds) {
        const from = geometry.map.get(depId);
        if (!from) continue;
        const blocked = !from.done && toISODate(to.start) <= today;
        const midX = from.x2 + 8;
        const d = to.x1 >= midX + 6 ? `M ${from.x2} ${from.y} H ${midX} V ${to.y} H ${to.x1 - 2}` : `M ${from.x2} ${from.y} H ${midX} V ${to.y - ROW / 2 + 4} H ${to.x1 - 8} V ${to.y} H ${to.x1 - 2}`;
        out.push({ key: `${depId}->${itemId}`, d, blocked });
      }
    }
    return out;
  }, [geometry, model, today]);

  const itemRows = rows.filter((r): r is Extract<Row, { kind: "item" }> => r.kind === "item" && r.depth === 0);
  const milestones = itemRows.filter((r) => r.schedule?.milestone).length;
  const blocked = itemRows.filter((r) => model.isBlocked(r.item.id)).length;
  const undated = itemRows.filter((r) => !r.schedule).length;

  if (itemRows.length === 0) return <ViewEmpty title="Nothing to schedule yet" description="Add items with a Timeline or Due Date and they appear here with their subitems and dependencies." />;

  const toggleItem = (id: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleGroup = (id: string) => setCollapsedGroups((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const expandAll = () => setExpanded(new Set(itemRows.filter((r) => r.children > 0).map((r) => r.item.id)));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="gantt">
      <ViewBar
        stats={
          <>
            <ViewStat value={itemRows.length} label="items" />
            {milestones > 0 && <ViewStat value={milestones} label="milestones" />}
            {arrows.length > 0 && <ViewStat value={arrows.length} label="dependencies" />}
            {blocked > 0 && <ViewStat value={blocked} label="blocked" tone="warn" testId="gantt-blocked" />}
            {undated > 0 && <ViewStat value={undated} label="undated" />}
          </>
        }
      >
        <Segmented value={zoom} onChange={setZoom} options={ZOOM_OPTIONS} ariaLabel="Zoom" testId="gantt-zoom" />
        <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={scrollToToday}>
          <Crosshair /> Today
        </Button>
        {itemRows.some((r) => r.children > 0) && (
          <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => (expanded.size ? setExpanded(new Set()) : expandAll())} data-testid="gantt-expand">
            {expanded.size ? <ChevronDown /> : <ChevronRight />} {expanded.size ? "Collapse subitems" : "Expand subitems"}
          </Button>
        )}
      </ViewBar>

      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-surface/50">
        <div style={{ width: LABEL_WIDTH + range.totalDays * range.dayWidth }} className="relative m-4 rounded-xl border border-border/60 bg-background shadow-xs">
          <div className="sticky top-0 z-10 flex bg-background">
            <div className="sticky left-0 z-20 flex shrink-0 items-end border-r border-b bg-background text-2xs font-semibold tracking-wide text-muted-foreground uppercase" style={{ width: LABEL_WIDTH }}>
              <span className="px-3 py-1.5" style={{ width: NAME_WIDTH }}>Item</span>
              <span className="py-1.5 text-center" style={{ width: OWNER_WIDTH }}>Who</span>
              <span className="px-2 py-1.5" style={{ width: STATUS_WIDTH }}>Status</span>
              <span className="px-2 py-1.5" style={{ width: DATES_WIDTH }}>Dates</span>
            </div>
            <DateScaleHeader range={range} zoom={zoom} now={now} labelWidth={0} className="static" />
          </div>

          <div className="relative">
            <TodayLine range={range} labelWidth={LABEL_WIDTH} showTag />
            {arrows.length > 0 && (
              <svg aria-hidden className="pointer-events-none absolute top-0 z-[2]" style={{ left: LABEL_WIDTH, width: range.totalDays * range.dayWidth, height: geometry.height }} data-testid="gantt-arrows">
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <path key={a.key} d={a.d} fill="none" strokeWidth={1.5} markerEnd="url(#gantt-arrow)" className={a.blocked ? "text-red-500" : "text-muted-foreground/70"} stroke="currentColor" data-blocked={a.blocked || undefined} />
                ))}
              </svg>
            )}
            {rows.map((row) =>
              row.kind === "group" ? (
                <div key={row.key} className="flex items-center border-b border-border/60 bg-surface/40" style={{ height: GROUP_ROW }} data-testid={`gantt-group-${row.group.name}`}>
                  <button type="button" onClick={() => toggleGroup(row.group.id)} className={cn("sticky left-0 z-[4] flex h-full items-center gap-1.5 border-r bg-background px-2 text-left text-xs font-semibold", colorClasses(row.group.color).text)} style={{ width: LABEL_WIDTH }} aria-expanded={!collapsedGroups.has(row.group.id)}>
                    {collapsedGroups.has(row.group.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    <span className="truncate">{row.group.name}</span>
                    <span className="font-normal text-muted-foreground tabular">{row.count}</span>
                    {row.first && row.last && <span className="ml-auto pr-2 font-normal text-muted-foreground tabular">{formatDateRange(toISODate(row.first), toISODate(row.last))}</span>}
                  </button>
                  <div className="relative h-full flex-1">
                    {row.first && row.last && <div aria-hidden className="absolute top-[13px] h-1.5 rounded-full opacity-40" style={{ left: range.x(row.first), width: range.width(row.first, row.last), backgroundColor: colorClasses(row.group.color).hex }} />}
                  </div>
                </div>
              ) : (
                <ItemRow key={row.key} row={row} range={range} zoom={zoom} users={users} today={today} expanded={expanded.has(row.item.id)} onToggle={() => toggleItem(row.item.id)} onOpen={() => openItem(row.item.id)} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ row, range, zoom, users, today, expanded, onToggle, onOpen }: { row: Extract<Row, { kind: "item" }>; range: DateRange; zoom: Zoom; users: User[]; today: string; expanded: boolean; onToggle: () => void; onOpen: () => void }) {
  const { model } = useBoardContext();
  const { item, schedule, group } = row;
  const done = model.isDone(item.id);
  const blocked = model.isBlocked(item.id);
  const colour = barColor(model, item, group.color);
  const status = model.statusColumn ? model.getValue(item.id, model.statusColumn.id) : undefined;
  const statusLabel = model.statusColumn && status?.type === "STATUS" ? columnLabels(model.statusColumn).find((l) => l.id === status.labelId) ?? null : null;
  const owners = model.personColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    return v?.type === "PERSON" ? v.userIds : [];
  });
  const owner = users.find((u) => u.id === owners[0]);
  const children = model.subitemsByParent.get(item.id) ?? [];
  const progress = children.length ? children.filter((c) => model.isDone(c.id)).length / children.length : null;
  const late = !!schedule && !done && toISODate(schedule.end) < today;
  const dates = schedule ? (schedule.milestone ? format(schedule.end, "MMM d") : formatDateRange(toISODate(schedule.start), toISODate(schedule.end))) : "—";
  const left = schedule ? range.x(schedule.start) : 0;
  const width = schedule ? Math.max(range.width(schedule.start, schedule.end), schedule.milestone ? 14 : range.dayWidth) : 0;

  return (
    <div className={cn("flex items-center border-b border-border/60", row.depth === 1 && "bg-surface/30")} style={{ height: ROW }} data-testid={row.depth === 0 ? "gantt-row" : "gantt-subrow"} data-item-name={item.name}>
      <div className="sticky left-0 z-[4] flex h-full shrink-0 items-center border-r bg-background" style={{ width: LABEL_WIDTH }}>
        <div className="flex h-full min-w-0 items-center" style={{ width: NAME_WIDTH, paddingLeft: row.depth === 1 ? 28 : 6 }}>
          {row.children > 0 ? (
            <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${row.children} subitems of ${item.name}`} className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent" data-testid="gantt-toggle">
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left hover:underline" data-testid="gantt-name">
            <span className={cn("truncate text-[13px]", row.depth === 1 && "text-xs", done && "text-muted-foreground line-through")}>{item.name}</span>
            {row.children > 0 && <span className="shrink-0 text-2xs text-muted-foreground tabular">{children.filter((c) => model.isDone(c.id)).length}/{children.length}</span>}
            {blocked && <GitBranch className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Waiting on a dependency" />}
          </button>
        </div>
        <div className="flex justify-center" style={{ width: OWNER_WIDTH }}>
          {owner ? <UserAvatar user={owner} size="xs" /> : <span className="text-2xs text-muted-foreground/50">—</span>}
        </div>
        <div className="min-w-0 px-1.5" style={{ width: STATUS_WIDTH }}>
          <LabelPill label={statusLabel} appearance="soft" size="sm" emptyText="—" striped={colour.stuck} />
        </div>
        <div className={cn("truncate px-2 text-2xs tabular", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")} style={{ width: DATES_WIDTH }}>
          {dates}
        </div>
      </div>
      <div className="relative h-full flex-1">
        <RowBackdrop range={range} zoom={zoom} />
        {schedule &&
          (schedule.milestone ? (
            <button type="button" onClick={onOpen} title={`${item.name}: due ${dates}`} aria-label={`${item.name}, due ${dates}`} className="absolute top-1/2 -translate-y-1/2 hover:brightness-95" style={{ left: left + range.dayWidth / 2 - 6 }} data-testid="gantt-milestone">
              <span className={cn("block size-3 rotate-45 rounded-[2px] shadow-xs", done && "opacity-50")} style={{ backgroundColor: colour.hex }} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              title={`${item.name}: ${dates}${progress !== null ? ` · ${Math.round(progress * 100)}% of subitems done` : ""}`}
              aria-label={`${item.name}, ${dates}`}
              className={cn("absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md shadow-xs hover:brightness-95", done && "opacity-50", late && "ring-2 ring-red-400/70", row.depth === 1 && "h-3.5")}
              style={{ left, width, backgroundColor: colour.hex, backgroundImage: colour.stuck ? STUCK_STRIPES : undefined }}
              data-testid="gantt-bar"
            >
              {progress !== null && progress > 0 && <span aria-hidden className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${progress * 100}%` }} />}
              {width >= 80 && row.depth === 0 && <span className="relative block truncate px-2 text-left text-2xs font-medium text-white">{item.name}</span>}
            </button>
          ))}
        {schedule && !schedule.milestone && width < 80 && zoom !== "month" && (
          <span className={cn("absolute top-1/2 -translate-y-1/2 truncate text-2xs whitespace-nowrap", done ? "text-muted-foreground line-through" : "text-foreground/80")} style={{ left: left + width + 6, maxWidth: 200 }}>
            {item.name}
          </span>
        )}
        {late && schedule && <TriangleAlert className="absolute top-1/2 size-3 -translate-y-1/2 text-red-600 dark:text-red-400" style={{ left: left + width + (width < 80 && zoom !== "month" ? 210 : 6) }} aria-label="Overdue" />}
      </div>
    </div>
  );
}
