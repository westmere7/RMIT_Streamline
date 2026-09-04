import type { TrackerColumn, TrackerRow, TrackerSheet, TrackerSheetInput } from "@/domain";
import { newId } from "@/lib/ids";

/**
 * The Domestic Campaigns Asset Tracker layout, lifted from the team's workbook:
 * one row per creative asset (or per size of an asset), grouped under phase and
 * channel bands, with dropdowns for the fields the team keeps consistent.
 * Only the structure comes from the workbook — every value in the app is demo data.
 */

/** Fill colours the workbook uses for status cells (Excel conditional formatting). */
export const STATUS_COLORS: Record<string, string> = {
  "YET TO BRIEF": "FFC7CE",
  BRIEFED: "DDEBF7",
  "IN PROGRESS": "FFEB9C",
  "NEEDS REVIEW": "EBB5DB",
  "FILE DELIVERY": "D9E1F2",
  COMPLETED: "C6EFCE",
};

export const YES_NO_COLORS: Record<string, string> = { Y: "C6EFCE", N: "FFC7CE" };

/** Soft chip fills in the order new options pick them up (Google Sheets-like pastels). */
export const CHIP_PALETTE = ["D9E1F2", "C6EFCE", "FFEB9C", "FFDDB3", "FFC7CE", "EBB5DB", "E2D6F7", "C8F0EA", "E5E7EB", "FDE68A", "BFDBFE", "D1FAE5"] as const;

/** Text colour on every chip; the palette is light enough for dark text in both themes. */
export const CHIP_TEXT = "1C1D2B";

/**
 * Every dropdown option gets a colour: explicit ones win, the rest take palette
 * colours by position. Custom values (not in `options`) have none and render as
 * neutral chips.
 */
export function resolveOptionColors(column: Pick<TrackerColumn, "options" | "optionColors">): Record<string, string> {
  const colors: Record<string, string> = {};
  const used = new Set(Object.values(column.optionColors ?? {}));
  let next = 0;
  for (const option of column.options ?? []) {
    const explicit = column.optionColors?.[option];
    if (explicit) {
      colors[option] = explicit;
      continue;
    }
    while (next < CHIP_PALETTE.length - 1 && used.has(CHIP_PALETTE[next]!)) next++;
    const pick = CHIP_PALETTE[next % CHIP_PALETTE.length]!;
    colors[option] = pick;
    used.add(pick);
    next++;
  }
  return colors;
}

/** Colour for one value, or `undefined` when it is a custom value outside the dropdown. */
export function chipColor(column: Pick<TrackerColumn, "options" | "optionColors">, value: string): string | undefined {
  return resolveOptionColors(column)[value];
}

/** First palette colour not yet used by the column, for a freshly added option. */
export function nextChipColor(column: Pick<TrackerColumn, "options" | "optionColors">): string {
  const used = new Set(Object.values(resolveOptionColors(column)));
  return CHIP_PALETTE.find((c) => !used.has(c)) ?? CHIP_PALETTE[(column.options?.length ?? 0) % CHIP_PALETTE.length]!;
}

/** Band colours: phase rows are cyan, channel rows light blue, headers RMIT navy. */
export const TEMPLATE_STYLE = {
  headerFill: "000054",
  headerText: "FFFFFF",
  sectionFill: "00B0F0",
  sectionText: "FFFFFF",
  subsectionFill: "9FC5E8",
  subsectionText: "1C1D2B",
} as const;

export interface TemplateColumnSpec {
  key: string;
  name: string;
  type: TrackerColumn["type"];
  width: number;
  options?: string[];
  optionColors?: Record<string, string>;
}

