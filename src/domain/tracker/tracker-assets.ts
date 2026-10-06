import type { EntityId } from "@/domain/common/types";
import type { AssetLink } from "@/domain/item/item-asset";
import { personIds, type TrackerAssetMapping, type TrackerCellValue, type TrackerColumn, type TrackerSheet } from "@/domain/tracker/tracker";

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
    spec: Array.isArray(m.spec) ? m.spec.map(column).filter((id): id is string => !!id) : [],
    links: Array.isArray(m.links) ? m.links.map(column).filter((id): id is string => !!id) : [],
  };
}

/** Choices that read as finished, offered as the Done values of a dropdown. */
const DONE_WORDS = /^(done|complete|completed|delivered|approved|final|finished|live|published|sent|signed off|closed)$/i;

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
  const specCols = mapping.spec.map(col).filter((c): c is TrackerColumn => !!c);
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
    const done = doneCol ? (doneCol.type === "checkbox" ? doneCell === true : doneValues.has(cellText(doneCell).toLowerCase()) && cellText(doneCell) !== "") : false;

    const spec = specCols
      .map((c) => [c.name, cellText(row.cells[c.id])] as const)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    const links: AssetLink[] = linkCols.flatMap((c) => {
      const url = cellText(row.cells[c.id]);
      return url ? [{ id: `col-${c.id}`, label: c.name.slice(0, 60) || "Link", url: url.slice(0, 2000), icon: "link" as const }] : [];
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
