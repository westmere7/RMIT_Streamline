import type { TrackerCellValue, TrackerColumn, TrackerRow, TrackerSheet } from "@/domain/tracker/tracker";

/**
 * Two people editing one sheet, merged instead of overwritten.
 *
 * A sheet is saved as one document, so without this the second save wins and
 * the first person's typing is gone. Given the version both started from
 * (`base`), what this person has (`mine`) and what is on the server now
 * (`theirs`), every cell, column and row property takes whichever side changed
 * it; when both changed the same thing, `mine` wins, since it is what the
 * person in front of the screen just did. Rows and columns added on either side
 * are kept, and one deleted on either side stays deleted.
 */

type Grid = Pick<TrackerSheet, "columns" | "rows" | "frozenColumns"> & Partial<Pick<TrackerSheet, "assetMapping">>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function pick<T>(base: T, mine: T, theirs: T): T {
  return same(mine, base) ? theirs : mine;
}

/** Order: if this side reordered (relative order of shared ids moved), keep its order; else theirs. New ids from mine slot in after their neighbour. */
function mergeOrder<T extends { id: string }>(base: T[], mine: T[], theirs: T[], merged: Map<string, T>): T[] {
  const baseIds = base.map((x) => x.id);
  const mineIds = mine.map((x) => x.id);
  const shared = (ids: string[]) => ids.filter((id) => baseIds.includes(id) && merged.has(id));
  const mineReordered = !same(shared(mineIds), shared(baseIds).filter((id) => mineIds.includes(id)));
  const primary = mineReordered ? mineIds : theirs.map((x) => x.id);
  const secondary = mineReordered ? theirs.map((x) => x.id) : mineIds;
  const out: string[] = primary.filter((id) => merged.has(id));
  // Items only the other side has: after the item that precedes them there.
  secondary.forEach((id, index) => {
    if (out.includes(id) || !merged.has(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i--) {
      const before = out.indexOf(secondary[i]!);
      if (before !== -1) {
        at = before + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out.map((id) => merged.get(id)!);
}

function mergeEntities<T extends { id: string }>(base: T[], mine: T[], theirs: T[], mergeOne: (b: T, m: T, t: T) => T): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const merged = new Map<string, T>();
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    const inBase = b.get(id);
    const inMine = m.get(id);
    const inTheirs = t.get(id);
    if (inMine && inTheirs) merged.set(id, inBase ? mergeOne(inBase, inMine, inTheirs) : inMine);
    else if (inMine && !inBase) merged.set(id, inMine); // added here
    else if (inTheirs && !inBase) merged.set(id, inTheirs); // added there
    // In base and missing on one side: deleted there, so it stays deleted.
  }
  return mergeOrder(base, mine, theirs, merged);
}

function mergeColumn(b: TrackerColumn, m: TrackerColumn, t: TrackerColumn): TrackerColumn {
  const keys = new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)]) as Set<keyof TrackerColumn>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = pick(b[key], m[key], t[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as TrackerColumn;
}

function mergeRow(b: TrackerRow, m: TrackerRow, t: TrackerRow): TrackerRow {
  const cells: Record<string, TrackerCellValue> = {};
  for (const id of new Set([...Object.keys(b.cells), ...Object.keys(m.cells), ...Object.keys(t.cells)])) {
    const value = pick(b.cells[id], m.cells[id], t.cells[id]);
    if (value !== undefined && value !== null && value !== "") cells[id] = value;
  }
  const row: TrackerRow = { id: m.id, kind: pick(b.kind, m.kind, t.kind), cells };
  const label = pick(b.label, m.label, t.label);
  if (label !== undefined) row.label = label;
  return row;
}

export function mergeSheets<S extends Grid>(base: Grid, mine: S, theirs: Grid): S {
  const columns = mergeEntities(base.columns, mine.columns, theirs.columns, mergeColumn);
  const columnIds = new Set(columns.map((c) => c.id));
  const rows = mergeEntities(base.rows, mine.rows, theirs.rows, mergeRow).map((row) => {
    // A cell whose column was deleted on the other side goes with it.
    if (Object.keys(row.cells).every((id) => columnIds.has(id))) return row;
    return { ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([id]) => columnIds.has(id))) };
  });
  return {
    ...mine,
    columns,
    rows,
    frozenColumns: Math.min(pick(base.frozenColumns, mine.frozenColumns, theirs.frozenColumns), columns.length),
    assetMapping: pick(base.assetMapping ?? null, mine.assetMapping ?? null, theirs.assetMapping ?? null),
  };
}
