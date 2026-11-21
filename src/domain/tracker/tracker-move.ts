import type { ItemAsset } from "@/domain/item/item-asset";
import { TRACKER_COLUMN_TYPE_LABELS, type TrackerAssetMapping, type TrackerColumn, type TrackerSheet } from "@/domain/tracker/tracker";
import { NEW_ASSET_COLUMN, cellNameFor, freeColumnName, specColumnIds, wrongColumnType, type AssetPerson, type AssetRole } from "@/domain/tracker/tracker-assets";

/**
 * Moving a task's own asset lines into its tracker sheet, worked out before
 * anything is written: which parts need a column the sheet lacks, what would
 * stop the move (a column that cannot hold what the lines have), and what the
 * lines would not keep exactly as they are. Nothing a line holds may go
 * quietly: either it lands in a cell, or it is listed here.
 */

/** A part with a value for every row as well as (or instead of) a column. */
export type FilledPart = "type" | "quantity" | "pic" | "due";

export interface LineMovePlan {
  /** Columns the sheet gets, by name, in the order they are added. */
  newColumns: string[];
  /** Why the lines cannot move as the sheet stands; nothing is written while there is one. */
  blockers: string[];
  /** Lines with nothing for a part that the sheet fills for every row: they take its value. */
  fills: Array<{ part: FilledPart; count: number; value: string | number | string[] }>;
  /** Links whose own name gives way to their column's name. */
  renamedLinks: number;
  /** Blocks whose shared links have no place in a sheet (a band holds a name only). */
  blockLinks: string[];
  /** People on the lines a text PIC column cannot name (nobody by that id in the workspace). */
  unnamedPeople: { column: string; count: number } | null;
}

const ROLE_VALUE: Record<Exclude<AssetRole, "spec">, string> = { name: "names", type: "types", quantity: "numbers", pic: "people", due: "dates", done: "done marks", link: "web addresses" };

/**
 * Where a moved line's notes go: a text spec column named for them (Notes,
 * Spec, Details…). Any other spec column means something of its own (a
 * format, a platform), so the notes get a column instead.
 */
export function notesColumnFor(columns: readonly TrackerColumn[], mapping: Pick<TrackerAssetMapping, "spec">): TrackerColumn | null {
  const spec = specColumnIds(mapping)
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is TrackerColumn => !!c && (c.type === "text" || c.type === "longText"));
  return spec.find((c) => /note|spec|detail|brief|description|comment/i.test(c.name)) ?? null;
}

