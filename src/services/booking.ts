import { z } from "zod";
import type { BoardColumn, BookingAssetLine, BookingExtraField, BookingFormTemplate, BookingRequest, BookingStandardKey, ColumnValue, PriorityColumnSettings, StatusColumnSettings, Team, Workspace } from "@/domain";
import {
  BOOKING_FIELD_TYPES,
  BOOKING_LOCKED_KEYS,
  BOOKING_STANDARD_KEYS,
  COLOR_TOKENS,
  T_SHIRT_SIZES,
  columnTagOptions,
  customFields,
  defaultBookingFormTemplate,
  formatAssetLine,
  isBookingFieldType,
  isEmptyValue,
  templateFields,
} from "@/domain";

/**
 * The booking form's rules, with nothing async in them so they can be tested
 * flat and shared by the browser (validation as you type) and the server.
 *
 * The hard part of booking is that every board has its own columns. A stakeholder
 * answers the same standard questions whichever team they pick; this module
 * works out where each answer goes on the board the booking lands on
 * (`mapBookingToColumns`), which questions a board asks on top of the standard
 * ones (`extraFieldsFor`), and writes anything that found no column into the
 * item's description (`describeBooking`) so no answer is ever dropped.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const columnValueSchema: z.ZodType<ColumnValue> = z.union([
  z.object({ type: z.literal("TEXT"), text: z.string().max(2000) }),
  z.object({ type: z.literal("LONG_TEXT"), text: z.string().max(10000) }),
  z.object({ type: z.literal("NUMBER"), number: z.number().nullable() }),
  z.object({ type: z.literal("DATE"), date: z.string().regex(ISO_DATE).nullable() }),
  z.object({ type: z.literal("LINK"), url: z.string().max(2000), text: z.string().max(200).nullable() }),
  z.object({ type: z.literal("CHECKBOX"), checked: z.boolean() }),
  z.object({ type: z.literal("TAGS"), tags: z.array(z.string().trim().min(1).max(60)).max(30) }),
  z.object({ type: z.literal("SIZE"), size: z.enum(T_SHIRT_SIZES).nullable() }),
]) as z.ZodType<ColumnValue>;

/** Trims, lowercases and rejects anything that is not an email or a URL, respectively. */
const email = z.email("Enter a valid email address").trim().toLowerCase().max(200);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Links need to start with http:// or https://");

export const bookingRequestSchema = z.object({
  requesterName: z.string().trim().min(2, "Tell us who is asking").max(120),
  requesterEmail: email,
  department: z.string().trim().max(160).nullable().default(null),
  title: z.string().trim().min(3, "Give the task a short name").max(200),
  brief: z.string().trim().min(10, "Describe what you need (a sentence or two is fine)").max(10000),
  assetTypes: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  assets: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Say what the asset is").max(160),
        quantity: z.number().int().min(1).max(9999).nullable().default(null),
        spec: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .max(50)
    .default([]),
  teamId: z.uuid().nullable().default(null),
  dueDate: z.string().regex(ISO_DATE, "Pick a date").nullable().default(null),
  priority: z.string().trim().max(60).nullable().default(null),
  referenceUrl: url.nullable().default(null),
  extra: z.record(z.string(), columnValueSchema).default({}),
  answers: z.record(z.string(), columnValueSchema).default({}),
  itemId: z.uuid().nullable().default(null),
});

export type BookingRequestInput = z.input<typeof bookingRequestSchema>;

// ---- the form's shape -------------------------------------------------------------

const tagOptionSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(COLOR_TOKENS as [string, ...string[]]) });

const fieldBase = {
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1, "Every question needs a label").max(120),
  hint: z.string().trim().max(300).nullable().default(null),
  placeholder: z.string().trim().max(200).nullable().default(null),
  required: z.boolean().default(false),
  width: z.enum(["full", "half"]).default("full"),
};

const standardFieldSchema = z.object({ kind: z.literal("standard"), key: z.enum(BOOKING_STANDARD_KEYS), ...fieldBase });
const customFieldSchema = z.object({
  kind: z.literal("custom"),
  type: z.enum(BOOKING_FIELD_TYPES),
  options: z.array(tagOptionSchema).max(40).default([]),
  destination: z.enum(["brief", "column"]),
  columnId: z.string().nullable().default(null),
  ...fieldBase,
});

