/**
 * The Progress column: how far a task's asset lines are done, read off the
 * Assets tab. Its settings say what is counted and how the cell shows it.
 */

/** Each line once ("3 of 4 things"), or by quantity, so a poster ×25 weighs 25. */
export const PROGRESS_COUNTS = ["lines", "units"] as const;
export type ProgressCount = (typeof PROGRESS_COUNTS)[number];

/** The bar and the number, or one of them. */
export const PROGRESS_DISPLAYS = ["both", "bar", "number"] as const;
export type ProgressDisplay = (typeof PROGRESS_DISPLAYS)[number];

/** How the number reads: 60% or 3/5. */
export const PROGRESS_NUMBERS = ["percent", "fraction"] as const;
export type ProgressNumber = (typeof PROGRESS_NUMBERS)[number];

export interface ProgressColumnSettings {
  kind: "progress";
  countBy: ProgressCount;
  display: ProgressDisplay;
  number: ProgressNumber;
}

export const DEFAULT_PROGRESS_SETTINGS: ProgressColumnSettings = { kind: "progress", countBy: "lines", display: "both", number: "percent" };

export const PROGRESS_COUNT_LABELS: Record<ProgressCount, string> = { lines: "Each asset once", units: "By quantity" };
export const PROGRESS_DISPLAY_LABELS: Record<ProgressDisplay, string> = { both: "Bar and number", bar: "Bar only", number: "Number only" };
export const PROGRESS_NUMBER_LABELS: Record<ProgressNumber, string> = { percent: "60%", fraction: "3/5" };

/** A column's settings, with anything missing filled in: columns made before settings existed store none. */
export function progressSettings(settings: { kind: string } | null | undefined): ProgressColumnSettings {
  if (settings?.kind !== "progress") return { ...DEFAULT_PROGRESS_SETTINGS };
  const s = settings as Partial<ProgressColumnSettings>;
  return {
    kind: "progress",
    countBy: PROGRESS_COUNTS.includes(s.countBy as ProgressCount) ? s.countBy! : DEFAULT_PROGRESS_SETTINGS.countBy,
    display: PROGRESS_DISPLAYS.includes(s.display as ProgressDisplay) ? s.display! : DEFAULT_PROGRESS_SETTINGS.display,
    number: PROGRESS_NUMBERS.includes(s.number as ProgressNumber) ? s.number! : DEFAULT_PROGRESS_SETTINGS.number,
  };
}

/** What a Progress value counts as, by the column's choice. Values stored before units were kept count lines. */
export function progressCounts(value: { done: number; total: number; doneUnits?: number; totalUnits?: number }, countBy: ProgressCount): { done: number; total: number } {
  if (countBy === "units" && value.totalUnits !== undefined) return { done: value.doneUnits ?? 0, total: value.totalUnits };
  return { done: value.done, total: value.total };
}

/** The number the cell shows: "60%" or "3/5". Empty when there is nothing to count. */
export function formatProgressNumber(counts: { done: number; total: number }, number: ProgressNumber): string {
  if (!counts.total) return "";
  return number === "fraction" ? `${counts.done}/${counts.total}` : `${Math.round((counts.done / counts.total) * 100)}%`;
}
