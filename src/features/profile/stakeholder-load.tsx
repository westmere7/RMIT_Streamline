"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildFacts } from "@/features/dashboard/analytics";
import { ChartEmpty, RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { useDashboardSnapshot, useToday } from "@/features/dashboard/hooks";
import { assignedWorkload, departmentHex, type WorkloadRow } from "@/features/dashboard/metrics";
import { useWorkspace } from "@/features/workspace/workspace-context";

/** The same window the dashboard's resourcing panel opens on by default. */
const WEEKS = 4;

/**
 * How much of one person's open work is for which stakeholder group.
 *
 * The same counts the dashboard shows, from the same snapshot and the same
 * function — `assignedWorkload` splits every row by group, and this reads one
 * row out of it. Nothing is recomputed here, so "how much does Danh do for
 * Communications" gives the same number on this page and on the dashboard,
 * whichever a manager happens to open.
 *
 * The snapshot is borrowed, not driven: this page does not put a whole
 * workspace read on the dashboard's fifteen-second loop for one panel.
 */
export function StakeholderLoad({ userId }: { userId: string }) {
  const ws = useWorkspace();
  const today = useToday();
  const snapshot = useDashboardSnapshot(ws.workspace.id, ws.boards, { live: false });

  const row = React.useMemo<WorkloadRow | null>(() => {
    if (!snapshot.data) return null;
    const rows = assignedWorkload(buildFacts(snapshot.data), today, null, WEEKS);
    return rows.find((r) => r.userId === userId) ?? null;
  }, [snapshot.data, today, userId]);

  if (snapshot.isPending) return <Skeleton className="h-24" />;
  if (snapshot.isError) return <p className="px-2 py-3 text-[13px] text-muted-foreground">The figures could not be read just now.</p>;
  if (!row || row.byDepartment.length === 0) return <ChartEmpty message="No open work for any stakeholder group." />;

  return (
    <>
      <RankedBars
        data={row.byDepartment.map((cell) => ({
          id: cell.key,
          name: cell.name,
          value: cell.tasks,
          color: departmentHex(cell.name),
          detail: cell.overdue > 0 ? `${cell.overdue} overdue` : undefined,
        }))}
        valueLabel="tasks"
        emptyMessage="No open work for any stakeholder group."
        compact
      />
      <p className="mt-2.5 border-t border-border/50 pt-2 text-2xs leading-relaxed text-muted-foreground">
        Open work due in the next {WEEKS} weeks, plus everything overdue or undated, by the group its task names. A task shared with somebody else counts for both.
      </p>
    </>
  );
}
