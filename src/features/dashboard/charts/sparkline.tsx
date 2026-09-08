"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BRAND_RED, MONTH_LABELS, formatCount } from "./chart-utils";

/** Twelve small columns, one per month; the current month is marked. */
export function MonthSparkline({ values, nowMonth, color = BRAND_RED, className, label = "per month" }: { values: number[]; nowMonth?: number | null; color?: string; className?: string; label?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-12 items-end gap-[3px]", className)} role="img" aria-label={`${label}: ${values.map(formatCount).join(", ")}`}>
      {values.map((v, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${MONTH_LABELS[i]}: ${formatCount(v)}`}>
          <div
            className={cn("w-full rounded-sm transition-[height] duration-500", i === nowMonth ? "ring-1 ring-offset-1 ring-offset-card ring-current" : "")}
            style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 100)}%`, background: color, opacity: v > 0 ? (i === nowMonth ? 1 : 0.75) : 0.18 }}
          />
        </div>
      ))}
    </div>
  );
}