/**
 * What an admin may save as the booking form. Beyond shape: every question has
 * its own id, no standard question appears twice, and the four the booking
 * cannot do without (who is asking, how to reach them, what the task is and
 * what it involves) are all still there.
 */
export const bookingFormTemplateSchema = z
  .object({
    version: z.literal(1),
    requestTabLabel: z.string().trim().min(1).max(40),
    sections: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          title: z.string().trim().min(1, "Every section needs a title").max(120),
          hint: z.string().trim().max(300).nullable().default(null),
          fields: z.array(z.discriminatedUnion("kind", [standardFieldSchema, customFieldSchema])).max(40),
        }),
      )
      .min(1, "The form needs at least one section")
      .max(20),
    assets: z.object({ enabled: z.boolean(), tabLabel: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(120), hint: z.string().trim().max(500) }),
    submitLabel: z.string().trim().min(1).max(60),
    submitNote: z.string().trim().max(200),
  })
  .superRefine((template, ctx) => {
    const fields = template.sections.flatMap((s) => s.fields);
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const field of fields) {
      if (ids.has(field.id)) ctx.addIssue({ code: "custom", message: `Two questions share the id “${field.id}”` });
      ids.add(field.id);
      if (field.kind === "standard") {
        if (keys.has(field.key)) ctx.addIssue({ code: "custom", message: `“${field.label}” asks the same thing twice` });
        keys.add(field.key);
      }
    }
    for (const key of BOOKING_LOCKED_KEYS) if (!keys.has(key)) ctx.addIssue({ code: "custom", message: `The form has to ask for the ${LOCKED_KEY_NAMES[key]}` });
  });

const LOCKED_KEY_NAMES: Record<string, string> = { requesterName: "requester's name", requesterEmail: "requester's email", title: "task name", brief: "brief" };

/** The form ready to store: parsed, and with the questions that cannot be skipped marked required whatever the editor said. */
export function normaliseBookingTemplate(input: unknown): BookingFormTemplate {
  const template = bookingFormTemplateSchema.parse(input) as BookingFormTemplate;
  for (const field of templateFields(template)) {
    if (field.kind === "standard" && BOOKING_LOCKED_KEYS.includes(field.key)) field.required = true;
    if (field.kind === "custom" && field.type !== "TAGS") field.options = [];
  }
  return template;
}

/** The form a workspace shows: its own when it has one that still parses, else the built-in one. */
export function resolveBookingTemplate(workspace: Pick<Workspace, "bookingForm"> | null | undefined): BookingFormTemplate {
  if (!workspace?.bookingForm) return defaultBookingFormTemplate();
  const parsed = bookingFormTemplateSchema.safeParse(workspace.bookingForm);
  return parsed.success ? (parsed.data as BookingFormTemplate) : defaultBookingFormTemplate();
}

/** True when the request carries no answer to the standard question `key`. */
export function isStandardAnswerEmpty(request: BookingRequest, key: BookingStandardKey): boolean {
  switch (key) {
    case "requesterName":
      return request.requesterName.trim() === "";
    case "requesterEmail":
      return request.requesterEmail.trim() === "";
    case "department":
      return !request.department?.trim();
    case "title":
      return request.title.trim() === "";
    case "brief":
      return request.brief.trim() === "";
    case "assetTypes":
      return request.assetTypes.length === 0;
    case "dueDate":
      return !request.dueDate;
    case "priority":
      return !request.priority;
    case "referenceUrl":
      return !request.referenceUrl?.trim();
    case "team":
      return !request.teamId;
  }
}

/**
 * The template's own rules on a request: required questions answered, custom
 * answers of the type the question expects. Keyed by field id so the form can
 * show each message under its question; the server joins them into one error.
 * `bookingRequestSchema` still checks formats (email, dates, links) separately.
 */
