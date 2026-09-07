import type { BoardColumn, ColumnLabel, ColumnSettings, ColumnType, ColumnValue, PriorityColumnSettings, StatusColumnSettings } from "@/domain";
import { STATUS_LABEL_ROLES, columnLabels, statusLabelRole } from "@/domain";

/**
 * Pure rules for keeping two items on different boards in sync. Boards carry
 * different column layouts, so a change is translated column-by-column:
 *
 *  1. `mapColumns` pairs the columns two boards have in common.
 *  2. `translateValue` rewrites a value for the paired column (status labels by
 *     name, single-assignee people columns, text ↔ long text) or reports why it
 *     cannot be represented on the other board.
 *
 * Nothing here touches storage, so the UI can show the same "what syncs"
 * summary the service acts on.
 */

/** Column types whose values only make sense on their own board. */
// Dependencies point at items on their own board; a recap is derived from the item's own asset lines.
export const UNSYNCED_COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(["DEPENDENCY", "ASSETS_RECAP"]);

export interface ColumnMapping {
  source: BoardColumn;
  target: BoardColumn;
}

export interface ColumnMappingReport {
  mapped: ColumnMapping[];
  /** Source columns with no counterpart on the target board. */
  unmapped: BoardColumn[];
  /** Target columns nothing on the source board feeds. */
  targetOnly: BoardColumn[];
}

/**
 * Types where a board usually has one column of that kind, so a lone column on
 * each side is the same thing under a different name ("Owner" ↔ "Designer").
 * Free-form types (text, numbers, tags…) only pair up by name: "Notes" and
 * "Format" are both text but not the same field.
 */
const LONE_MATCH_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(["STATUS", "PRIORITY", "PERSON", "DATE", "TIMELINE"]);

const norm = (name: string): string => name.trim().toLowerCase();

/** Two column names that the mapping treats as the same header. */
export function sameColumnName(a: string, b: string): boolean {
  return norm(a) === norm(b);
}
const isText = (type: ColumnType): boolean => type === "TEXT" || type === "LONG_TEXT";

/** Same type, or text/long text which share a text payload. */
export function compatibleTypes(a: ColumnType, b: ColumnType): boolean {
  return a === b || (isText(a) && isText(b));
}

/**
 * Pairs source columns with target columns. Exact name matches win; after that a
 * status/priority/people/date/timeline/files column that is the only one of its
 * type on both boards pairs up even when the names differ ("Owner" ↔ "Designer",
 * "Due Date" ↔ "Delivery"). Anything else is reported as unmapped so the user can
 * see what will not sync.
 */
export function mapColumns(source: readonly BoardColumn[], target: readonly BoardColumn[]): ColumnMappingReport {
  const src = source.filter((c) => !UNSYNCED_COLUMN_TYPES.has(c.type));
  const tgt = target.filter((c) => !UNSYNCED_COLUMN_TYPES.has(c.type));
  const taken = new Set<string>();
  const mapped: ColumnMapping[] = [];
  const pending: BoardColumn[] = [];

  for (const s of src) {
    const match = tgt.find((t) => !taken.has(t.id) && compatibleTypes(s.type, t.type) && norm(t.name) === norm(s.name));
    if (match) {
      taken.add(match.id);
      mapped.push({ source: s, target: match });
    } else {
      pending.push(s);
    }
  }

  const unmapped: BoardColumn[] = [];
  for (const s of pending) {
    const loneOnSource = LONE_MATCH_TYPES.has(s.type) && src.filter((c) => c.type === s.type).length === 1;
    const candidates = tgt.filter((t) => !taken.has(t.id) && t.type === s.type);
    if (loneOnSource && candidates.length === 1) {
      const [match] = candidates;
      taken.add(match!.id);
      mapped.push({ source: s, target: match! });
    } else {
      unmapped.push(s);
    }
  }

  mapped.sort((a, b) => a.source.position - b.source.position);
  return { mapped, unmapped, targetOnly: tgt.filter((t) => !taken.has(t.id)) };
}

export type ValueTranslation = { kind: "value"; value: ColumnValue } | { kind: "skip"; reason: string };

