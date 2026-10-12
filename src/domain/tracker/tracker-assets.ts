import type { EntityId } from "@/domain/common/types";
import type { AssetLink } from "@/domain/item/item-asset";
import { personIds, personValue, type TrackerAssetMapping, type TrackerCellValue, type TrackerColumn, type TrackerSheet } from "@/domain/tracker/tracker";

/**
 * A tracker sheet as a task's deliverables.
 *
 * A linked sheet's data rows are the task's asset lines: the same lines the
 * Assets tab, the recap and progress columns, My Work, Workload and the
 * dashboard already count. They are worked out here, from the sheet and its
 * mapping, and written by TrackerService after each save; nothing else reads
 * the sheet to count assets, so there is one way a row becomes a line.
 */

/** One asset line as the sheet says it should be. */
export interface SheetAssetLine {
  rowId: string;
  name: string;
  assetType: string | null;
  quantity: number | null;
  assigneeIds: EntityId[];
  dueDate: string | null;
  done: boolean;
  notes: string | null;
  links: AssetLink[];
  /** The band (phase or channel) the row sits under, shown as a block. */
  blockId: string | null;
  blockName: string | null;
  position: number;
}

/** Who a name in a text PIC column may be. */
export interface AssetPerson {
  id: EntityId;
  name: string;
  email?: string | null;
}

export function emptyAssetMapping(): TrackerAssetMapping {
  return {
    name: null,
    type: { columnId: null, value: null },
    quantity: { columnId: null, value: null },
    pic: { columnId: null, value: null },
    due: { columnId: null, value: null },
    done: { columnId: null, values: [] },
    spec: [],
    links: [],
  };
}

