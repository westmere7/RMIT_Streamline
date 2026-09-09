import type { DashboardFacts } from "@/features/dashboard/analytics";
import type { AttentionRow, Coverage, MonthlyComparisonRow, OperationsSnapshot, VolumeReport } from "@/features/dashboard/metrics";
import type { TaskFact } from "@/features/dashboard/analytics";
import type { DashboardPrefs } from "@/features/dashboard/prefs";

/**
 * What every view is handed.
 *
 * Computed once in the screen and passed down, so the three views cannot
 * disagree about a figure: the Overview's headline and the Demand table are
 * literally the same `VolumeReport`, and a drill-down opens the records that
 * produced it.
 */
export interface DashboardViewProps {
  facts: DashboardFacts;
  report: VolumeReport;
  monthly: MonthlyComparisonRow[];
  /** The same series per measure, for the trend drawn inside each headline card. */
  monthlyTasks: MonthlyComparisonRow[];
  monthlyAssets: MonthlyComparisonRow[];
  ops: OperationsSnapshot;
  attentionRows: AttentionRow[];
  upcomingTasks: TaskFact[];
  gaps: Coverage;
  prefs: DashboardPrefs;
  set: (patch: Partial<DashboardPrefs>) => void;
  today: string;
  onOpenTask?: (taskId: string, boardId: string) => void;
  onOpenBoard?: (boardId: string) => void;
  /** True behind a public link: no people in the payload, so nothing about them is drawn. */
  publicLink?: boolean;
}