/** The name the notes column gets: "Spec" in a sheet with no spec yet, else "Notes". */
export function newNotesColumnName(columns: readonly TrackerColumn[], mapping: Pick<TrackerAssetMapping, "spec">): string {
  return freeColumnName(columns, specColumnIds(mapping).length ? "Notes" : "Spec");
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** What a line holds for a part, or null when it holds nothing. */
function valueOf(line: ItemAsset, part: FilledPart): string | number | string[] | null {
  if (part === "type") return line.assetType?.trim() || null;
  if (part === "quantity") return line.quantity;
  if (part === "pic") return line.assigneeIds.length ? line.assigneeIds : null;
  return line.dueDate || null;
}

/** Whether a line's value reads back the same from the sheet's value for every row, so it needs no cell. */
function matchesFill(value: string | number | string[], fill: unknown): boolean {
  if (fill === null || fill === undefined) return false;
  if (Array.isArray(value)) return Array.isArray(fill) && sameSet(value, fill as string[]);
  return value === fill;
}

/**
 * Which parts the lines need a cell for: a part some line holds a value of
 * that the sheet's value for every row would not give back. A part every line
 * leaves empty, or holds exactly as the sheet fills it, is written nowhere.
 */
export function partsToWrite(mapping: TrackerAssetMapping, lines: readonly ItemAsset[]): Record<FilledPart | "done", boolean> {
  const needs = (part: FilledPart) =>
    lines.some((line) => {
      const value = valueOf(line, part);
      return value !== null && !matchesFill(value, mapping[part].value);
    });
  return { type: needs("type"), quantity: needs("quantity"), pic: needs("pic"), due: needs("due"), done: lines.some((l) => !!l.completedAt) };
}

export function planLineMove(sheet: Pick<TrackerSheet, "columns">, mapping: TrackerAssetMapping, lines: readonly ItemAsset[], people: readonly AssetPerson[]): LineMovePlan {
  const columns = sheet.columns;
  const byId = (id: string | null) => (id ? (columns.find((c) => c.id === id) ?? null) : null);
  const plan: LineMovePlan = { newColumns: [], blockers: [], fills: [], renamedLinks: 0, blockLinks: [], unnamedPeople: null };
  if (lines.length === 0) return plan;
  const names = columns.map((c) => ({ name: c.name }));
  const addColumn = (name: string) => {
    const free = freeColumnName(names, name);
    names.push({ name: free });
    plan.newColumns.push(free);
    return free;
  };
  const cannotHold = (column: TrackerColumn, role: Exclude<AssetRole, "spec">) => {
    const wrong = wrongColumnType(column, role);
    if (wrong) plan.blockers.push(`“${column.name}” is a ${TRACKER_COLUMN_TYPE_LABELS[wrong]} column and can't hold ${ROLE_VALUE[role]}. Change it in the sheet first.`);
  };

  const nameColumn = byId(mapping.name);
  if (!nameColumn) plan.blockers.push("Choose the column that names each asset first.");
  else cannotHold(nameColumn, "name");

  const writes = partsToWrite(mapping, lines);
  for (const part of ["type", "quantity", "pic", "due"] as const) {
    if (writes[part]) {
      const column = byId(mapping[part].columnId);
      if (column) cannotHold(column, part);
      else addColumn(NEW_ASSET_COLUMN[part].name);
    }
    const fill = mapping[part].value;
    const empty = lines.filter((l) => valueOf(l, part) === null).length;
    if (empty && fill !== null && fill !== undefined && !(Array.isArray(fill) && fill.length === 0) && fill !== "") plan.fills.push({ part, count: empty, value: fill });
  }

  if (writes.done) {
    const column = byId(mapping.done.columnId);
    if (!column) addColumn(NEW_ASSET_COLUMN.done.name);
    else {
      cannotHold(column, "done");
      if (column.type === "list" && mapping.done.values.length === 0) plan.blockers.push(`No choice in “${column.name}” means done. Choose one in the asset settings first.`);
    }
  }

  // A text PIC column holds names; somebody with none in the workspace would be dropped.
  const picColumn = byId(mapping.pic.columnId);
  if (writes.pic && picColumn && picColumn.type !== "person" && !wrongColumnType(picColumn, "pic")) {
    const unnamed = new Set(lines.flatMap((l) => l.assigneeIds).filter((id) => !cellNameFor(id, people)));
    if (unnamed.size) plan.unnamedPeople = { column: picColumn.name, count: unnamed.size };
  }

  // Links: the nth link of a line goes in the nth link column, and the sheet gets as many as the longest list needs.
  const linkColumns = mapping.links.map(byId).filter((c): c is TrackerColumn => !!c);
  const most = Math.max(0, ...lines.map((l) => l.links.length));
  const linkNames: string[] = [];
  for (let i = 0; i < most; i++) {
    const column = linkColumns[i];
    if (column) {
      cannotHold(column, "link");
      linkNames.push(column.name);
    } else linkNames.push(addColumn(NEW_ASSET_COLUMN.link.name));
  }
  for (const line of lines) {
    line.links.forEach((link, i) => {
      const label = link.label.trim();
      if (label && label !== linkNames[i]?.slice(0, 60)) plan.renamedLinks++;
    });
  }

  if (lines.some((l) => l.notes?.trim()) && !notesColumnFor(columns, mapping)) addColumn(newNotesColumnName(columns, mapping));

  plan.blockLinks = [...new Set(lines.filter((l) => l.blockName && l.blockLinks.length > 0).map((l) => l.blockName!))];
  plan.blockers = [...new Set(plan.blockers)];
  return plan;
}

/** Everyone a PIC cell may name, under each name they go by (as the sheet's sync reads them). */
export function assetPeopleOf(users: ReadonlyArray<{ id: string; displayName: string; firstName: string; lastName: string; email: string | null }>): AssetPerson[] {
  return users.flatMap((u) => {
    const full = `${u.firstName} ${u.lastName}`.trim();
    return [...new Set([u.displayName, full].filter(Boolean))].map((name) => ({ id: u.id, name, email: u.email }));
  });
}