/** A stored mapping made safe to read: unknown shapes become empty, and columns that no longer exist are dropped. */
export function normalizeAssetMapping(raw: unknown, columns: readonly TrackerColumn[]): TrackerAssetMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<Record<keyof TrackerAssetMapping, unknown>>;
  const ids = new Set(columns.map((c) => c.id));
  const column = (id: unknown) => (typeof id === "string" && ids.has(id) ? id : null);
  const source = <T>(value: unknown, read: (v: unknown) => T | null) => {
    const s = (value && typeof value === "object" ? value : {}) as { columnId?: unknown; value?: unknown };
    return { columnId: column(s.columnId), value: read(s.value) };
  };
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const done = (m.done && typeof m.done === "object" ? m.done : {}) as { columnId?: unknown; values?: unknown };
  return {
    name: column(m.name),
    type: source(m.type, text),
    quantity: source(m.quantity, (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)),
    pic: source(m.pic, (v) => (Array.isArray(v) ? v.filter((id): id is string => typeof id === "string" && !!id) : null)),
    due: source(m.due, (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
    done: { columnId: column(done.columnId), values: Array.isArray(done.values) ? done.values.filter((v): v is string => typeof v === "string") : [] },
    spec: Array.isArray(m.spec) ? m.spec.map((id) => (specBreakKind(id) ? (id as string) : column(id))).filter((id): id is string => !!id) : [],
    links: Array.isArray(m.links) ? m.links.map(column).filter((id): id is string => !!id) : [],
  };
}

/**
 * A spec line can be broken up between its columns: a divider ("Duration: 30s
 * | Ratio: 9:16") or a new line. Each sits in `spec` beside the column ids as
 * "sep:<id>" or "br:<id>", so it can be dragged into place like a column.
 */
export type SpecBreakKind = "sep" | "br";

export function specBreakKind(id: unknown): SpecBreakKind | null {
  return typeof id === "string" ? (id.startsWith("sep:") ? "sep" : id.startsWith("br:") ? "br" : null) : null;
}

export function newSpecBreak(kind: SpecBreakKind): string {
  return `${kind}:${Math.random().toString(36).slice(2, 10)}`;
}

/** Choices that read as finished, offered as the Done values of a dropdown. */
const DONE_WORDS = /^(done|complete|completed|delivered|approved|final|finished|live|published|sent|signed off|closed)$/i;

/** A dropdown's choices that read as finished, ticked as its Done values when it is chosen. */
export function doneChoicesOf(column: Pick<TrackerColumn, "type" | "options">): string[] {
  return column.type === "list" ? (column.options ?? []).filter((o) => DONE_WORDS.test(o)) : [];
}

/** The part a column plays in a sheet's assets. */
export type AssetRole = "name" | "type" | "quantity" | "pic" | "due" | "done" | "spec" | "link";

export const ASSET_ROLES: readonly AssetRole[] = ["name", "type", "quantity", "pic", "due", "done", "spec", "link"];

/** The part a column plays, or null. */
export function assetRoleOf(mapping: TrackerAssetMapping | null | undefined, columnId: string): AssetRole | null {
  if (!mapping) return null;
  if (mapping.name === columnId) return "name";
  if (mapping.type.columnId === columnId) return "type";
  if (mapping.quantity.columnId === columnId) return "quantity";
  if (mapping.pic.columnId === columnId) return "pic";
  if (mapping.due.columnId === columnId) return "due";
  if (mapping.done.columnId === columnId) return "done";
  if (mapping.spec.includes(columnId)) return "spec";
  if (mapping.links.includes(columnId)) return "link";
  return null;
}

/**
 * Gives a column one part, or none: it leaves whatever part it played, and
 * takes a single part (name, type, quantity, PIC, due, done) over from the
 * column that had it. Any column can play any part; a value for every row is
 * kept.
 */
export function assignAssetRole(mapping: TrackerAssetMapping, column: Pick<TrackerColumn, "id" | "type" | "options">, role: AssetRole | null): TrackerAssetMapping {
  const id = column.id;
  const off = <T extends { columnId: string | null }>(source: T): T => (source.columnId === id ? { ...source, columnId: null } : source);
  const next: TrackerAssetMapping = {
    name: mapping.name === id ? null : mapping.name,
    type: off(mapping.type),
    quantity: off(mapping.quantity),
    pic: off(mapping.pic),
    due: off(mapping.due),
    done: mapping.done.columnId === id ? { columnId: null, values: [] } : mapping.done,
    spec: mapping.spec.filter((c) => c !== id),
    links: mapping.links.filter((c) => c !== id),
  };
  if (role === "name") next.name = id;
  else if (role === "type" || role === "quantity" || role === "pic" || role === "due") next[role] = { ...next[role], columnId: id } as never;
  else if (role === "done") next.done = { columnId: id, values: doneChoicesOf(column) };
  else if (role === "spec") next.spec = [...next.spec, id];
  else if (role === "link") next.links = [...next.links, id];
  return next;
}

/**
 * What to write in a text cell so it reads back as this person and nobody
 * else: the first of their names that resolves to them alone, else their
 * email. Two people can share a display name (a real account and a demo
 * person, say), and the first of them would otherwise take the line.
 */
export function cellNameFor(id: EntityId, people: readonly AssetPerson[]): string | null {
  const own = people.filter((p) => p.id === id);
  const candidates = [...own.map((p) => p.name), ...own.map((p) => p.email ?? "")].filter(Boolean);
  for (const candidate of candidates) {
    const found = resolvePeople(candidate, people);
    if (found.length === 1 && found[0] === id) return candidate;
  }
  return candidates[0] ?? null;
}

/** What a role calls one value it reads, for the warning about cells it cannot. */
const ROLE_VALUE: Partial<Record<AssetRole, string>> = { quantity: "a number", pic: "a person", due: "a date", link: "a web address" };

/**
 * How many filled cells of a column a role cannot read, for a warning before
 * the column takes it: text in a Quantity column, "next week" as a due date,
 * a name nobody has as the PIC. The sheet keeps those cells; the task's assets
 * just get nothing from them. Null when every cell reads (or the role reads
 * anything, like the name or a spec).
 */
export function roleMismatch(
  sheet: Pick<TrackerSheet, "columns" | "rows">,
  columnId: string,
  role: AssetRole | null,
  people: readonly AssetPerson[] = [],
): { unreadable: number; filled: number; expected: string } | null {
  const column = sheet.columns.find((c) => c.id === columnId);
  const expected = role ? ROLE_VALUE[role] : undefined;
  if (!column || !role || !expected) return null;
  let filled = 0;
  let unreadable = 0;
  for (const row of sheet.rows) {
    if (row.kind !== "data") continue;
    const value = row.cells[columnId];
    const text = cellText(value);
    if (!text) continue;
    filled++;
    if (!readsAs(role, column, value, text, people)) unreadable++;
  }
  return unreadable > 0 ? { unreadable, filled, expected } : null;
}

function readsAs(role: AssetRole, column: TrackerColumn, value: TrackerCellValue | undefined, text: string, people: readonly AssetPerson[]): boolean {
  switch (role) {
    case "quantity": {
      const n = typeof value === "number" ? value : Number(text.replace(/[,\s]/g, ""));
      return Number.isFinite(n) && n >= 0;
    }
    case "pic":
      return column.type === "person" ? personIds(value).length > 0 : resolvePeople(text, people).length > 0;
    case "due":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "link":
      return column.type === "url" || LOOKS_LIKE_URL.test(text);
    default:
      return true;
  }
}

/** What a ticked line writes into a Done column that is neither a checkbox nor has Done choices. */
export const DONE_TEXT = "Done";

/** What a line from a sheet can have changed on the task: each one cell of its row. */
export type SheetLineField = "name" | "assetType" | "quantity" | "assigneeIds" | "dueDate" | "completedAt" | "notes" | "links";

const SHEET_LINE_FIELD_LABELS: Record<SheetLineField, string> = {
  name: "name",
  assetType: "type",
  quantity: "quantity",
  assigneeIds: "PIC",
  dueDate: "due date",
  completedAt: "done mark",
  notes: "spec",
  links: "link",
};

/** The spec columns, without the dividers and line breaks between them. */
export function specColumnIds(mapping: Pick<TrackerAssetMapping, "spec">): string[] {
  return mapping.spec.filter((id) => !specBreakKind(id));
}

/**
 * The column each changeable part of a line is written to, where the mapping
 * has one. Spec and links are put together from their columns, so they can be
 * changed on the task only while one column gives them.
 */
export function sheetLineColumns(mapping: TrackerAssetMapping | null | undefined): Partial<Record<SheetLineField, string>> {
  if (!mapping) return {};
  const out: Partial<Record<SheetLineField, string>> = {};
  if (mapping.name) out.name = mapping.name;
  if (mapping.type.columnId) out.assetType = mapping.type.columnId;
  if (mapping.quantity.columnId) out.quantity = mapping.quantity.columnId;
  if (mapping.pic.columnId) out.assigneeIds = mapping.pic.columnId;
  if (mapping.due.columnId) out.dueDate = mapping.due.columnId;
  if (mapping.done.columnId) out.completedAt = mapping.done.columnId;
  const spec = specColumnIds(mapping);
  if (spec.length === 1) out.notes = spec[0];
  if (mapping.links.length === 1) out.links = mapping.links[0];
  return out;
}

export interface SheetLinePatch {
  name?: string;
  assetType?: string | null;
  quantity?: number | null;
  assigneeIds?: string[];
  dueDate?: string | null;
  completedAt?: string | null;
  /** The spec column's value alone, without its "Name: " (one spec column only). */
  notes?: string | null;
  /** The link column's address is the first link's (one link column only). */
  links?: Array<{ url: string }>;
  [other: string]: unknown;
}

/**
 * A change made to a sheet's line on the task, as the cells of its row to
 * write: the sheet stays the truth, and its save rewrites the line. Spec and
 * links put together from several columns, and a band (a row of its own), are
 * refused, as is a part no column gives (a value for every row is the sheet's,
 * not one row's).
 */
export function sheetLineCells(
  sheet: Pick<TrackerSheet, "columns">,
  mapping: TrackerAssetMapping,
  patch: SheetLinePatch,
  people: readonly AssetPerson[] = [],
): { cells: Array<{ columnId: string; value: TrackerCellValue }>; refused: string | null } {
  const targets = sheetLineColumns(mapping);
  const cells: Array<{ columnId: string; value: TrackerCellValue }> = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    if (!(key in SHEET_LINE_FIELD_LABELS)) return { cells: [], refused: "Bands come from the sheet. Change them there." };
    const field = key as SheetLineField;
    const several = (field === "notes" && specColumnIds(mapping).length > 1) || (field === "links" && mapping.links.length > 1);
    if (several) return { cells: [], refused: `The ${SHEET_LINE_FIELD_LABELS[field]} comes from several columns of the sheet. Change it there.` };
    const column = sheet.columns.find((c) => c.id === targets[field]);
    if (!column) return { cells: [], refused: `No column in the sheet gives the ${SHEET_LINE_FIELD_LABELS[field]}. Choose one in its asset settings.` };
    let value: TrackerCellValue;
    if (field === "name" || field === "notes") value = raw === null ? null : String(raw).trim() || null;
    else if (field === "links") value = (raw as Array<{ url: string }>)[0]?.url.trim() || null;
    else if (field === "assetType" || field === "dueDate") value = (raw as string | null) || null;
    else if (field === "quantity") value = raw === null ? null : column.type === "number" ? (raw as number) : String(raw);
    else if (field === "assigneeIds") {
      const ids = raw as string[];
      value = column.type === "person" ? personValue(ids) : ids.map((id) => cellNameFor(id, people) ?? "").filter(Boolean).join(", ") || null;
    } else {
      const done = raw !== null;
      if (column.type === "list" && mapping.done.values.length === 0) return { cells: [], refused: "No choice in the sheet's Done column means done. Choose one in its asset settings." };
      value = column.type === "checkbox" ? done : done ? (mapping.done.values[0] ?? DONE_TEXT) : null;
    }
    cells.push({ columnId: column.id, value });
  }
  return { cells, refused: null };
}

