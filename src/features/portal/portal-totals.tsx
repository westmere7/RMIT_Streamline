"use client";

import type { PortalTotals } from "@/domain";

/**
 * The three figures a stakeholder opens the portal for.
 *
 * Computed on the server over every request the department has, not over
 * whatever the board happens to be filtering to — a count that moved when
 * somebody typed in the search box would be answering a different question
 * from the one being asked.
 */
export function PortalTotalsBar({ totals }: { totals: PortalTotals }) {
  return (
    <div className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-4 pb-3 pt-3.5 sm:px-6" data-testid="portal-totals">
      <Figure value={totals.requests} label={totals.requests === 1 ? "request" : "requests"} />
      <Figure value={totals.done} label="done" tone="text-emerald-600 dark:text-emerald-400" />
      {totals.overdue > 0 && <Figure value={totals.overdue} label="overdue" tone="text-destructive" />}
    </div>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tabular-nums tracking-tight ${tone ?? ""}`}>{value}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </span>
  );
}