export function validateBookingAgainstTemplate(request: BookingRequest, template: BookingFormTemplate): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of templateFields(template)) {
    if (field.kind === "standard") {
      if (field.required && isStandardAnswerEmpty(request, field.key)) errors[field.id] = `${field.label} is required`;
      continue;
    }
    const answer = request.answers[field.id];
    if (answer && answer.type !== field.type) errors[field.id] = `${field.label} has an answer of the wrong kind`;
    else if (field.required && isEmptyValue(answer)) errors[field.id] = `${field.label} is required`;
  }
  return errors;
}

/** A custom answer as one line of text, for the description or a text column. */
export function formatAnswer(value: ColumnValue): string {
  switch (value.type) {
    case "TEXT":
    case "LONG_TEXT":
      return value.text.trim();
    case "NUMBER":
      return value.number === null ? "" : String(value.number);
    case "DATE":
      return value.date ?? "";
    case "LINK":
      return value.text ? `${value.text} (${value.url})` : value.url;
    case "CHECKBOX":
      return value.checked ? "Yes" : "No";
    case "TAGS":
      return value.tags.join(", ");
    case "SIZE":
      return value.size ?? "";
    default:
      return "";
  }
}

// ---- standard questions -------------------------------------------------------

/** The questions every booking asks, in form order. Their answers are matched to columns by type and name. */
export const STANDARD_BOOKING_FIELDS = ["requesterName", "requesterEmail", "department", "assetTypes", "assets", "team", "dueDate", "priority", "referenceUrl"] as const;
export type StandardBookingField = (typeof STANDARD_BOOKING_FIELDS)[number];

export const STANDARD_FIELD_LABELS: Record<StandardBookingField, string> = {
  requesterName: "Requester",
  requesterEmail: "Email",
  department: "Department",
  assetTypes: "Asset type",
  assets: "Assets & specs",
  team: "Requested team",
  dueDate: "Due date",
  priority: "Priority",
  referenceUrl: "Reference",
};

interface FieldRule {
  /** Column types this answer may be written to, best first. */
  types: readonly BoardColumn["type"][];
  /** Words in a column's name that mark it as the right home. */
  hints: readonly string[];
  /** When no name matches: use the board's only column of that type. */
  loneFallback: boolean;
}

const FIELD_RULES: Record<StandardBookingField, FieldRule> = {
  requesterName: { types: ["TEXT"], hints: ["requester", "requested by", "stakeholder", "client", "booked by"], loneFallback: false },
  requesterEmail: { types: ["TEXT", "LINK"], hints: ["email", "contact"], loneFallback: false },
  department: { types: ["TEXT"], hints: ["department", "school", "faculty", "portfolio", "unit", "college"], loneFallback: false },
  assetTypes: { types: ["TAGS", "TEXT"], hints: ["asset", "type", "format", "channel", "deliverable"], loneFallback: false },
  assets: { types: ["LONG_TEXT"], hints: ["asset", "spec", "deliverable", "scope", "requirement"], loneFallback: true },
  team: { types: ["TAGS", "TEXT"], hints: ["team", "allocated", "assigned team"], loneFallback: false },
  dueDate: { types: ["DATE", "TIMELINE"], hints: ["due", "deadline", "needed", "delivery"], loneFallback: true },
  priority: { types: ["PRIORITY"], hints: [], loneFallback: true },
  referenceUrl: { types: ["LINK"], hints: ["brief", "reference", "link", "url", "source"], loneFallback: true },
};

const norm = (name: string) => name.trim().toLowerCase();

/** Columns the team fills in after a booking arrives; the form never asks about them. */
const TEAM_ONLY_HINTS = ["allocated", "assigned", "approved", "internal"];

/** Which column of `columns` receives `field`, or null when the board has no sensible home for it. */
export function columnForField(field: StandardBookingField, columns: readonly BoardColumn[], taken: ReadonlySet<string> = new Set()): BoardColumn | null {
  const rule = FIELD_RULES[field];
  const free = columns.filter((c) => !taken.has(c.id));
  for (const type of rule.types) {
    const ofType = free.filter((c) => c.type === type);
    const named = ofType.find((c) => rule.hints.some((hint) => norm(c.name).includes(hint)));
    if (named) return named;
    if (rule.loneFallback && ofType.length === 1) return ofType[0]!;
    if (rule.hints.length === 0 && ofType.length > 0) return ofType[0]!;
  }
  return null;
}

