"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The strip every non-table view puts under the toolbar: its own controls on
 * the left (zoom, period, what to count) and a few figures on the right that
 * say what is on screen. One height, one background, so the views read as a
 * family and the controls sit where the eye expects them.
 */
export function ViewBar({ children, stats, className }: { children?: React.ReactNode; stats?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 bg-surface/40 px-5 py-1.5", className)} data-testid="view-bar">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {stats && <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{stats}</div>}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Spoken name when the label alone is terse ("D" → "Days"). */
  ariaLabel?: string;
}

/** A pill group for a small, exclusive choice: zoom level, period, chart type. */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, className, testId }: { value: T; onChange: (value: T) => void; options: ReadonlyArray<SegmentedOption<T>>; ariaLabel: string; className?: string; testId?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex h-8 items-center rounded-full border border-border/70 bg-card p-0.5 text-xs shadow-xs", className)} data-testid={testId}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel ?? option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active ? "bg-foreground text-background shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
          >
            {Icon && <Icon className="size-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "12 items", "3 overdue" — one figure with its word, coloured only when it needs attention. */
export function ViewStat({ value, label, tone = "neutral", testId }: { value: React.ReactNode; label: string; tone?: "neutral" | "warn" | "good"; testId?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", tone === "warn" && "text-red-600 dark:text-red-400", tone === "good" && "text-green-700 dark:text-green-400")} data-testid={testId}>
      <span className="font-semibold text-foreground tabular">{value}</span>
      <span>{label}</span>
    </span>
  );
}

/** A labelled control in the view bar: "By ▾ Status". */
export function ViewControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A compact native select styled like the pills, for choices with more options than a pill group carries. */
export function ViewSelect<T extends string>({ value, onChange, options, ariaLabel, testId }: { value: T; onChange: (value: T) => void; options: ReadonlyArray<{ value: T; label: string }>; ariaLabel: string; testId?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      data-testid={testId}
      className="h-8 rounded-full border border-border/70 bg-card px-2.5 pr-7 text-xs font-medium text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** What a view shows when the board has nothing it can plot. */
export function ViewEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
