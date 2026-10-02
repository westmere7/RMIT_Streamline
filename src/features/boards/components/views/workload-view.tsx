"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { User } from "@/domain";
import { columnLabels, hasAnyRate, isStuckLabel, normaliseAssetRates, weeklyHoursOf } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useViewSettings } from "@/features/boards/components/views/view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewSelect, ViewStat } from "@/features/boards/components/views/view-shell";
import {
  availableMeasures,
  contextFromModel,
  isItemDone,
  isItemOverdue,
  itemDueDate,
  itemOwners,
  itemStatusRole,
  measureItems,
  periods,
  workloadMatrix,
  type AggregateContext,
  type LoadLevel,
  type Measure,
  type Period,
  type PeriodKind,
  type WorkloadMode,
  type WorkloadRow,
} from "@/features/boards/components/views/view-aggregates";
import { formatHours, itemHours, periodCapacity, spreadHours, utilisationLevel } from "@/features/boards/components/views/workload-hours";
import { useBoardAssets } from "@/features/items/asset-hooks";
import { useWorkspaceOptional } from "@/features/workspace/workspace-context";
import { formatShortDate, toISODate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

const WINDOW: Record<PeriodKind, number> = { weeks: 8, days: 14 };
const PERSON_WIDTH = 260;
const PERIOD_WIDTH = 104;

/** Load tints: nothing, light, busy, too much. */
const LEVEL_CLASSES: Record<LoadLevel, string> = {
  0: "text-muted-foreground/40",
  1: "bg-green-50 text-green-800 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25",
  2: "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25",
  3: "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25",
};
const LEVEL_SWATCH: Record<1 | 2 | 3, string> = { 1: "bg-green-500/70", 2: "bg-amber-500/80", 3: "bg-red-500/80" };

/** What a cell can measure: the board's own measures, and hours against each person's capacity. */
type WorkloadMeasure = Measure | "hours";

/** A cell's worth of facts, for its tint, its bar and its hover card. */
interface CellFacts {
  itemIds: string[];
  roles: Record<"done" | "progress" | "stuck" | "other", number>;
  overdue: number;
  /** Hours booked here, in the hours measure. */
  hours: number;
  /** Hours the person has here, in the hours measure; null for the Unassigned row. */
  capacity: number | null;
  level: LoadLevel;
}

interface RowFacts {
  row: WorkloadRow;
  user: User | undefined;
  cells: CellFacts[];
  /** Hours a week, in the hours measure; null for the Unassigned row. */
  weekly: number | null;
  booked: number;
  available: number;
  /** Their open work with neither a due date nor a timeline, so it sits in no period at all. */
  undated: number;
  /** Their soonest open due date from today, with its task. */
  next: { itemId: string; due: string } | null;
  stuck: number;
}

/**
 * Who has what, week by week (or day by day): a row a person, a column a
 * period, each cell the work landing on them then. Counted in items, asset
 * units, or hours against the hours they have — their seat's hours a week in
 * Members, a full week if it does not say. Hover a person or a cell for the
 * detail behind it; click a cell for its tasks.
 *
 * Done work is left out unless asked for: a workload is what is still to do.
 */
export function WorkloadView() {
  const { board, model, users: assignable, people: users = assignable, now } = useBoardContext();
  const ws = useWorkspaceOptional();
  const [settings, updateSettings] = useViewSettings("workload", { kind: "weeks" as PeriodKind, mode: "due" as WorkloadMode, measure: "count" as WorkloadMeasure, showDone: false });
  const { kind, mode } = settings;
  const setKind = (next: PeriodKind) => updateSettings({ kind: next });
  const setMode = (next: WorkloadMode) => updateSettings({ mode: next });
  const [offset, setOffset] = React.useState(0);
  const assets = useBoardAssets(board.id);
  const rates = React.useMemo(() => normaliseAssetRates(ws?.workspace.assetRates), [ws?.workspace.assetRates]);
  const hasAssets = (assets.data?.byItem.size ?? 0) > 0;
  const canWeigh = hasAssets && hasAnyRate(rates);

  const ctx = React.useMemo(() => contextFromModel(model, now, users, assets.data?.byItem), [model, now, users, assets.data]);
  const allItems = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);
  const items = React.useMemo(() => (settings.showDone ? allItems : allItems.filter((i) => !isItemDone(i.id, ctx))), [allItems, settings.showDone, ctx]);
  const periodList = React.useMemo(() => periods(now, kind, WINDOW[kind], offset), [now, kind, offset]);

  const measures = React.useMemo(() => {
    const list: Array<{ value: WorkloadMeasure; label: string }> = availableMeasures([], hasAssets);
    if (canWeigh) list.push({ value: "hours", label: "Hours vs capacity" });
    return list;
  }, [hasAssets, canWeigh]);
  const measure: WorkloadMeasure = measures.some((m) => m.value === settings.measure) ? settings.measure : "count";
  const byHours = measure === "hours";

  // Rows for everyone who owns at least one item on screen, by name.
  const people = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) for (const id of itemOwners(item.id, ctx)) ids.add(id);
    return users.filter((u) => ids.has(u.id)).sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  }, [items, users, ctx]);

  const matrix = React.useMemo(() => workloadMatrix(items, people.map((u) => u.id), periodList, ctx, mode), [items, people, periodList, ctx, mode]);
  const overdue = React.useMemo(() => items.filter((i) => isItemOverdue(i.id, ctx)).length, [items, ctx]);

  // Hours each task needs, and how many need none we can measure.
  const hoursByItem = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!byHours) return map;
    for (const item of items) map.set(item.id, itemHours(assets.data?.byItem.get(item.id), rates));
    return map;
  }, [byHours, items, assets.data, rates]);
  const unweighed = byHours ? items.filter((i) => (hoursByItem.get(i.id) ?? 0) === 0).length : 0;

  const weeklyOf = React.useCallback((userId: string) => weeklyHoursOf(ws?.members.find((m) => m.userId === userId)), [ws?.members]);

  const rowFacts = React.useMemo<RowFacts[]>(() => {
    const today = toISODate(now);
    const timeline = ctx.columns.find((c) => c.type === "TIMELINE");
    const all = matrix.unassigned ? [...matrix.rows, matrix.unassigned] : matrix.rows;
    return all.map((row) => {
      const user = row.personId ? people.find((u) => u.id === row.personId) : undefined;
      const weekly = row.personId && byHours ? weeklyOf(row.personId) : null;
      // A task with two owners puts half its hours on each.
      const hours = periodList.map(() => 0);
      if (byHours) {
        for (const id of row.itemIds) {
          const owners = Math.max(1, itemOwners(id, ctx).length);
          const share = (hoursByItem.get(id) ?? 0) / (row.personId ? owners : 1);
          spreadHours(id, share, periodList, ctx, mode).forEach((h, i) => (hours[i]! += h));
        }
      }
      const cells = row.cells.map((cell, i): CellFacts => {
        const roles = { done: 0, progress: 0, stuck: 0, other: 0 };
        for (const id of cell.itemIds) roles[itemStatusRole(id, ctx) ?? "other"] += 1;
        const capacity = weekly === null ? null : periodCapacity(weekly, periodList[i]!, kind);
        const level = byHours ? (capacity === null ? (hours[i]! > 0 ? 1 : 0) : utilisationLevel(hours[i]!, capacity)) : cell.level;
        return { itemIds: cell.itemIds, roles, overdue: cell.itemIds.filter((id) => isItemOverdue(id, ctx)).length, hours: hours[i]!, capacity, level };
      });
      let next: RowFacts["next"] = null;
      let undated = 0;
      let stuck = 0;
      for (const id of row.itemIds) {
        if (isItemDone(id, ctx)) continue;
        if (itemStatusRole(id, ctx) === "stuck") stuck += 1;
        const due = itemDueDate(id, ctx);
        const span = timeline ? ctx.getValue(id, timeline.id) : undefined;
        if (!due && !(span?.type === "TIMELINE" && (span.start || span.end))) undated += 1;
        if (due && due >= today && (!next || due < next.due)) next = { itemId: id, due };
      }
      return {
        row,
        user,
        cells,
        weekly,
        booked: hours.reduce((a, b) => a + b, 0),
        available: cells.reduce((a, c) => a + (c.capacity ?? 0), 0),
        undated,
        next,
        stuck,
      };
    });
  }, [matrix, people, byHours, weeklyOf, periodList, ctx, hoursByItem, mode, kind, now]);

  if (model.personColumns.length === 0) {
    return <ViewEmpty title="Workload needs a People column" description="Add a People column to this board to see who is carrying what, week by week." />;
  }

  const personRows = rowFacts.filter((r) => r.row.personId);
  const booked = personRows.reduce((a, r) => a + r.booked, 0);
  const available = personRows.reduce((a, r) => a + r.available, 0);
  const over = personRows.filter((r) => r.cells.some((c) => c.level === 3)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="workload">
      <ViewBar
        stats={
          <>
            <ViewStat value={people.length} label={people.length === 1 ? "person" : "people"} />
            {byHours ? (
              <>
                <ViewStat value={`${Math.round(booked)} of ${Math.round(available)} h`} label="booked" tone={booked > available ? "warn" : "neutral"} testId="workload-booked" />
                {over > 0 && <ViewStat value={over} label={over === 1 ? "person over" : "people over"} tone="warn" testId="workload-over" />}
                {unweighed > 0 && <ViewStat value={unweighed} label="without hours" />}
              </>
            ) : (
              <ViewStat value={matrix.scheduled} label="scheduled" />
            )}
            {matrix.unassigned && <ViewStat value={matrix.unassigned.itemIds.length} label="unassigned" />}
            <ViewStat value={overdue} label="overdue" tone={overdue > 0 ? "warn" : "neutral"} testId="workload-overdue" />
          </>
        }
      >
        <Segmented
          value={kind}
          onChange={(next) => {
            setKind(next);
            setOffset(0);
          }}
          options={[
            { value: "weeks", label: "Weeks" },
            { value: "days", label: "Days" },
          ]}
          ariaLabel="Period"
          testId="workload-kind"
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "due", label: "Items due" },
            { value: "active", label: "Active in period" },
          ]}
          ariaLabel="What a cell counts"
          testId="workload-mode"
        />
        {measures.length > 1 && <ViewSelect value={measure} onChange={(next) => updateSettings({ measure: next })} options={measures} ariaLabel="Measure" testId="workload-measure" />}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch size="sm" checked={settings.showDone} onCheckedChange={(on) => updateSettings({ showDone: on })} data-testid="workload-show-done" />
          Done
        </label>
        <span className="ml-1 inline-flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label={kind === "weeks" ? "Earlier weeks" : "Earlier days"} onClick={() => setOffset((o) => o - (kind === "weeks" ? 4 : 7))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={kind === "weeks" ? "Later weeks" : "Later days"} onClick={() => setOffset((o) => o + (kind === "weeks" ? 4 : 7))}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={offset === 0} onClick={() => setOffset(0)}>
            Today
          </Button>
        </span>
      </ViewBar>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-surface/50 p-5">
        <Legend byHours={byHours} />
        <div className="inline-block min-w-full rounded-xl border border-border/60 bg-card shadow-xs">
          <table className="border-separate border-spacing-0 text-[13px]" style={{ minWidth: PERSON_WIDTH + periodList.length * PERIOD_WIDTH }}>
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 left-0 z-20 rounded-tl-xl border-r border-b border-border/60 bg-card px-4 py-2 text-left text-2xs font-semibold text-muted-foreground" style={{ width: PERSON_WIDTH, minWidth: PERSON_WIDTH }}>
                  {personRows.length === 1 ? "1 person" : `${personRows.length} people`}
                  {byHours && <span className="font-normal"> · hours a week</span>}
                </th>
                {periodList.map((period) => (
                  <th key={period.startIso} scope="col" data-testid="workload-period" data-today={period.today || undefined} className={cn("sticky top-0 z-10 border-b border-border/60 bg-card px-2 py-2 text-center text-2xs font-medium whitespace-nowrap", period.today ? "text-primary" : "text-muted-foreground")} style={{ width: PERIOD_WIDTH, minWidth: PERIOD_WIDTH }}>
                    {period.label}
                    {period.today && <span className="sr-only"> (today)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowFacts.map((facts) => (
                <PersonRow key={facts.row.personId ?? "unassigned"} facts={facts} periods={periodList} ctx={ctx} measure={measure} hoursByItem={hoursByItem} kind={kind} />
              ))}
              {rowFacts.length === 0 && (
                <tr>
                  <td colSpan={periodList.length + 1} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    Nobody is assigned to the items on screen.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky left-0 z-10 rounded-bl-xl border-t border-r border-border/60 bg-card px-4 py-2 text-left text-2xs font-semibold text-muted-foreground">
                  {byHours ? "Team, booked of available" : "Total"}
                </th>
                {periodList.map((period, i) => {
                  const hours = rowFacts.reduce((a, r) => a + r.cells[i]!.hours, 0);
                  const capacity = personRows.reduce((a, r) => a + (r.cells[i]!.capacity ?? 0), 0);
                  const total = matrix.totals[i] ?? 0;
                  return (
                    <td key={period.startIso} className={cn("border-t border-border/60 px-2 py-2 text-center text-2xs font-semibold tabular", period.today && "bg-primary/5", (byHours ? hours === 0 : total === 0) && "text-muted-foreground/40")} data-testid="workload-total">
                      {byHours ? (
                        <span className={cn(capacity > 0 && hours > capacity && "text-red-600 dark:text-red-400")}>
                          {Math.round(hours)}
                          <span className="font-normal text-muted-foreground"> / {Math.round(capacity)} h</span>
                        </span>
                      ) : (
                        total
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/** What the tints mean, in the measure on screen. */
function Legend({ byHours }: { byHours: boolean }) {
  const steps: Array<[1 | 2 | 3, string]> = byHours
    ? [
        [1, "Under 85% of their hours"],
        [2, "Full"],
        [3, "Over their hours"],
      ]
    : [
        [1, "1–2 items"],
        [2, "3–4"],
        [3, "5 or more"],
      ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground" data-testid="workload-legend">
      {steps.map(([level, label]) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-sm", LEVEL_SWATCH[level])} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Done, in progress, stuck and the rest, as one thin bar. */
function RoleBar({ roles, className }: { roles: CellFacts["roles"]; className?: string }) {
  const total = roles.done + roles.progress + roles.stuck + roles.other;
  if (total === 0) return null;
  return (
    <span className={cn("flex h-1 overflow-hidden rounded-full bg-surface-strong", className)} aria-hidden>
      <span className="bg-green-500" style={{ width: `${(roles.done / total) * 100}%` }} />
      <span className="bg-orange-400" style={{ width: `${(roles.progress / total) * 100}%` }} />
      <span className="bg-red-500" style={{ width: `${(roles.stuck / total) * 100}%` }} />
    </span>
  );
}

/** Booked against available as a bar that runs red past full. */
function CapacityBar({ booked, capacity, className }: { booked: number; capacity: number; className?: string }) {
  const share = capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0;
  return (
    <span className={cn("relative block h-1 overflow-hidden rounded-full bg-surface-strong", className)} aria-hidden>
      <span className={cn("absolute inset-y-0 left-0 rounded-full", share > 1 ? "bg-red-500" : share > 0.85 ? "bg-amber-500" : "bg-green-500")} style={{ width: `${Math.min(1, share) * 100}%` }} />
    </span>
  );
}

function Detail({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular", tone === "warn" && "text-red-600 dark:text-red-400")}>{value}</dd>
    </div>
  );
}

function PersonRow({ facts, periods: periodList, ctx, measure, hoursByItem, kind }: { facts: RowFacts; periods: Period[]; ctx: AggregateContext; measure: WorkloadMeasure; hoursByItem: Map<string, number>; kind: PeriodKind }) {
  const { model, now } = useBoardContext();
  const { row, user, cells, weekly } = facts;
  const name = user?.displayName ?? "Unassigned";
  const byHours = measure === "hours";
  const share = facts.available > 0 ? facts.booked / facts.available : null;
  const peak = cells.reduce((best, cell, i) => ((byHours ? cell.hours > (cells[best]?.hours ?? 0) : cell.itemIds.length > (cells[best]?.itemIds.length ?? 0)) ? i : best), 0);
  const nextItem = facts.next ? model.itemById.get(facts.next.itemId) : null;
  return (
    <tr data-testid="workload-row" data-person={row.personId ?? "unassigned"}>
      <th scope="row" className="sticky left-0 z-10 border-r border-b border-border/60 bg-card px-4 py-2 text-left font-normal">
        <HoverCard openDelay={250} closeDelay={80}>
          <HoverCardTrigger asChild>
            <div className="flex cursor-default items-center gap-2.5" data-testid="workload-person">
              <UserAvatar user={user} size="sm" tooltip={false} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-medium" title={name}>
                    {name}
                  </span>
                  {weekly !== null && <span className="shrink-0 text-2xs text-muted-foreground tabular">{weekly} h/wk</span>}
                </p>
                {user?.jobTitle && <p className="truncate text-2xs text-muted-foreground">{user.jobTitle}</p>}
                <div className="mt-1 flex items-center gap-2">
                  {byHours && share !== null ? <CapacityBar booked={facts.booked} capacity={facts.available} className="w-16 shrink-0" /> : <RoleBar roles={totalRoles(row, ctx)} className="w-16 shrink-0" />}
                  <span className="truncate text-2xs text-muted-foreground tabular">
                    {byHours && share !== null ? `${Math.round(share * 100)}% · ` : ""}
                    {row.open} open
                    {row.overdue > 0 && (
                      <>
                        {" · "}
                        <span className="font-medium text-red-600 dark:text-red-400">{row.overdue} overdue</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="right" className="w-72" data-testid="workload-person-card">
            <div className="mb-2 flex items-center gap-2.5">
              <UserAvatar user={user} size="md" tooltip={false} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-2xs text-muted-foreground">{user?.jobTitle ?? (row.personId ? "No job title" : "Tasks nobody owns")}</p>
              </div>
            </div>
            <dl className="space-y-1 text-xs">
              <Detail label="Open" value={row.open} />
              {facts.stuck > 0 && <Detail label="Stuck" value={facts.stuck} tone="warn" />}
              {row.overdue > 0 && <Detail label="Overdue" value={row.overdue} tone="warn" />}
              {facts.undated > 0 && <Detail label="No dates" value={facts.undated} />}
              {row.done > 0 && <Detail label="Done, shown" value={row.done} />}
              {byHours && weekly !== null && (
                <>
                  <Detail label={`Booked over ${periodList.length} ${kind}`} value={`${formatHours(facts.booked)} of ${formatHours(facts.available)}`} tone={facts.booked > facts.available ? "warn" : undefined} />
                  <Detail label="Hours a week" value={weekly} />
                </>
              )}
              {(byHours ? cells[peak]!.hours > 0 : cells[peak]!.itemIds.length > 0) && <Detail label="Busiest" value={`${periodList[peak]!.label}${byHours ? ` · ${formatHours(cells[peak]!.hours)}` : ` · ${cells[peak]!.itemIds.length}`}`} />}
              {nextItem && facts.next && <Detail label="Next due" value={<span className="inline-block max-w-40 truncate align-bottom" title={nextItem.name}>{`${formatShortDate(facts.next.due, now)} · ${nextItem.name}`}</span>} />}
            </dl>
          </HoverCardContent>
        </HoverCard>
      </th>
      {cells.map((cell, i) => (
        <WorkloadCell key={periodList[i]?.startIso ?? i} cell={cell} period={periodList[i]!} name={name} ctx={ctx} measure={measure} hoursByItem={hoursByItem} owned={row.personId !== null} />
      ))}
    </tr>
  );
}

/** The status mix of everything a person holds, for the bar under their name. */
function totalRoles(row: WorkloadRow, ctx: AggregateContext): CellFacts["roles"] {
  const roles = { done: 0, progress: 0, stuck: 0, other: 0 };
  for (const id of row.itemIds) roles[itemStatusRole(id, ctx) ?? "other"] += 1;
  return roles;
}

function WorkloadCell({ cell, period, name, ctx, measure, hoursByItem, owned }: { cell: CellFacts; period: Period; name: string; ctx: AggregateContext; measure: WorkloadMeasure; hoursByItem: Map<string, number>; owned: boolean }) {
  const { model, now } = useBoardContext();
  const [listOpen, setListOpen] = React.useState(false);
  const byHours = measure === "hours";
  const count = cell.itemIds.length;
  const label = `${count} ${count === 1 ? "item" : "items"} for ${name}, ${period.label}`;
  // Tasks with no rated deliverables put no hours on anyone, so their count is what the cell says.
  const unweighed = byHours && cell.hours <= 0;
  const value = unweighed ? `${count} ${count === 1 ? "task" : "tasks"}` : byHours ? formatHours(cell.hours) : measureItems(cell.itemIds, measure as Measure, ctx);
  const share = byHours && cell.capacity ? cell.hours / cell.capacity : null;
  const shown = [...cell.itemIds].sort((a, b) => (hoursByItem.get(b) ?? 0) - (hoursByItem.get(a) ?? 0)).slice(0, 4);
  return (
    <td data-testid="workload-cell" data-level={cell.level} className={cn("border-b border-border/60 p-1 text-center", period.today && "bg-primary/5")}>
      {count === 0 && cell.hours <= 0 ? (
        <span className={cn("block h-10 text-xs leading-10 tabular", LEVEL_CLASSES[0])} aria-label={label}>
          {byHours && cell.capacity ? <span className="text-2xs">{formatHours(cell.capacity)} free</span> : "–"}
        </span>
      ) : (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <HoverCard openDelay={300} closeDelay={60} open={listOpen ? false : undefined}>
            <HoverCardTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" aria-label={label} className={cn("flex h-10 w-full flex-col items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold tabular transition-colors focus-visible:outline-2 focus-visible:outline-ring", unweighed ? "font-normal text-muted-foreground hover:bg-accent" : LEVEL_CLASSES[cell.level])}>
                  <span>
                    {value}
                    {byHours && !unweighed && cell.capacity !== null && <span className="font-normal opacity-60"> / {Math.round(cell.capacity)}</span>}
                  </span>
                  {unweighed ? null : byHours && cell.capacity !== null ? <CapacityBar booked={cell.hours} capacity={cell.capacity} className="w-full max-w-16" /> : <RoleBar roles={cell.roles} className="w-full max-w-16" />}
                </button>
              </PopoverTrigger>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="center" className="w-72" data-testid="workload-cell-card">
              <p className="text-xs font-semibold">
                {name} · {period.label}
              </p>
              <dl className="mt-2 space-y-1 text-xs">
                <Detail label="Tasks" value={count} />
                {cell.roles.progress > 0 && <Detail label="In progress" value={cell.roles.progress} />}
                {cell.roles.stuck > 0 && <Detail label="Stuck" value={cell.roles.stuck} tone="warn" />}
                {cell.overdue > 0 && <Detail label="Overdue" value={cell.overdue} tone="warn" />}
                {cell.roles.done > 0 && <Detail label="Done" value={cell.roles.done} />}
                {byHours && (
                  <Detail
                    label={owned ? "Booked of their hours" : "Hours"}
                    value={cell.capacity !== null ? `${formatHours(cell.hours)} of ${formatHours(cell.capacity)}${share !== null ? ` · ${Math.round(share * 100)}%` : ""}` : formatHours(cell.hours)}
                    tone={share !== null && share > 1 ? "warn" : undefined}
                  />
                )}
              </dl>
              {shown.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {shown.map((id) => {
                    const item = model.itemById.get(id);
                    if (!item) return null;
                    const due = itemDueDate(id, ctx);
                    const hours = hoursByItem.get(id) ?? 0;
                    return (
                      <li key={id} className="flex items-center gap-2 text-xs">
                        <span className={cn("min-w-0 flex-1 truncate", model.isDone(id) && "text-muted-foreground line-through")}>{item.name}</span>
                        {byHours && hours > 0 && <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatHours(hours)}</span>}
                        {due && <span className={cn("shrink-0 text-2xs tabular", isItemOverdue(id, ctx) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(due, now)}</span>}
                      </li>
                    );
                  })}
                  {count > shown.length && <li className="text-2xs text-muted-foreground">and {count - shown.length} more · click to see them all</li>}
                </ul>
              )}
            </HoverCardContent>
          </HoverCard>
          <PopoverContent className="w-80 p-2" align="center">
            <ItemList title={`${name} · ${period.label}`} itemIds={cell.itemIds} ctx={ctx} hoursByItem={byHours ? hoursByItem : undefined} />
          </PopoverContent>
        </Popover>
      )}
    </td>
  );
}

/** The items behind a cell or a bar: name, status, hours where they count, and due date, each opening the item. */
export function ItemList({ title, itemIds, ctx, hoursByItem }: { title: string; itemIds: string[]; ctx: AggregateContext; hoursByItem?: Map<string, number> }) {
  const { model, openItem, now } = useBoardContext();
  const status = model.statusColumn;
  const labels = status ? columnLabels(status) : [];
  return (
    <div>
      <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold text-muted-foreground">{title}</p>
      <ul className="scrollbar-thin max-h-72 space-y-0.5 overflow-y-auto">
        {itemIds.map((id) => {
          const item = model.itemById.get(id);
          if (!item) return null;
          const v = status ? model.getValue(id, status.id) : undefined;
          const label = v?.type === "STATUS" ? labels.find((l) => l.id === v.labelId) : undefined;
          const due = itemDueDate(id, ctx);
          const overdue = isItemOverdue(id, ctx);
          const hours = hoursByItem?.get(id) ?? 0;
          return (
            <li key={id}>
              <button type="button" onClick={() => openItem(id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", model.isDone(id) && "text-muted-foreground")} title={item.name}>
                  {item.name}
                </span>
                {label && <LabelPill label={label} size="sm" striped={isStuckLabel(status, label.id)} className="shrink-0" />}
                {hoursByItem && <span className="shrink-0 text-2xs text-muted-foreground tabular">{hours > 0 ? formatHours(hours) : "—"}</span>}
                {due && <span className={cn("shrink-0 text-2xs tabular", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(due, now)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
