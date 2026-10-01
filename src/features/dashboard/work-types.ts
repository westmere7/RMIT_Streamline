import type { AssetRates, WorkType, WorkTypes } from "@/domain";
import { effortHours, workTypesOf } from "@/domain";
import type { AssetFact } from "@/features/dashboard/analytics";
import type { MeasureKind } from "@/features/dashboard/metrics";

/**
 * The team's output read as a profile across work types.
 *
 * Each deliverable line belongs to its asset type's work type, and a work type's value
 * is what its lines come to in the page's measure: units, hours (by the output
 * rates), or the number of tasks with work in it. One person's profile is the
 * lines they are in charge of. Lines in a type with no work type are counted apart
 * so the page can say how much the picture leaves out.
 */
export interface WorkTypeRow {
  workType: WorkType;
  value: number;
  /** The same in the comparison period; null when there is none to compare with. */
  comparison: number | null;
  units: number;
  doneUnits: number;
  taskIds: Set<string>;
  /** The types that make up most of it, biggest first. */
  topTypes: Array<{ type: string; units: number }>;
}

export interface WorkTypeProfile {
  rows: WorkTypeRow[];
  total: number;
  comparisonTotal: number | null;
  /** Units on lines whose type belongs to no workType. */
  unassignedUnits: number;
  unassignedTypes: string[];
}

function lineValue(asset: AssetFact, measure: MeasureKind, rates: AssetRates): number {
  if (measure === "effort") return effortHours([{ type: asset.type, units: asset.units }], rates);
  return asset.units;
}

function tally(assets: readonly AssetFact[], workTypes: WorkTypes, measure: MeasureKind, rates: AssetRates, personId: string | null) {
  const byWorkType = new Map<string, { value: number; units: number; done: number; tasks: Set<string>; types: Map<string, number> }>();
  let unassigned = 0;
  const unassignedTypes = new Set<string>();
  for (const asset of assets) {
    if (personId !== null && !asset.assignees.includes(personId)) continue;
    const kinds = workTypesOf(workTypes, asset.type);
    if (kinds.length === 0) {
      unassigned += asset.units;
      unassignedTypes.add(asset.type);
      continue;
    }
    // A type in several work types counts in each of them.
    for (const workType of kinds) {
      const entry = byWorkType.get(workType.id) ?? { value: 0, units: 0, done: 0, tasks: new Set<string>(), types: new Map<string, number>() };
      entry.value += lineValue(asset, measure, rates);
      entry.units += asset.units;
      if (asset.done) entry.done += asset.units;
      entry.tasks.add(asset.taskId);
      entry.types.set(asset.type, (entry.types.get(asset.type) ?? 0) + asset.units);
      byWorkType.set(workType.id, entry);
    }
  }
  return { byWorkType, unassigned, unassignedTypes: [...unassignedTypes].sort((a, b) => a.localeCompare(b)) };
}

export function workTypeProfile(current: readonly AssetFact[], comparison: readonly AssetFact[] | null, workTypes: WorkTypes, measure: MeasureKind, rates: AssetRates, personId: string | null = null): WorkTypeProfile {
  const now = tally(current, workTypes, measure, rates, personId);
  const then = comparison ? tally(comparison, workTypes, measure, rates, personId) : null;
  // A task counted once per work type it touches, in the tasks measure.
  const valueOf = (entry: { value: number; tasks: Set<string> } | undefined) => (entry ? (measure === "tasks" ? entry.tasks.size : entry.value) : 0);
  const rows: WorkTypeRow[] = workTypes.workTypes.map((workType) => {
    const entry = now.byWorkType.get(workType.id);
    return {
      workType,
      value: valueOf(entry),
      comparison: then ? valueOf(then.byWorkType.get(workType.id)) : null,
      units: entry?.units ?? 0,
      doneUnits: entry?.done ?? 0,
      taskIds: entry?.tasks ?? new Set<string>(),
      topTypes: [...(entry?.types ?? new Map<string, number>()).entries()].map(([type, units]) => ({ type, units })).sort((a, b) => b.units - a.units),
    };
  });
  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.value, 0),
    comparisonTotal: then ? rows.reduce((sum, r) => sum + (r.comparison ?? 0), 0) : null,
    unassignedUnits: now.unassigned,
    unassignedTypes: now.unassignedTypes,
  };
}

/** Everyone in charge of a line in the period, busiest first, for the person picker. */
export function workTypeContributors(assets: readonly AssetFact[], workTypes: WorkTypes): Array<{ userId: string; units: number }> {
  const units = new Map<string, number>();
  for (const asset of assets) {
    if (workTypesOf(workTypes, asset.type).length === 0) continue;
    for (const id of asset.assignees) units.set(id, (units.get(id) ?? 0) + asset.units);
  }
  return [...units.entries()].map(([userId, u]) => ({ userId, units: u })).sort((a, b) => b.units - a.units);
}
