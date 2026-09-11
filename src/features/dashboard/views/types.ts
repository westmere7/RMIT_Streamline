import type { AssetRates } from "@/domain";
import type { DashboardFacts } from "@/features/dashboard/analytics";
import type { Coverage, MeasureKind, MonthlyComparisonRow, OperationsSnapshot, TaskValue, VolumeReport } from "@/features/dashboard/metrics";
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
  monthlyEffort: MonthlyComparisonRow[];
  /**
   * The workspace's output rates, so a view can weigh deliverables into hours
   * and name the types it had no rate for.
   */
  rates: AssetRates;
  ops: OperationsSnapshot;
  gaps: Coverage;
  prefs: DashboardPrefs;
  /**
   * What the page is being read in. Held here rather than read from `prefs`
   * because the screen falls back to tasks where no output rate exists, and
   * one panel disagreeing about that would be a page contradicting itself.
   */
  measure: MeasureKind;
  /** One task's worth in that measure. */
  valueOf: TaskValue;
  set: (patch: Partial<DashboardPrefs>) => void;
  today: string;
  onOpenTask?: (taskId: string, boardId: string) => void;
  onOpenBoard?: (boardId: string) => void;
}
