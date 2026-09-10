"use client";

import * as React from "react";
import type { NamedCount } from "@/features/dashboard/analytics";
import { cn } from "@/lib/utils";
import { formatCount } from "./chart-utils";

/**
 * A ranked list of proportional bars — axis-free, one line per row: label, a
 * filled track, then the value. `secondary` (when the rows carry one) is shown
 * as a second, quieter figure beside the first.
 */
export function RankedBars({
  data,
  onSelect,
  emptyMessage = "Nothing to rank yet.",
  secondaryLabel,
  valueLabel,
  max: maxOverride,
  leading,
  className,
  compact,
}: {
  data: NamedCount[];
  onSelect?: (row: NamedCount) => void;
  emptyMessage?: string;
  /** Word for the second figure, for the tooltip ("assets"). */
  secondaryLabel?: string;
  valueLabel?: string;
  max?: number;
  /** A small element rendered before each label (an avatar, an icon). */
  leading?: (row: NamedCount) => React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  if (data.length === 0) return <ChartEmpty message={emptyMessage} />;
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.value));
  const clickable = !!onSelect;
  // A row carrying both figures needs room for the pair: "10,367 · 5,877" in
  // 4.25rem wrapped onto a second line and threw the row out of alignment.
  // Widened for the whole list rather than per row, so the bars still line up.
  const paired = data.some((row) => row.secondary != null);
  return (
    <div className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1", className)} role="list">
      {data.map((row) => {
        const width = Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100);
        const tip = [`${formatCount(row.value)} ${valueLabel ?? ""}`.trim(), row.secondary != null && secondaryLabel ? `${formatCount(row.secondary)} ${secondaryLabel}` : null, row.detail].filter(Boolean).join(" · ");
        return (
          <div
            key={row.id ?? row.name}
            role={clickable ? "button" : "listitem"}
            tabIndex={clickable ? 0 : undefined}
            title={tip}
            onClick={clickable ? () => onSelect(row) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(row);
                    }
                  }
                : undefined
            }
            className={cn("group flex items-center gap-2.5 rounded-md -mx-1 px-1 text-xs transition-colors", compact ? "py-px" : "py-0.5", clickable && "cursor-pointer hover:bg-accent/70")}
          >
            <span className="flex w-[7.5rem] shrink-0 items-center gap-1.5 truncate text-foreground" title={row.name}>
              {leading?.(row)}
              <span className="truncate">{row.name}</span>
            </span>
            {/* Capped, because a bar is a comparison and not a progress meter:
                given the full width of the page the track ran to nearly 900px,
                and with one row at 10,148 against another at 39 that is a 3px
                fill in a 900px tube. The cap is set to clear a half-row panel —
                there it does not bind and the bar fills its panel — so it only
                takes effect on a track that would otherwise be absurd. It never
                binds in the narrow composition column either, where the track is
                a couple of hundred pixels wide anyway. */}
            <div className="h-2 max-w-[34rem] flex-1 overflow-hidden rounded-full bg-surface-strong/80">
              <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${width}%`, background: row.color }} />
            </div>
            <span className={cn("flex shrink-0 items-baseline gap-1 whitespace-nowrap tabular-nums", paired ? "w-[7rem] justify-start" : "w-[4.25rem] justify-end")}>
              <span className="font-semibold text-foreground">{formatCount(row.value)}</span>
              {row.secondary != null && <span className="text-2xs text-muted-foreground">· {formatCount(row.secondary)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartEmpty({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[7rem] flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 px-4 text-center text-xs text-muted-foreground", className)}>{message}</div>
  );
}