/** Rewrites `value` from `source` so it can be stored in `target`. */
export function translateValue(value: ColumnValue, source: BoardColumn, target: BoardColumn): ValueTranslation {
  switch (value.type) {
    case "STATUS":
    case "PRIORITY": {
      if (value.labelId === null) return { kind: "value", value: { type: value.type, labelId: null } };
      const label = columnLabels(source).find((l) => l.id === value.labelId);
      const match = label ? columnLabels(target).find((l) => norm(l.name) === norm(label.name)) : undefined;
      if (!match)
        return {
          kind: "skip",
          reason: `${target.name} has no “${label?.name ?? value.labelId}” label`,
        };
      return { kind: "value", value: { type: value.type, labelId: match.id } };
    }
    case "PERSON": {
      const single = target.settings.kind === "person" && !target.settings.allowMultiple;
      return {
        kind: "value",
        value: {
          type: "PERSON",
          userIds: single ? value.userIds.slice(0, 1) : [...value.userIds],
        },
      };
    }
    case "TEXT":
    case "LONG_TEXT":
      return {
        kind: "value",
        value: target.type === "LONG_TEXT" ? { type: "LONG_TEXT", text: value.text } : { type: "TEXT", text: value.text },
      };
    case "DEPENDENCY":
      return {
        kind: "skip",
        reason: "Dependencies point at items on their own board",
      };
    default:
      return { kind: "value", value };
  }
}

/** Structural equality for stored values (they are plain JSON). */
export function valuesEqual(a: ColumnValue | undefined, b: ColumnValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---- label definitions ---------------------------------------------------------

/**
 * Carries an edit to a status or priority column's labels over to the paired
 * column on a linked board, so a value that syncs by label name keeps landing:
 * a label renamed here is renamed there (found by its old name), a new label
 * is added there, and colour and meaning (done / stuck / in progress) follow
 * the name. Labels are never removed on the other board; its values may still
 * point at them. Returns null when there is nothing to change.
 */
const hasLabels = (settings: ColumnSettings): settings is StatusColumnSettings | PriorityColumnSettings => settings.kind === "status" || settings.kind === "priority";

export function syncLabelDefinitions(before: ColumnSettings, after: ColumnSettings, target: ColumnSettings, newLabelId: () => string): ColumnSettings | null {
  if (!hasLabels(before) || !hasLabels(after) || !hasLabels(target)) return null;
  if (before.kind !== after.kind || target.kind !== after.kind) return null;

  const beforeById = new Map(before.labels.map((l) => [l.id, l]));
  const labels: ColumnLabel[] = target.labels.map((l) => ({ ...l }));
  const byName = (name: string) => labels.find((l) => norm(l.name) === norm(name));
  // Target label id ← the source label it now corresponds to.
  const pairs = new Map<string, ColumnLabel>();
  let changed = false;

  for (const label of after.labels) {
    const previous = beforeById.get(label.id);
    let match: ColumnLabel | undefined;
    if (previous && norm(previous.name) !== norm(label.name)) {
      // Renamed: follow the old name, unless the new name is already taken there.
      // A rename that collides with a label already there is left alone: nothing safe to do.
      if (byName(label.name)) continue;
      const old = byName(previous.name);
      if (old) {
        old.name = label.name;
        changed = true;
        match = old;
      }
    } else match = byName(label.name);

    if (!match) {
      if (!previous) {
        // Brand new on the source: add it.
        match = { id: newLabelId(), name: label.name, color: label.color };
        labels.push(match);
        changed = true;
      } else continue;
    }
    if (match.color !== label.color) {
      match.color = label.color;
      changed = true;
    }
    pairs.set(match.id, label);
  }

  if (after.kind === "status" && target.kind === "status") {
    const roles = syncStatusRoles(after, target, labels, pairs);
    if (roles.changed) changed = true;
    if (!changed) return null;
    return { ...target, labels, ...roles.settings };
  }
  if (!changed) return null;
  return { ...target, labels };
}

/** Roles follow the paired label: whatever the source label means, the target label means too. */
function syncStatusRoles(
  source: StatusColumnSettings,
  target: StatusColumnSettings,
  labels: ColumnLabel[],
  pairs: Map<string, ColumnLabel>,
): { changed: boolean; settings: Pick<StatusColumnSettings, "doneLabelIds" | "stuckLabelIds" | "progressLabelIds"> } {
  const next: Record<(typeof STATUS_LABEL_ROLES)[number], string[]> = {
    done: [...(target.doneLabelIds ?? [])],
    stuck: [...(target.stuckLabelIds ?? [])],
    progress: [...(target.progressLabelIds ?? [])],
  };
  let changed = false;
  for (const label of labels) {
    const paired = pairs.get(label.id);
    if (!paired) continue;
    const wanted = statusLabelRole(source, paired.id);
    for (const role of STATUS_LABEL_ROLES) {
      const has = next[role].includes(label.id);
      if (role === wanted && !has) {
        next[role].push(label.id);
        changed = true;
      } else if (role !== wanted && has) {
        next[role] = next[role].filter((id) => id !== label.id);
        changed = true;
      }
    }
  }
  return { changed, settings: { doneLabelIds: next.done, stuckLabelIds: next.stuck, progressLabelIds: next.progress } };
}