/** Every standard question paired with the column that will hold its answer, or null. */
export function planStandardFields(columns: readonly BoardColumn[]): Record<StandardBookingField, BoardColumn | null> {
  const taken = new Set<string>();
  const plan = {} as Record<StandardBookingField, BoardColumn | null>;
  for (const field of STANDARD_BOOKING_FIELDS) {
    const column = columnForField(field, columns, taken);
    if (column) taken.add(column.id);
    plan[field] = column;
  }
  return plan;
}

/**
 * Columns of a receiving board the standard questions do not cover, as extra
 * questions for the form. Only simple types qualify, and only columns a
 * stakeholder could reasonably answer (hidden columns are skipped).
 */
export function extraFieldsFor(columns: readonly BoardColumn[]): BookingExtraField[] {
  const plan = planStandardFields(columns);
  const used = new Set(Object.values(plan).flatMap((c) => (c ? [c.id] : [])));
  return columns
    .filter((c) => !c.hidden && !used.has(c.id) && isBookingFieldType(c.type) && !TEAM_ONLY_HINTS.some((hint) => norm(c.name).includes(hint)))
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      columnId: c.id,
      name: c.name,
      type: c.type as BookingExtraField["type"],
      ...(c.type === "TAGS" ? { options: columnTagOptions(c) } : {}),
      ...(c.type === "NUMBER" && c.settings.kind === "number" ? { unit: c.settings.unit } : {}),
    }));
}

// ---- writing a booking onto a board --------------------------------------------

export interface BookingPlacement {
  /** Values to store, one per column that had a home for an answer. */
  values: Array<{ columnId: string; value: ColumnValue }>;
  /** Answers that found no column; they go into the description instead. Custom questions bound for the brief always land here. */
  leftover: Array<{ field: StandardBookingField | "custom"; label: string; text: string }>;
}

export interface PlacementContext {
  /** The team the requester picked, for the "team" answer. */
  team: Pick<Team, "id" | "name"> | null;
  /** The form the request answered; its custom questions say where each answer goes. Absent means the built-in form, which has none. */
  template?: BookingFormTemplate | null;
  /**
   * The department this booking belongs to, proven by a portal token.
   *
   * Deliberately not `request.department`: that is free text a public requester
   * types about themselves, and writing it to a STAKEHOLDER column would let
   * anyone file work into another department's portal by typing its name. This
   * value only ever comes from the token that admitted the caller, so the board
   * can show who booked a task and the portal can recognise its own work.
   */
  stakeholder?: string | null;
}

