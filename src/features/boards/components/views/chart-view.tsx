"use client";

import { ChartBar, ChartPie } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBoardContext } from "@/features/boards/board-context";
import { useViewSettings } from "@/features/boards/components/views/view-settings";
import { Segmented, ViewBar, ViewControl, ViewEmpty, ViewSelect, ViewStat } from "@/features/boards/components/views/view-shell";
import {
  availableDimensions,
  availableMeasures,
  contextFromModel,
  DIMENSION_LABELS,
  groupItems,
  isItemDone,
  isItemOverdue,
  itemDueDate,
  measureItems,
  type AggregateContext,
  type Bucket,
  type GroupDimension,
  type Measure,
} from "@/features/boards/components/views/view-aggregates";
import { ItemList } from "@/features/boards/components/views/workload-view";
import { useBoardAssets } from "@/features/items/asset-hooks";
import { colorClasses } from "@/lib/colors";
import { bucketDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

type ChartType = "bars" | "donut";

interface Slice extends Bucket {
  value: number;
  /** Hex used for the SVG fill. */
  fill: string;
}

/** Bars and slices for a bucket without a colour of its own. */
const NEUTRAL_FILL = colorClasses("gray").hex;

export function ChartView() {
  const { board, model, users, now } = useBoardContext();
  const assets = useBoardAssets(board.id);
  const [settings, updateSettings] = useViewSettings("chart", { dimension: "status" as GroupDimension, measure: "count" as Measure, type: "bars" as ChartType });
  const { dimension, measure, type } = settings;
  const setDimension = (next: GroupDimension) => updateSettings({ dimension: next });
  const setMeasure = (next: Measure) => updateSettings({ measure: next });
  const setType = (next: ChartType) => updateSettings({ type: next });

  const ctx = React.useMemo(() => contextFromModel(model, now, users, assets.data), [model, now, users, assets.data]);
  const items = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);

  // A dimension or measure can vanish when a column is removed; fall back quietly.
  const dimensions = availableDimensions(model.columns);
  const measures = availableMeasures(model.columns, (assets.data?.length ?? 0) > 0);
  const activeDimension = dimensions.includes(dimension) ? dimension : (dimensions[0] ?? "group");
  const activeMeasure = measures.some((m) => m.value === measure) ? measure : "count";

  // Cheap enough to redo every render: one pass over the visible items.
  const slices: Slice[] = groupItems(items, activeDimension, ctx).map((bucket) => ({ ...bucket, value: measureItems(bucket.itemIds, activeMeasure, ctx), fill: bucket.color ? colorClasses(bucket.color).hex : NEUTRAL_FILL }));

  const stats = React.useMemo(() => {
    let done = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    for (const item of items) {
      const isDone = isItemDone(item.id, ctx);
      if (isDone) done += 1;
      if (isItemOverdue(item.id, ctx)) overdue += 1;
      const bucket = bucketDate(itemDueDate(item.id, ctx), now);
      if (!isDone && (bucket === "today" || bucket === "thisWeek")) dueThisWeek += 1;
    }
    return { total: items.length, donePercent: items.length ? Math.round((done / items.length) * 100) : 0, overdue, dueThisWeek };
  }, [items, ctx, now]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chart">
      <ViewBar
        stats={
          <>
            <ViewStat value={stats.total} label={stats.total === 1 ? "item" : "items"} />
            <ViewStat value={`${stats.donePercent}%`} label="done" tone={stats.donePercent === 100 && stats.total > 0 ? "good" : "neutral"} />
            <ViewStat value={stats.overdue} label="overdue" tone={stats.overdue > 0 ? "warn" : "neutral"} testId="chart-overdue" />
            <ViewStat value={stats.dueThisWeek} label="due this week" />
          </>
        }
      >
        <ViewControl label="Show">
          <ViewSelect value={activeMeasure} onChange={setMeasure} options={measures} ariaLabel="Measure" testId="chart-measure" />
        </ViewControl>
        <ViewControl label="By">
          <ViewSelect value={activeDimension} onChange={setDimension} options={dimensions.map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))} ariaLabel="Dimension" testId="chart-dimension" />
        </ViewControl>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "bars", label: "Bars", icon: ChartBar },
            { value: "donut", label: "Donut", icon: ChartPie },
          ]}
          ariaLabel="Chart type"
          testId="chart-type"
        />
      </ViewBar>

      {items.length === 0 ? (
        <ViewEmpty title="Nothing to chart" description={model.isFiltered ? "No items match the current search or filters." : "Add items to this board to see them summed up here."} />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-surface/50 p-5">
          <section aria-label={`${measures.find((m) => m.value === activeMeasure)?.label ?? "Items"} by ${DIMENSION_LABELS[activeDimension]}`} className="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="mb-4 text-[13px] font-semibold tracking-tight">
              {measures.find((m) => m.value === activeMeasure)?.label ?? "Items"} <span className="font-normal text-muted-foreground">by {DIMENSION_LABELS[activeDimension].toLowerCase()}</span>
            </h3>
            {type === "bars" ? <BarChart slices={slices} ctx={ctx} /> : <DonutChart slices={slices} ctx={ctx} />}
          </section>
        </div>
      )}
    </div>
  );
}

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** The width of an element, kept current as the panel or window resizes. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The observer reports once on observe, so the first width arrives without a separate read.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A round number at or above the largest value, so the grid lands on readable steps. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

