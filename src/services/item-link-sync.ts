import type { BoardColumn, ColumnType, ColumnValue } from "@/domain";
import { columnLabels } from "@/domain";

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
export const UNSYNCED_COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(["DEPENDENCY"]);

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
const LONE_MATCH_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(["STATUS", "PRIORITY", "PERSON", "DATE", "TIMELINE", "FILES"]);

const norm = (name: string): string => name.trim().toLowerCase();
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