/** Works out what to write into which column of the receiving board. */
export function mapBookingToColumns(request: BookingRequest, columns: readonly BoardColumn[], ctx: PlacementContext): BookingPlacement {
  const plan = planStandardFields(columns);
  const values: BookingPlacement["values"] = [];
  const leftover: BookingPlacement["leftover"] = [];

  const place = (field: StandardBookingField, text: string | null, build: (column: BoardColumn) => ColumnValue | null) => {
    if (text === null || text === "") return;
    const column = plan[field];
    const value = column ? build(column) : null;
    if (column && value && !isEmptyValue(value)) values.push({ columnId: column.id, value });
    else leftover.push({ field, label: STANDARD_FIELD_LABELS[field], text });
  };

  place("requesterName", request.requesterName, () => ({ type: "TEXT", text: request.requesterName }));
  place("requesterEmail", request.requesterEmail, (column) =>
    column.type === "LINK" ? { type: "LINK", url: `mailto:${request.requesterEmail}`, text: request.requesterEmail } : { type: "TEXT", text: request.requesterEmail },
  );
  place("department", request.department, () => ({ type: "TEXT", text: request.department! }));
  place("assetTypes", request.assetTypes.length ? request.assetTypes.join(", ") : null, (column) =>
    column.type === "TAGS" ? { type: "TAGS", tags: request.assetTypes } : { type: "TEXT", text: request.assetTypes.join(", ") },
  );
  place("assets", request.assets.length ? formatAssets(request.assets) : null, () => ({ type: "LONG_TEXT", text: formatAssets(request.assets) }));
  place("team", ctx.team?.name ?? null, (column) => (column.type === "TAGS" ? { type: "TAGS", tags: [ctx.team!.name] } : { type: "TEXT", text: ctx.team!.name }));
  place("dueDate", request.dueDate, (column) => (column.type === "TIMELINE" ? { type: "TIMELINE", start: null, end: request.dueDate } : { type: "DATE", date: request.dueDate }));
  place("priority", request.priority, (column) => {
    const label = (column.settings as PriorityColumnSettings).labels.find((l) => norm(l.name) === norm(request.priority!));
    return label ? { type: "PRIORITY", labelId: label.id } : null;
  });
  place("referenceUrl", request.referenceUrl, () => ({ type: "LINK", url: request.referenceUrl!, text: null }));

  // Extra answers only count for columns that still exist, still have that type
  // and are not already spoken for by a standard answer.
  const spokenFor = new Set(values.map((v) => v.columnId));
  for (const [columnId, value] of Object.entries(request.extra)) {
    const column = columns.find((c) => c.id === columnId);
    if (!column || spokenFor.has(columnId) || column.type !== value.type || !isBookingFieldType(column.type) || isEmptyValue(value)) continue;
    values.push({ columnId, value });
    spokenFor.add(columnId);
  }

  // The form's own questions. One bound for a column goes to the column it was
  // given on Task Allocation, or to a column of the same name and type on
  // whichever board this is; when neither exists (a team board that never saw
  // the question) the answer joins the description rather than vanishing.
  for (const field of ctx.template ? customFields(ctx.template) : []) {
    const value = request.answers[field.id];
    if (!value || value.type !== field.type || isEmptyValue(value)) continue;
    const column =
      field.destination === "column"
        ? (columns.find((c) => c.id === field.columnId && c.type === field.type && !spokenFor.has(c.id)) ?? columns.find((c) => c.type === field.type && norm(c.name) === norm(field.label) && !spokenFor.has(c.id)) ?? null)
        : null;
    if (column) {
      values.push({ columnId: column.id, value });
      spokenFor.add(column.id);
    } else {
      leftover.push({ field: "custom", label: field.label, text: formatAnswer(value) });
    }
  }

  // The department that booked it, from its portal link. Found by column type
  // and never by name — `labelledItemIds()` in the stakeholder portal service
  // reads these columns the same way, so a board that renames "Stakeholder" to
  // "Requested by" still lines up. No leftover when the board has no such
  // column: this is a label the team filters on, not an answer to a question,
  // and the provenance row already puts the task in the portal either way.
  if (ctx.stakeholder) {
    const column = columns.find((c) => c.type === "STAKEHOLDER" && !spokenFor.has(c.id));
    if (column) {
      values.push({ columnId: column.id, value: { type: "STAKEHOLDER", group: ctx.stakeholder } });
      spokenFor.add(column.id);
    }
  }
  return { values, leftover };
}

/**
 * The item's description: the brief, then a short block with whatever answers
 * the board had no column for, then the extra answers the board asked for
 * (they are stored in columns too, but the block reads as one record).
 */
export function describeBooking(request: BookingRequest, placement: BookingPlacement): string {
  const lines = [request.brief.trim()];
  if (placement.leftover.length) {
    lines.push("", "Request details");
    for (const entry of placement.leftover) {
      if (entry.text.includes("\n")) lines.push(`${entry.label}:`, ...entry.text.split("\n").map((line) => `  ${line}`));
      else lines.push(`${entry.label}: ${entry.text}`);
    }
  }
  return lines.join("\n");
}

/** The asset list as it is stored in a long-text column or the description: one numbered line each. */
export function formatAssets(lines: readonly BookingAssetLine[]): string {
  return lines.map((line, i) => `${i + 1}. ${formatAssetLine(line)}`).join("\n");
}

/** The status label a new booking starts in: the column's default, else its first label. */
export function initialStatusLabelId(settings: StatusColumnSettings): string | null {
  return settings.defaultLabelId ?? settings.labels[0]?.id ?? null;
}

/** True when the column type is one the form may ask about directly. */
export function isFormColumnType(type: BoardColumn["type"]): boolean {
  return (BOOKING_FIELD_TYPES as readonly string[]).includes(type);
}