const ROW = 30;
const BAR = 18;
const LABEL_W = 168;
const VALUE_W = 64;
const AXIS_H = 20;
const MIN_PLOT_W = 120;
const DEFAULT_W = 640;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
}

function BarChart({ slices, ctx }: { slices: Slice[]; ctx: AggregateContext }) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const [open, setOpen] = React.useState<string | null>(null);
  // Draw at a sensible width until the first measurement lands, so there is no blank frame.
  const width = measured || DEFAULT_W;
  const plotWidth = Math.max(MIN_PLOT_W, width - LABEL_W - VALUE_W);
  const max = niceMax(Math.max(0, ...slices.map((s) => s.value)));
  const height = slices.length * ROW + AXIS_H;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const maxChars = Math.floor((LABEL_W - 12) / 6.5);

  return (
    <div ref={ref} className="w-full overflow-hidden">
      <svg width={width} height={height} role="list" aria-label="Bar chart" className="block text-foreground" data-testid="chart-bars">
          {/* Grid and axis */}
          {ticks.map((t) => {
            const x = LABEL_W + t * plotWidth;
            return (
              <g key={t} aria-hidden>
                <line x1={x} x2={x} y1={0} y2={slices.length * ROW} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={x} y={slices.length * ROW + 14} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} className="fill-current text-2xs tabular text-muted-foreground">
                  {formatValue(t * max)}
                </text>
              </g>
            );
          })}
          {slices.map((slice, i) => {
            const y = i * ROW;
            const barWidth = max > 0 ? Math.max(0, (slice.value / max) * plotWidth) : 0;
            const label = `${slice.label}: ${formatValue(slice.value)} (${slice.itemIds.length} ${slice.itemIds.length === 1 ? "item" : "items"})`;
            return (
              <Popover key={slice.key} open={open === slice.key} onOpenChange={(next) => setOpen(next ? slice.key : null)}>
                <PopoverTrigger asChild>
                  <g
                    role="listitem"
                    tabIndex={0}
                    aria-label={label}
                    data-testid="chart-bar"
                    className="cursor-pointer outline-none focus-visible:[&>rect:last-of-type]:stroke-ring"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(slice.key);
                      }
                    }}
                  >
                    <title>{label}</title>
                    {/* Hit area for the whole row */}
                    <rect x={0} y={y} width={width} height={ROW} fill="transparent" />
                    <text x={LABEL_W - 12} y={y + ROW / 2} dominantBaseline="middle" textAnchor="end" className="fill-current text-[13px]">
                      {truncate(slice.label, maxChars)}
                    </text>
                    <rect x={LABEL_W} y={y + (ROW - BAR) / 2} width={Math.max(barWidth, slice.value > 0 ? 2 : 0)} height={BAR} rx={4} fill={slice.fill} className="transition-opacity hover:opacity-80" strokeWidth={2} stroke="transparent" />
                    <text x={LABEL_W + plotWidth + 10} y={y + ROW / 2} dominantBaseline="middle" className="fill-current text-xs font-semibold tabular">
                      {formatValue(slice.value)}
                    </text>
                  </g>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start" side="bottom">
                  <ItemList title={slice.label} itemIds={slice.itemIds} ctx={ctx} />
                </PopoverContent>
              </Popover>
            );
          })}
      </svg>
    </div>
  );
}

