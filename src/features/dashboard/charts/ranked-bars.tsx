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
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-strong/80">
              <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${width}%`, background: row.color }} />
            </div>
            <span className="flex w-[4.25rem] shrink-0 items-baseline justify-end gap-1 tabular-nums">
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
