"use client";

import * as React from "react";
import type { NamedCount } from "@/features/dashboard/analytics";
import { cn } from "@/lib/utils";
import { formatCount, useSize } from "./chart-utils";
import { ChartEmpty } from "./ranked-bars";

interface MixProps {
  data: NamedCount[];
  /** Word under the centre figure. */
  totalLabel?: string;
  onSelect?: (row: NamedCount) => void;
  emptyMessage?: string;
  /** Show the ring; below this width the chart becomes a single stacked share bar. */
  ringMinWidth?: number;
  className?: string;
}

/**
 * Part-to-whole: a donut with a ranked legend beside it, or — when the panel is
 * too narrow for both — a single 100% stacked bar over the same legend. Hovering
 * a slice or a row highlights both.
 */
export function MixChart({ data, totalLabel = "total", onSelect, emptyMessage = "Nothing to split yet.", ringMinWidth = 360, className }: MixProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = React.useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <ChartEmpty message={emptyMessage} />;
  const narrow = width > 0 && width < ringMinWidth;
  return (
    <div ref={ref} className={cn("flex min-w-0 flex-col gap-3", !narrow && "sm:flex-row sm:items-center sm:gap-5", className)}>
      {narrow ? (
        <ShareBar data={data} total={total} active={active} setActive={setActive} onSelect={onSelect} totalLabel={totalLabel} />
      ) : (
        <Donut data={data} total={total} active={active} setActive={setActive} onSelect={onSelect} totalLabel={totalLabel} />
      )}
      <MixLegend data={data} total={total} active={active} setActive={setActive} onSelect={onSelect} />
    </div>
  );
}

function Donut({ data, total, active, setActive, onSelect, totalLabel }: { data: NamedCount[]; total: number; active: string | null; setActive: (id: string | null) => void; onSelect?: (row: NamedCount) => void; totalLabel: string }) {
  const size = 176;
  const stroke = 22;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const gap = data.length > 1 ? 2.5 : 0;
  // Where each slice starts along the ring, in the order the legend lists them.
  const offsets: number[] = [];
  data.reduce((acc, d) => {
    offsets.push(acc);
    return acc + (d.value / total) * c;
  }, 0);
  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${formatCount(total)} ${totalLabel}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, index) => {
            const length = Math.max(0, (d.value / total) * c - gap);
            const dash = `${length} ${c - length}`;
            return (
              <circle
                key={d.id ?? d.name}
                cx={size / 2}
                cy={size / 2}
                r={active === (d.id ?? d.name) ? r + 4 : r}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-(offsets[index] ?? 0)}
                strokeLinecap="butt"
                opacity={active === null || active === (d.id ?? d.name) ? 1 : 0.35}
                className={cn("transition-all duration-300", onSelect && "cursor-pointer")}
                onMouseEnter={() => setActive(d.id ?? d.name)}
                onMouseLeave={() => setActive(null)}
                onClick={onSelect ? () => onSelect(d) : undefined}
              >
                <title>{`${d.name}: ${formatCount(d.value)} (${Math.round((d.value / total) * 100)}%)`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold tracking-tight tabular">{formatCount(active ? (data.find((d) => (d.id ?? d.name) === active)?.value ?? total) : total)}</span>
        <span className="max-w-[6rem] truncate text-2xs uppercase tracking-wide text-muted-foreground">{active ? (data.find((d) => (d.id ?? d.name) === active)?.name ?? totalLabel) : totalLabel}</span>
      </div>
    </div>
  );
}

function ShareBar({ data, total, active, setActive, onSelect, totalLabel }: { data: NamedCount[]; total: number; active: string | null; setActive: (id: string | null) => void; onSelect?: (row: NamedCount) => void; totalLabel: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[22px] font-semibold tracking-tight tabular">{formatCount(total)}</span>
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
      </div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full ring-1 ring-border/60">
        {data.map((d) => (
          <div
            key={d.id ?? d.name}
            className={cn("h-full transition-opacity", onSelect && "cursor-pointer")}
            style={{ width: `${(d.value / total) * 100}%`, background: d.color, opacity: active === null || active === (d.id ?? d.name) ? 1 : 0.35 }}
            title={`${d.name}: ${formatCount(d.value)} (${Math.round((d.value / total) * 100)}%)`}
            onMouseEnter={() => setActive(d.id ?? d.name)}
            onMouseLeave={() => setActive(null)}
            onClick={onSelect ? () => onSelect(d) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function MixLegend({ data, total, active, setActive, onSelect, className }: { data: NamedCount[]; total: number; active: string | null; setActive: (id: string | null) => void; onSelect?: (row: NamedCount) => void; className?: string }) {
  return (
    <ul className={cn("min-w-0 flex-1 space-y-0.5 text-xs", className)}>
      {data.map((d) => {
        const key = d.id ?? d.name;
        const share = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <li key={key}>
            <div
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              className={cn("flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 transition-colors", onSelect && "cursor-pointer", active === key && "bg-accent/70")}
              title={d.detail}
              onMouseEnter={() => setActive(key)}
              onMouseLeave={() => setActive(null)}
              onClick={onSelect ? () => onSelect(d) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(d);
                      }
                    }
                  : undefined
              }
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate text-foreground">{d.name}</span>
              <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-border/80" />
              <span className="w-8 shrink-0 text-right text-2xs text-muted-foreground tabular">{share}%</span>
              <span className="w-10 shrink-0 text-right font-semibold tabular">{formatCount(d.value)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
