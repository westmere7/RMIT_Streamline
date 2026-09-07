"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { User } from "@/domain";
import { columnLabels, isStuckLabel } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useViewSettings } from "@/features/boards/components/views/view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewSelect, ViewStat } from "@/features/boards/components/views/view-shell";
import {
  availableMeasures,
  contextFromModel,
  isItemOverdue,
  itemDueDate,
  itemOwners,
  measureItems,
  periods,
  statusRoleCounts,
  workloadMatrix,
  type AggregateContext,
  type LoadLevel,
  type Measure,
  type Period,
  type PeriodKind,
  type WorkloadMode,
  type WorkloadRow,
} from "@/features/boards/components/views/view-aggregates";
import { useBoardAssets } from "@/features/items/asset-hooks";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

const WINDOW: Record<PeriodKind, number> = { weeks: 8, days: 14 };
const PERSON_WIDTH = 240;
const PERIOD_WIDTH = 96;

/** Load tints: nothing, light, busy, too much. */
const LEVEL_CLASSES: Record<LoadLevel, string> = {
  0: "text-muted-foreground/40",
  1: "bg-green-50 text-green-800 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25",
  2: "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25",
  3: "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25",
};

export function WorkloadView() {
  const { board, model, users, now } = useBoardContext();
  const [settings, updateSettings] = useViewSettings("workload", { kind: "weeks" as PeriodKind, mode: "due" as WorkloadMode, measure: "count" as Measure });
  const { kind, mode, measure } = settings;
  const setKind = (next: PeriodKind) => updateSettings({ kind: next });
  const setMode = (next: WorkloadMode) => updateSettings({ mode: next });
  const setMeasure = (next: Measure) => updateSettings({ measure: next });
  const [offset, setOffset] = React.useState(0);
  const assets = useBoardAssets(board.id);

  const ctx = React.useMemo(() => contextFromModel(model, now, users, assets.data), [model, now, users, assets.data]);
  const items = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);
  const periodList = React.useMemo(() => periods(now, kind, WINDOW[kind], offset), [now, kind, offset]);

  // Rows for everyone who owns at least one visible item, by name.
  const people = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) for (const id of itemOwners(item.id, ctx)) ids.add(id);
    return users.filter((u) => ids.has(u.id)).sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  }, [items, users, ctx]);

  const matrix = React.useMemo(() => workloadMatrix(items, people.map((u) => u.id), periodList, ctx, mode), [items, people, periodList, ctx, mode]);
  const overdue = React.useMemo(() => items.filter((i) => isItemOverdue(i.id, ctx)).length, [items, ctx]);

  if (model.personColumns.length === 0) {
    return <ViewEmpty title="Workload needs a People column" description="Add a People column to this board to see who is carrying what, week by week." />;
  }

  const measures = availableMeasures([], (assets.data?.length ?? 0) > 0);
  const userById = new Map(users.map((u) => [u.id, u]));
  const rows = matrix.unassigned ? [...matrix.rows, matrix.unassigned] : matrix.rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="workload">
      <ViewBar
        stats={
          <>
            <ViewStat value={people.length} label={people.length === 1 ? "person" : "people"} />
            <ViewStat value={matrix.scheduled} label="scheduled" />
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
        {measures.length > 1 && <ViewSelect value={measure} onChange={setMeasure} options={measures} ariaLabel="Measure" testId="workload-measure" />}
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
        <div className="inline-block min-w-full rounded-xl border border-border/60 bg-card shadow-xs">
          <table className="border-separate border-spacing-0 text-[13px]" style={{ minWidth: PERSON_WIDTH + periodList.length * PERIOD_WIDTH }}>
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 left-0 z-20 rounded-tl-xl border-r border-b border-border/60 bg-card px-4 py-2 text-left text-2xs font-semibold text-muted-foreground" style={{ width: PERSON_WIDTH, minWidth: PERSON_WIDTH }}>
                  {rows.length === 1 ? "1 person" : `${rows.length} rows`}
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
              {rows.map((row) => (
                <PersonRow key={row.personId ?? "unassigned"} row={row} user={row.personId ? userById.get(row.personId) : undefined} periods={periodList} ctx={ctx} measure={measure} />
              ))}
              {rows.length === 0 && (
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
                  Total
                </th>
                {matrix.totals.map((total, i) => (
                  <td key={periodList[i]?.startIso ?? i} className={cn("border-t border-border/60 px-2 py-2 text-center text-2xs font-semibold tabular", periodList[i]?.today && "bg-primary/5", total === 0 && "text-muted-foreground/40")}>
                    {total}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ row, user, periods: periodList, ctx, measure }: { row: WorkloadRow; user: User | undefined; periods: Period[]; ctx: AggregateContext; measure: Measure }) {
  const name = user?.displayName ?? "Unassigned";
  const roles = statusRoleCounts(row.itemIds, ctx);
  const total = row.itemIds.length;
  return (
    <tr data-testid="workload-row" data-person={row.personId ?? "unassigned"}>
      <th scope="row" className="sticky left-0 z-10 border-r border-b border-border/60 bg-card px-4 py-2 text-left font-normal">
        <div className="flex items-center gap-2.5">
          <UserAvatar user={user} size="sm" tooltip={false} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" title={name}>
              {name}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-strong" role="img" aria-label={`${roles.done} done, ${roles.progress} in progress, ${roles.stuck} stuck, ${roles.other} other`}>
                {total > 0 && (
                  <>
                    <span className="bg-green-500" style={{ width: `${(roles.done / total) * 100}%` }} />
                    <span className="bg-orange-400" style={{ width: `${(roles.progress / total) * 100}%` }} />
                    <span className="bg-red-500" style={{ width: `${(roles.stuck / total) * 100}%` }} />
                  </>
                )}
              </span>
              <span className="truncate text-2xs text-muted-foreground tabular">
                {row.open} open · <span className={cn(row.overdue > 0 && "font-medium text-red-600 dark:text-red-400")}>{row.overdue} overdue</span>
              </span>
            </div>
          </div>
        </div>
      </th>
      {row.cells.map((cell, i) => {
        const period = periodList[i];
        const value = measureItems(cell.itemIds, measure, ctx);
        const label = `${cell.itemIds.length} ${cell.itemIds.length === 1 ? "item" : "items"} for ${name}, ${period?.label ?? ""}`;
        return (
          <td key={period?.startIso ?? i} data-testid="workload-cell" data-level={cell.level} className={cn("border-b border-border/60 p-1 text-center", period?.today && "bg-primary/5")}>
            {cell.itemIds.length === 0 ? (
              <span className={cn("block h-8 leading-8 text-xs tabular", LEVEL_CLASSES[0])} aria-label={label}>
                –
              </span>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={label} className={cn("h-8 w-full rounded-lg text-xs font-semibold tabular transition-colors focus-visible:outline-2 focus-visible:outline-ring", LEVEL_CLASSES[cell.level])}>
                    {value}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="center">
                  <ItemList title={`${name} · ${period?.label ?? ""}`} itemIds={cell.itemIds} ctx={ctx} />
                </PopoverContent>
              </Popover>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/** The items behind a cell or a bar: name, status and due date, each opening the item. */
export function ItemList({ title, itemIds, ctx }: { title: string; itemIds: string[]; ctx: AggregateContext }) {
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
          return (
            <li key={id}>
              <button type="button" onClick={() => openItem(id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", model.isDone(id) && "text-muted-foreground line-through")} title={item.name}>
                  {item.name}
                </span>
                {label && <LabelPill label={label} size="sm" striped={isStuckLabel(status, label.id)} className="shrink-0" />}
                {due && <span className={cn("shrink-0 text-2xs tabular", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(due, now)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