/**
 * A first guess at the mapping from the column names and types, so linking a
 * sheet is one click for a sheet laid out the usual way. Every guess is shown
 * and can be changed before anything is saved.
 */
export function suggestAssetMapping(sheet: Pick<TrackerSheet, "columns">): TrackerAssetMapping {
  const cols = sheet.columns;
  const used = new Set<string>();
  const pick = (test: (c: TrackerColumn) => boolean) => {
    const found = cols.find((c) => !used.has(c.id) && test(c));
    if (found) used.add(found.id);
    return found?.id ?? null;
  };
  const named = (re: RegExp) => (c: TrackerColumn) => re.test(c.name.trim());
  const mapping = emptyAssetMapping();
  mapping.pic.columnId = pick((c) => c.type === "person") ?? pick((c) => c.type === "text" && named(/^(pic|owner|designer|assignee|assigned to|who|in charge|person|people)$/i)(c));
  mapping.due.columnId = pick((c) => c.type === "date" && named(/due|deadline|live|delivery|deliver by|launch/i)(c)) ?? pick((c) => c.type === "date");
  mapping.quantity.columnId =
    pick((c) => c.type === "number" && named(/^(qty|quantity|count|units?|#|no\.?|number|amount|pieces|pcs|variants?|versions?|copies|sizes|formats)$/i)(c)) ??
    pick((c) => c.type === "number" && named(/qty|quantity|count|variants?|versions?|copies/i)(c));
  mapping.type.columnId = pick((c) => (c.type === "list" || c.type === "text") && named(/^(type|asset type|deliverable type|kind|category)$/i)(c));
  const done = pick((c) => c.type === "checkbox" && named(/done|complete|delivered|approved|final|signed[ -]?off|sign[ -]?off|sent|live|published|ready|finished/i)(c)) ?? pick((c) => c.type === "list" && named(/^status$|status|state|progress|stage/i)(c) && (c.options ?? []).some((o) => DONE_WORDS.test(o)));
  if (done) {
    const column = cols.find((c) => c.id === done)!;
    mapping.done = { columnId: done, values: column.type === "list" ? (column.options ?? []).filter((o) => DONE_WORDS.test(o)) : [] };
  }
  mapping.name =
    pick((c) => (c.type === "text" || c.type === "longText") && named(/^(asset|asset name|deliverable|item|name|title|piece|creative|headline)$/i)(c)) ??
    pick((c) => c.type === "text" && named(/asset|deliverable|name|title|message|copy|headline/i)(c)) ??
    pick((c) => c.type === "text") ??
    pick((c) => c.type === "longText" || c.type === "list");
  mapping.spec = cols.filter((c) => !used.has(c.id) && named(/^(format|size|dimensions?|spec|specs|specification|duration|resolution|ratio|aspect ratio)$/i)(c)).map((c) => c.id);
  mapping.links = cols.filter((c) => !used.has(c.id) && c.type === "url").map((c) => c.id);
  return mapping;
}

function cellText(value: TrackerCellValue | undefined): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "Yes";
  return String(value).trim();
}

/** Names in a text cell ("Jane, Tom & Mai") resolved to people: full name, first name or email, ignoring case. */
export function resolvePeople(text: string, people: readonly AssetPerson[]): EntityId[] {
  const ids: EntityId[] = [];
  for (const part of text.split(/[,;/&+\n]|\band\b/i)) {
    const needle = part.trim().toLowerCase();
    if (!needle) continue;
    const match =
      people.find((p) => p.name.toLowerCase() === needle || (p.email ?? "").toLowerCase() === needle) ??
      people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === needle) ??
      null;
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids;
}

/**
 * The asset lines a sheet stands for. Bands become blocks; a data row with no
 * name and no type is a blank row, not an asset. Values from a column win; the
 * mapping's value fills whatever the column leaves empty, or every row when no
 * column is chosen.
 */
export function sheetAssetLines(sheet: Pick<TrackerSheet, "columns" | "rows">, mapping: TrackerAssetMapping, people: readonly AssetPerson[] = []): SheetAssetLine[] {
  const byId = new Map(sheet.columns.map((c) => [c.id, c]));
  const col = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  const nameCol = col(mapping.name);
  const typeCol = col(mapping.type.columnId);
  const qtyCol = col(mapping.quantity.columnId);
  const picCol = col(mapping.pic.columnId);
  const dueCol = col(mapping.due.columnId);
  const doneCol = col(mapping.done.columnId);
  const doneValues = new Set(mapping.done.values.map((v) => v.toLowerCase()));
  const linkCols = mapping.links.map(col).filter((c): c is TrackerColumn => !!c);

  const lines: SheetAssetLine[] = [];
  let band: { id: string; name: string } | null = null;
  for (const row of sheet.rows) {
    if (row.kind !== "data") {
      band = { id: asUuid(row.id), name: row.label?.trim() || (row.kind === "section" ? "Phase" : "Channel") };
      continue;
    }
    const cell = (c: TrackerColumn | null) => (c ? row.cells[c.id] : undefined);
    const type = cellText(cell(typeCol)) || mapping.type.value || null;
    const name = cellText(cell(nameCol)) || (cellText(cell(typeCol)) ? type : null);
    if (!name) continue;

    const rawQty = cell(qtyCol);
    const qtyNumber = typeof rawQty === "number" ? rawQty : typeof rawQty === "string" && rawQty.trim() !== "" ? Number(rawQty.replace(/[,\s]/g, "")) : NaN;
    const quantity = Number.isFinite(qtyNumber) && qtyNumber >= 0 ? Math.round(qtyNumber) : mapping.quantity.value;

    const picCell = cell(picCol);
    const fromCell = picCol ? (picCol.type === "person" ? personIds(picCell) : resolvePeople(cellText(picCell), people)) : [];
    const assigneeIds = fromCell.length ? fromCell : (mapping.pic.value ?? []);

    const dueCell = cell(dueCol);
    const dueDate = typeof dueCell === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueCell) ? dueCell : mapping.due.value;

    const doneCell = cell(doneCol);
    const done = doneCol ? (doneCol.type === "checkbox" ? doneCell === true : isDoneText(cellText(doneCell), doneCol, doneValues)) : false;

    const spec = specText(mapping.spec, col, (c) => (c.type === "person" ? namesIn(row.cells[c.id], people) : cellText(row.cells[c.id])));
    const links: AssetLink[] = linkCols.flatMap((c) => {
      const url = cellText(row.cells[c.id]);
      // Only a link column is taken at its word; any other column's cell has to look like an address.
      return url && (c.type === "url" || LOOKS_LIKE_URL.test(url)) ? [{ id: `col-${c.id}`, label: c.name.slice(0, 60) || "Link", url: url.slice(0, 2000), icon: "link" as const }] : [];
    });

    lines.push({
      rowId: row.id,
      name: name.slice(0, 500),
      assetType: type,
      quantity,
      assigneeIds,
      dueDate,
      done,
      notes: spec || null,
      links,
      blockId: band?.id ?? null,
      blockName: band?.name ?? null,
      position: lines.length,
    });
  }
  return lines;
}

/**
 * "Name: value" for each spec column with a value, joined by " · ", or by a
 * divider or a new line where one was put. A break with nothing after it, or
 * before it, is left out.
 */
function specText(spec: readonly string[], col: (id: string) => TrackerColumn | null, valueOf: (column: TrackerColumn) => string): string {
  let out = "";
  let joiner = " · ";
  for (const id of spec) {
    const kind = specBreakKind(id);
    if (kind) {
      if (out) joiner = kind === "br" ? "\n" : " | ";
      continue;
    }
    const column = col(id);
    const value = column ? valueOf(column) : "";
    if (!column || !value) continue;
    out += `${out ? joiner : ""}${column.name}: ${value}`;
    joiner = " · ";
  }
  return out;
}

const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)\S+$/i;