/** Excel character widths from the workbook × 7 ≈ pixels. */
export const DOMESTIC_CAMPAIGNS_COLUMNS: TemplateColumnSpec[] = [
  { key: "channel", name: "CHANNEL", type: "list", width: 150, options: ["Facebook and Instagram", "YouTube", "The Age (HPTO)", "Display", "ATAR Notes", "Spotify"] },
  { key: "stage", name: "STAGE", type: "list", width: 150, options: ["Prospecting (Connect)", "Remarketing (Convert)"] },
  { key: "targeting", name: "TARGETING", type: "list", width: 120, options: ["ALL", "SL", "PG", "UG NSL", "VE", "India", "China"] },
  { key: "objective", name: "OBJECTIVE", type: "text", width: 130 },
  { key: "status", name: "STATUS", type: "list", width: 130, options: Object.keys(STATUS_COLORS), optionColors: STATUS_COLORS },
  { key: "format", name: "Format", type: "text", width: 110 },
  { key: "message", name: "MESSAGE", type: "longText", width: 320 },
  { key: "cta", name: "CTA", type: "text", width: 120 },
  { key: "staticCopy", name: "STATIC COPY", type: "longText", width: 220 },
  { key: "image", name: "Image Suggestion", type: "text", width: 140 },
  { key: "landingPage", name: "LANDING PAGE URL", type: "url", width: 200 },
  { key: "fileReview", name: "FILE REVIEW", type: "text", width: 110 },
  { key: "developedBy", name: "DEVELOPED BY", type: "list", width: 130, options: ["Cyclone", "Vietnam", "Comms", "Other", "Existing content"] },
  { key: "sizes", name: "SIZES/FORMAT", type: "text", width: 140 },
  { key: "specsLink", name: "SPECS LINK", type: "url", width: 160 },
  { key: "firstDraft", name: "First Draft Deadline", type: "date", width: 130 },
  { key: "materialDeadline", name: "MATERIAL DEADLINE", type: "date", width: 130 },
  { key: "liveDate", name: "LIVE DATE", type: "date", width: 120 },
  { key: "endDate", name: "END DATE", type: "date", width: 120 },
  { key: "notes", name: "PROGRESS / NOTES / Phase", type: "longText", width: 220 },
  { key: "approved", name: "APPROVED", type: "text", width: 130 },
  { key: "despatched", name: "DESPATCHED?", type: "text", width: 120 },
  { key: "fileLocation", name: "FILE LOCATION", type: "url", width: 200 },
];

/** Columns frozen while scrolling: channel → format, as in the workbook's freeze panes. */
export const DOMESTIC_CAMPAIGNS_FROZEN = 6;

export interface TemplateColumns {
  columns: TrackerColumn[];
  /** Template key → generated column id, for building rows. */
  ids: Record<string, string>;
}

export function buildTemplateColumns(specs: TemplateColumnSpec[] = DOMESTIC_CAMPAIGNS_COLUMNS, idFor: (key: string) => string = () => newId()): TemplateColumns {
  const ids: Record<string, string> = {};
  const columns = specs.map((spec) => {
    const id = idFor(spec.key);
    ids[spec.key] = id;
    const column: TrackerColumn = { id, name: spec.name, type: spec.type, width: spec.width };
    if (spec.options) column.options = spec.options;
    if (spec.optionColors) column.optionColors = spec.optionColors;
    return column;
  });
  return { columns, ids };
}

/** An empty sheet in the tracker layout, ready for typing. */
export function emptyTemplateSheet(trackerId: string, name: string, rowCount = 12): TrackerSheetInput {
  const { columns } = buildTemplateColumns();
  const rows: TrackerRow[] = Array.from({ length: rowCount }, () => ({ id: newId(), kind: "data", cells: {} }));
  return { trackerId, name, columns, rows, frozenColumns: DOMESTIC_CAMPAIGNS_FROZEN };
}

/** A generic blank sheet (used when a tracker is not campaign-shaped). */
export function blankSheet(trackerId: string, name: string): TrackerSheetInput {
  const columns: TrackerColumn[] = Array.from({ length: 6 }, (_, i) => ({ id: newId(), name: `Column ${i + 1}`, type: "text", width: 160 }));
  const rows: TrackerRow[] = Array.from({ length: 20 }, () => ({ id: newId(), kind: "data", cells: {} }));
  return { trackerId, name, columns, rows, frozenColumns: 1 };
}

export type DemoRowSpec = { section: string } | { subsection: string } | { cells: Record<string, string | number | boolean | null> };

/** Turns template-keyed demo rows into stored rows. `idFor` keeps ids stable for seeds. */
export function buildRows(specs: DemoRowSpec[], ids: Record<string, string>, idFor: () => string = newId): TrackerRow[] {
  return specs.map((spec) => {
    if ("section" in spec) return { id: idFor(), kind: "section", label: spec.section, cells: {} };
    if ("subsection" in spec) return { id: idFor(), kind: "subsection", label: spec.subsection, cells: {} };
    const cells: TrackerRow["cells"] = {};
    for (const [key, value] of Object.entries(spec.cells)) {
      const id = ids[key];
      if (id && value !== null && value !== "") cells[id] = value;
    }
    return { id: idFor(), kind: "data", cells };
  });
}

export function sheetLooksLikeTemplate(sheet: Pick<TrackerSheet, "columns">): boolean {
  const names = new Set(sheet.columns.map((c) => c.name.trim().toUpperCase()));
  return names.has("CHANNEL") && names.has("STATUS") && names.has("MESSAGE");
}