const DONUT_SIZE = 220;
const DONUT_R = 80;
const DONUT_STROKE = 28;

function DonutChart({ slices, ctx }: { slices: Slice[]; ctx: AggregateContext }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const circumference = 2 * Math.PI * DONUT_R;
  const arcs: Array<Slice & { share: number; length: number; offset: number }> = [];
  for (const slice of slices) {
    const share = total > 0 ? Math.max(0, slice.value) / total : 0;
    const previous = arcs[arcs.length - 1];
    arcs.push({ ...slice, share, length: share * circumference, offset: previous ? previous.offset + previous.length : 0 });
  }

  return (
    <div className="flex flex-wrap items-center gap-8" data-testid="chart-donut">
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} role="img" aria-label={`Donut chart: ${arcs.map((a) => `${a.label} ${formatValue(a.value)}`).join(", ")}`} className="shrink-0 text-foreground">
        <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_R} fill="none" stroke="var(--border)" strokeWidth={DONUT_STROKE} />
        <g transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}>
          {arcs.map((arc) =>
            arc.length > 0 ? (
              <circle
                key={arc.key}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_R}
                fill="none"
                stroke={arc.fill}
                strokeWidth={open === arc.key ? DONUT_STROKE + 6 : DONUT_STROKE}
                strokeDasharray={`${Math.max(0, arc.length - 1.5)} ${circumference - Math.max(0, arc.length - 1.5)}`}
                strokeDashoffset={-arc.offset}
              >
                <title>{`${arc.label}: ${formatValue(arc.value)} (${Math.round(arc.share * 100)}%)`}</title>
              </circle>
            ) : null,
          )}
        </g>
        <text x={DONUT_SIZE / 2} y={DONUT_SIZE / 2 - 4} textAnchor="middle" className="fill-current text-2xl font-semibold tabular">
          {formatValue(total)}
        </text>
        <text x={DONUT_SIZE / 2} y={DONUT_SIZE / 2 + 16} textAnchor="middle" className="fill-current text-2xs text-muted-foreground">
          total
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5" aria-label="Legend">
        {arcs.map((arc) => (
          <li key={arc.key}>
            <Popover open={open === arc.key} onOpenChange={(next) => setOpen(next ? arc.key : null)}>
              <PopoverTrigger asChild>
                <button type="button" data-testid="chart-legend-item" aria-label={`${arc.label}: ${formatValue(arc.value)}, ${Math.round(arc.share * 100)} percent`} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", open === arc.key && "bg-accent")}>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.fill }} />
                  <span className="min-w-0 flex-1 truncate" title={arc.label}>
                    {arc.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular">{formatValue(arc.value)}</span>
                  <span className="w-10 shrink-0 text-right text-2xs text-muted-foreground tabular">{Math.round(arc.share * 100)}%</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <ItemList title={arc.label} itemIds={arc.itemIds} ctx={ctx} />
              </PopoverContent>
            </Popover>
          </li>
        ))}
      </ul>
    </div>
  );
}