/**
 * A text cell reads as done when it is one of the chosen values; a column that
 * is not a dropdown and has none chosen takes the usual words (Done, Delivered,
 * Approved…).
 */
function isDoneText(text: string, column: TrackerColumn, values: ReadonlySet<string>): boolean {
  if (!text) return false;
  if (values.size > 0) return values.has(text.toLowerCase());
  return column.type !== "list" && DONE_WORDS.test(text);
}

/** A People cell as names, for a spec line. */
function namesIn(value: TrackerCellValue | undefined, people: readonly AssetPerson[]): string {
  return personIds(value)
    .map((id) => people.find((p) => p.id === id)?.name ?? "")
    .filter(Boolean)
    .join(", ");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A block id is a uuid where it is stored, while a band's row id can be
 * anything an import or an older build gave it ("b1"). The same row always
 * gives the same uuid, so a sync never moves a line between blocks.
 */
export function asUuid(id: string): string {
  if (UUID.test(id)) return id.toLowerCase();
  const words = [0x811c9dc5, 0x01000193, 0x2545f491, 0x9e3779b9].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  });
  const hex = words.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** True when the mapping can make lines at all: it needs a column to name them, or one to type them. */
export function isMappingUsable(mapping: TrackerAssetMapping | null | undefined): mapping is TrackerAssetMapping {
  return !!mapping && (!!mapping.name || !!mapping.type.columnId);
}
