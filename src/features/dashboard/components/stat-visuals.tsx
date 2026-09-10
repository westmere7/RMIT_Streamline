"use client";

import * as React from "react";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { cn } from "@/lib/utils";

/**
 * Small graphics for figures that would otherwise be read rather than seen.
 *
 * The dashboard's job is to be understood from across a desk. A row of numbers
 * makes a manager read and compare; a ring, a bar and a sparkline let them see
 * the same thing and only read the ones that matter. Nothing here invents a
 * measure — each shape encodes a value that was already on the page.
 */

/**
 * A proportion, as a ring with the figure inside it.
 *
 * Used where a number is only meaningful against a total: 154 done means
 * nothing until you know it is of 483. The ring is the ratio and the number is
 * the count, so both readings are available without a second glance.
 */
export function StatRing({
  value,
  total,
  label,
  tone = "neutral",
  size = 60,
  format = formatCount,
  testId,
}: {
  value: number;
  total: number;
  label: string;
  tone?: "neutral" | "good" | "urgent";
  size?: number;
  /** How the two figures read. Hours are not counts, so effort passes its own. */
  format?: (value: number) => string;
  testId?: string;
}) {
  const share = total > 0 ? Math.min(1, value / total) : 0;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colour = tone === "good" ? "var(--ring-good)" : tone === "urgent" ? "var(--ring-urgent)" : "var(--ring-neutral)";

  return (
    <div
      className="flex items-center gap-2.5 [--ring-good:theme(colors.emerald.500)] [--ring-neutral:theme(colors.slate.400)] [--ring-urgent:theme(colors.rose.500)]"
      data-testid={testId}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${format(value)} of ${format(total)} ${label}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-border/60" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={colour}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        />
      </svg>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular tracking-tight">{format(value)}</p>
        <p className="mt-1 truncate text-2xs text-muted-foreground">{label}</p>
        {total > 0 && <p className="text-2xs tabular text-muted-foreground/80">{Math.round(share * 100)}% of {format(total)}</p>}
      </div>
    </div>
  );
}

/**
 * One figure with the share it represents drawn under it.
 *
 * For the operations strip, where four counts overlap and none of them is a
 * fraction of the others — the bar is each count against the largest of them,
 * which is a comparison the reader can make at a glance without the page
 * pretending they sum to anything.
 */
export function StatBar({
  value,
  peak,
  label,
  tone = "neutral",
  onSelect,
  hint,
  testId,
}: {
  value: number;
  peak: number;
  label: string;
  tone?: "neutral" | "urgent" | "good";
  onSelect?: () => void;
  hint?: string;
  testId?: string;
}) {
  const share = peak > 0 ? Math.max(0.02, value / peak) : 0;
  const Tag = onSelect && value > 0 ? "button" : "div";
  return (
    <Tag
      {...(onSelect && value > 0 ? { type: "button" as const, onClick: onSelect } : {})}
      title={hint}
      className={cn(
        "flex flex-col items-start rounded-xl border border-border/50 bg-surface/50 px-3 py-2.5 text-left transition-colors",
        onSelect && value > 0 && "hover:border-border hover:bg-surface-strong/60",
      )}
      data-testid={testId}
    >
      <span className={cn("text-2xl font-semibold leading-none tabular tracking-tight", tone === "urgent" && value > 0 && "text-destructive", tone === "good" && "text-emerald-600 dark:text-emerald-400")}>
        {formatCount(value)}
      </span>
      <span className="mt-1 text-2xs leading-tight text-muted-foreground">{label}</span>
      <span aria-hidden className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border/60">
        <span
          className={cn("block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", tone === "urgent" ? "bg-destructive" : tone === "good" ? "bg-emerald-500" : "bg-foreground/50")}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </Tag>
  );
}

/**
 * A run of monthly values as one line, sized to sit inside a headline card.
 *
 * Twelve numbers nobody would read, in a shape anybody can. The last point is
 * marked because "where are we now" is the question a trend is asked.
 */
export function TrendLine({ values, className, label }: { values: Array<number | null>; className?: string; label: string }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;
  const peak = Math.max(1, ...points.map((p) => p.v));
  const width = 100;
  const height = 28;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * width;
  const y = (v: number) => height - (v / peak) * (height - 3) - 1.5;
  const path = points.map((p, index) => `${index === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  const area = `${path} L${x(last.i).toFixed(1)},${height} L${x(points[0]!.i).toFixed(1)},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-7 w-full", className)}>
      <path d={area} className="fill-primary/10" />
      <path d={path} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-primary" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2} className="fill-primary" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * A single 100 % bar, split by category.
 *
 * The compact form of a donut: it says the same thing in a tenth of the height,
 * which is what makes room for the operational lists underneath.
 */
export function ShareBar({ data, className, testId }: { data: Array<{ name: string; value: number; color: string }>; className?: string; testId?: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return null;
  return (
    <div className={className} data-testid={testId}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {data.map((row) => (
          <span key={row.name} title={`${row.name}: ${formatCount(row.value)}`} style={{ width: `${(row.value / total) * 100}%`, background: row.color }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs">
        {data.map((row) => (
          <li key={row.name} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ background: row.color }} />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="font-medium tabular">{formatCount(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
