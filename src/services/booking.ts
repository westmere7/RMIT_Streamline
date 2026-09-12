import { z } from "zod";
import type {
  BoardColumn,
  BookingAnswer,
  BookingAssetLine,
  BookingBlock,
  BookingFormTemplate,
  BookingQuestionBlock,
  BookingRequest,
  BookingStandardKey,
  BookingStep,
  ColorToken,
  ColumnValue,
  PriorityColumnSettings,
  StatusColumnSettings,
  TagOption,
  Team,
  Workspace,
} from "@/domain";
import {
  BOOKING_BLOCK_KINDS,
  BOOKING_CHOICE_DISPLAYS,
  BOOKING_FIELD_WIDTHS,
  BOOKING_LOCKED_KEYS,
  BOOKING_STANDARD_KEYS,
  BOOKING_TEXT_LEVELS,
  COLOR_TOKENS,
  answerKindFor,
  defaultBookingFormTemplate,
  flattenBlocks,
  formatAssetLine,
  isAnswerEmpty,
  isEmptyValue,
  isQuestionBlock,
  isRequesterKey,
  openFollowUps,
  questionNumbers,
  serviceById,
  visibleBlocks,
} from "@/domain";
import { MAX_INDENT, richTextToPlain } from "@/lib/rich-text";

/**
 * The booking form's rules, with nothing async in them so they can be tested
 * flat and shared by the browser (validation as you go) and the server.
 *
 * Three jobs. It says what a saved form may look like
 * (`bookingFormTemplateSchema`) and reads whatever a workspace has stored,
 * migrating a form written for the old single-page version rather than throwing
 * it away (`resolveBookingTemplate`). It says whether a stakeholder may move on
 * from the step they are on (`validateBookingStep`). And it turns the answers
 * to a service's brief into the one document the team reads (`composeBrief`),
 * then works out which column of the receiving board each fixed answer belongs
 * in (`mapBookingToColumns`), writing whatever found no column into the item's
 * description so nothing is ever dropped. The brief itself is not one of those:
 * it is the Brief column's, and the description only carries it when the board
 * has no such column.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trims, lowercases and rejects anything that is not an email or a URL, respectively. */
const email = z.email("Enter a valid email address").trim().toLowerCase().max(200);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Links need to start with http:// or https://");

const bookingAnswerSchema: z.ZodType<BookingAnswer> = z.union([
  z.object({ kind: z.literal("text"), text: z.string().max(10000) }),
  z.object({ kind: z.literal("choice"), values: z.array(z.string().trim().min(1).max(120)).max(40) }),
  z.object({ kind: z.literal("link"), url: z.string().max(2000), label: z.string().max(120) }),
]) as z.ZodType<BookingAnswer>;

export const bookingRequestSchema = z.object({
  requesterName: z.string().trim().min(2, "Tell us who is asking").max(120),
  requesterEmail: email,
  department: z.string().trim().max(160).nullable().default(null),
  title: z.string().trim().min(3, "Give the task a short name").max(200),
  // Not typed by anybody, so not checked as though it were: the wizard composes
  // it from the service and the answers, and the server composes it again from
  // the same parts before storing. What guards its contents is the template's
  // own required questions, checked below.
  brief: z.string().trim().max(20000).default(""),
  assetTypes: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  assets: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Say what the asset is").max(160),
        quantity: z.number().int().min(1).max(9999).nullable().default(null),
        spec: z.string().trim().max(500).nullable().default(null),
        assetType: z.string().trim().max(60).nullable().default(null),
      }),
    )
    .max(50)
    .default([]),
  serviceTypeId: z.string().trim().max(80).nullable().default(null),
  subServices: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  teamId: z.uuid().nullable().default(null),
  dueDate: z.string().regex(ISO_DATE, "Pick a date").nullable().default(null),
  priority: z.string().trim().max(60).nullable().default(null),
  referenceUrl: url.nullable().default(null),
  answers: z.record(z.string(), bookingAnswerSchema).default({}),
  itemId: z.uuid().nullable().default(null),
});

export type BookingRequestInput = z.input<typeof bookingRequestSchema>;

/** A request with nothing answered: what the wizard opens on. */
export function emptyBookingRequest(): BookingRequest {
  return {
    requesterName: "",
    requesterEmail: "",
    department: null,
    title: "",
    brief: "",
    assetTypes: [],
    assets: [],
    serviceTypeId: null,
    subServices: [],
    teamId: null,
    dueDate: null,
    priority: null,
    referenceUrl: null,
    answers: {},
    itemId: null,
  };
}

// ---- the form's shape -------------------------------------------------------------

const tagOptionSchema = z.object({ name: z.string().trim().min(1).max(120), color: z.enum(COLOR_TOKENS as [string, ...string[]]) });

const questionBase = {
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1, "Every question needs a label").max(160),
  description: z.string().trim().max(400).nullable().default(null),
  required: z.boolean().default(false),
};

const choiceOptions = z.array(tagOptionSchema).min(1, "A choice question needs at least one choice").max(40);

const choiceBase = { options: choiceOptions, display: z.enum(BOOKING_CHOICE_DISPLAYS).default("chips") };
const furniture = [
  z.object({ kind: z.literal("separator"), id: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("text"), id: z.string().trim().min(1).max(80), level: z.enum(BOOKING_TEXT_LEVELS), text: z.string().trim().max(2000) }),
] as const;

/**
 * A block that opens nothing further — what a follow-up is allowed to be.
 *
 * Spelling the one level out rather than making the schema recursive is the
 * point: `MAX_FOLLOW_UP_DEPTH` is a rule about forms, and a schema that let a
 * branch carry a branch would leave it to the editor to remember.
 */
const leafBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("short"), ...questionBase }),
  z.object({ kind: z.literal("long"), ...questionBase }),
  z.object({ kind: z.literal("multi"), ...choiceBase, ...questionBase }),
  z.object({ kind: z.literal("single"), ...choiceBase, ...questionBase }),
  z.object({ kind: z.literal("link"), ...questionBase }),
  ...furniture,
]);

/** Questions a single choice opens, keyed by the option that opens them. */
const followUpsSchema = z.record(z.string().trim().min(1).max(120), z.array(leafBlockSchema).max(12)).optional();

/** One block of a brief, which is also the shape a saved block is kept in. */
export const bookingBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("short"), ...questionBase }),
  z.object({ kind: z.literal("long"), ...questionBase }),
  z.object({ kind: z.literal("multi"), ...choiceBase, ...questionBase }),
  z.object({ kind: z.literal("single"), ...choiceBase, followUps: followUpsSchema, ...questionBase }),
  z.object({ kind: z.literal("link"), ...questionBase }),
  ...furniture,
]);
const blockSchema = bookingBlockSchema;

/** A block as the editor may keep it under a name, or reject it with the reason. */
export function readBookingBlock(input: unknown): BookingBlock {
  return bookingBlockSchema.parse(input) as BookingBlock;
}

const standardFieldSchema = z.object({
  kind: z.literal("standard"),
  key: z.enum(BOOKING_STANDARD_KEYS),
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1, "Every question needs a label").max(160),
  description: z.string().trim().max(400).nullable().default(null),
  required: z.boolean().default(false),
  width: z.enum(BOOKING_FIELD_WIDTHS).default("full"),
});

const serviceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1, "Every service needs a name").max(60),
  description: z.string().trim().max(280).nullable().default(null),
  color: z.enum(COLOR_TOKENS as [string, ...string[]]),
  icon: z.string().trim().min(1).max(60),
  subServices: z.array(tagOptionSchema).max(40).default([]),
  subServiceLabel: z.string().trim().min(1).max(160),
  subServiceHint: z.string().trim().max(400).nullable().default(null),
  briefTitle: z.string().trim().max(160).nullable().default(null),
  briefHint: z.string().trim().max(400).nullable().default(null),
  blocks: z.array(blockSchema).max(60),
  teamId: z.uuid().nullable().default(null),
});

/**
 * What an administrator may save as the booking form.
 *
 * Beyond shape: every block has an id of its own, no standard question is asked
 * twice, the three the booking cannot do without are all still there, and there
 * is at least one service type — a form whose first step offers no kind of work
 * has no second step to open.
 */
export const bookingFormTemplateSchema = z
  .object({
    version: z.literal(2),
    basics: z.object({
      title: z.string().trim().max(160).nullable().default(null),
      hint: z.string().trim().max(400).nullable().default(null),
      fields: z.array(standardFieldSchema).max(20),
      serviceLabel: z.string().trim().min(1).max(160),
      serviceHint: z.string().trim().max(400).nullable().default(null),
    }),
    services: z.array(serviceSchema).min(1, "The form needs at least one type of service").max(20),
    assets: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(160),
      hint: z.string().trim().max(500),
      askAssetTypes: z.boolean().default(true),
      assetTypesLabel: z.string().trim().min(1).max(160),
      askLink: z.boolean().default(true),
      linkLabel: z.string().trim().min(1).max(160),
      linkHint: z.string().trim().max(400).nullable().default(null),
    }),
    review: z.object({
      title: z.string().trim().max(160).nullable().default(null),
      hint: z.string().trim().max(400).nullable().default(null),
      submitLabel: z.string().trim().min(1).max(60),
      submitNote: z.string().trim().max(200),
      autoReply: z.string().trim().max(1000),
    }),
  })
  .superRefine((template, ctx) => {
    const keys = new Set<string>();
    for (const field of template.basics.fields) {
      if (keys.has(field.key)) ctx.addIssue({ code: "custom", message: `“${field.label}” asks the same thing twice` });
      keys.add(field.key);
    }
    for (const key of BOOKING_LOCKED_KEYS) if (!keys.has(key)) ctx.addIssue({ code: "custom", message: `Step one has to ask for the ${LOCKED_KEY_NAMES[key]}` });

    const serviceIds = new Set<string>();
    for (const service of template.services) {
      if (serviceIds.has(service.id)) ctx.addIssue({ code: "custom", message: `Two services share the id “${service.id}”` });
      serviceIds.add(service.id);
      // Follow-ups included: answers are keyed by block id, so a follow-up
      // sharing an id with a question two branches away would be answered twice.
      const blockIds = new Set<string>();
      for (const block of flattenBlocks(service.blocks as BookingBlock[])) {
        if (blockIds.has(block.id)) ctx.addIssue({ code: "custom", message: `${service.name} has two blocks with the id “${block.id}”` });
        blockIds.add(block.id);
      }
    }
  });

const LOCKED_KEY_NAMES: Record<string, string> = { requesterName: "requester's name", requesterEmail: "requester's email", department: "requester's school or department", title: "task name" };

/** The form ready to store: parsed, with the questions that cannot be skipped marked required whatever the editor said. */
export function normaliseBookingTemplate(input: unknown): BookingFormTemplate {
  const template = bookingFormTemplateSchema.parse(input) as BookingFormTemplate;
  for (const field of template.basics.fields) {
    if (BOOKING_LOCKED_KEYS.includes(field.key)) field.required = true;
    // The three about the requester are one block: nothing to explain, and a
    // third of a row each, whatever an older form or a hand-edited one says.
    if (isRequesterKey(field.key)) {
      field.description = null;
      field.width = "third";
    }
  }
  return template;
}

/** True when this is the built-in form untouched; such a form is stored as nothing at all. */
export function isDefaultBookingTemplate(template: BookingFormTemplate): boolean {
  return JSON.stringify(normaliseBookingTemplate(template)) === JSON.stringify(normaliseBookingTemplate(defaultBookingFormTemplate()));
}

// ---- reading what a workspace has stored -------------------------------------

/**
 * The single-page form as earlier versions stored it, read only well enough to
 * be carried forward.
 *
 * A workspace that spent an afternoon wording its questions should not lose
 * that afternoon to an upgrade. The standard questions keep their labels and
 * their order; the custom ones become blocks of a service called after the
 * workspace, which is the honest translation — the old form had one set of
 * questions for everybody, and that is exactly what one service type is.
 */
const legacyTemplateSchema = z.object({
  version: z.literal(1),
  sections: z.array(
    z.object({
      title: z.string().default(""),
      hint: z.string().nullable().default(null),
      fields: z.array(z.record(z.string(), z.unknown())).default([]),
    }),
  ),
  // Read for their wording only; the shapes are whatever version 1 wrote.
  assets: z.object({ enabled: z.boolean().default(true), title: z.string().default(""), hint: z.string().default("") }).partial().optional(),
  submitLabel: z.string().optional(),
  submitNote: z.string().optional(),
});

const LEGACY_BLOCK_KIND: Record<string, BookingQuestionBlock["kind"]> = { TEXT: "short", LONG_TEXT: "long", NUMBER: "short", DATE: "short", LINK: "link", CHECKBOX: "single", TAGS: "multi", SIZE: "single" };

export function migrateLegacyTemplate(input: unknown): BookingFormTemplate | null {
  const parsed = legacyTemplateSchema.safeParse(input);
  if (!parsed.success) return null;
  const legacy = parsed.data;
  const next = defaultBookingFormTemplate();
  const fields = legacy.sections.flatMap((s) => s.fields);

  // Step one keeps whatever the old form asked, in its own words and order.
  const carried = next.basics.fields.flatMap((field) => {
    const old = fields.find((f) => f.kind === "standard" && f.key === field.key);
    if (!old) return [];
    return [{ ...field, label: typeof old.label === "string" && old.label.trim() ? old.label.trim() : field.label, description: typeof old.hint === "string" && old.hint.trim() ? old.hint.trim() : field.description }];
  });
  if (carried.some((f) => BOOKING_LOCKED_KEYS.includes(f.key))) {
    // Anything locked the old form somehow lacked comes back with its default wording.
    const present = new Set(carried.map((f) => f.key));
    next.basics.fields = [...carried, ...next.basics.fields.filter((f) => BOOKING_LOCKED_KEYS.includes(f.key) && !present.has(f.key))];
  }

  const blocks: BookingBlock[] = [];
  // The old form's "brief" was a standard question — one long box everybody
  // filled in. Step two has no standard questions, so it becomes the first
  // block of the one service, keeping its wording and whether it was required.
  // Without this a migrated form would reach step two with nothing to ask.
  const legacyBrief = fields.find((f) => f.kind === "standard" && f.key === "brief");
  if (legacyBrief) {
    blocks.push({
      id: "legacy-brief",
      kind: "long",
      label: typeof legacyBrief.label === "string" && legacyBrief.label.trim() ? legacyBrief.label.trim() : "Tell us more",
      description: typeof legacyBrief.placeholder === "string" && legacyBrief.placeholder.trim() ? legacyBrief.placeholder.trim() : typeof legacyBrief.hint === "string" && legacyBrief.hint.trim() ? legacyBrief.hint.trim() : null,
      required: legacyBrief.required !== false,
    });
  }
  fields.forEach((f, index) => {
    if (f.kind !== "custom") return;
    const type = typeof f.type === "string" ? f.type : "TEXT";
    const kind = LEGACY_BLOCK_KIND[type] ?? "short";
    const label = typeof f.label === "string" && f.label.trim() ? f.label.trim() : `Question ${index + 1}`;
    const description = typeof f.hint === "string" && f.hint.trim() ? f.hint.trim() : null;
    const base = { id: typeof f.id === "string" && f.id ? f.id : `legacy-${index}`, label, description, required: f.required === true };
    if (kind === "multi" || kind === "single") {
      const options: TagOption[] = Array.isArray(f.options)
        ? (f.options as Array<{ name?: unknown; color?: unknown }>).flatMap((o) => (typeof o?.name === "string" && o.name.trim() ? [{ name: o.name.trim(), color: (typeof o.color === "string" ? o.color : "blue") as ColorToken }] : []))
        : [];
      blocks.push({ ...base, kind, options: options.length ? options : [{ name: "Yes", color: "green" }, { name: "No", color: "gray" }] });
      return;
    }
    blocks.push({ ...base, kind });
  });

  // One service, carrying every question the old form asked of everybody.
  next.services = [{ ...next.services[0]!, id: "svc-general", name: "General", description: "Everything the form used to ask, carried over from the previous version.", color: "blue", icon: "Shapes", subServices: [], blocks, briefTitle: legacy.sections[1]?.title || null, briefHint: legacy.sections[1]?.hint ?? null }];
  if (legacy.assets) {
    next.assets.enabled = legacy.assets.enabled ?? next.assets.enabled;
    if (legacy.assets.title) next.assets.title = legacy.assets.title;
    if (legacy.assets.hint) next.assets.hint = legacy.assets.hint;
  }
  if (legacy.submitLabel) next.review.submitLabel = legacy.submitLabel;
  if (legacy.submitNote !== undefined) next.review.submitNote = legacy.submitNote;
  const checked = bookingFormTemplateSchema.safeParse(next);
  return checked.success ? (checked.data as BookingFormTemplate) : null;
}

/** Whatever `stored` is — a current form, a form from the old version, or rubbish — as a form. */
export function readBookingTemplate(stored: unknown): BookingFormTemplate | null {
  if (!stored) return null;
  const parsed = bookingFormTemplateSchema.safeParse(stored);
  if (parsed.success) return parsed.data as BookingFormTemplate;
  return migrateLegacyTemplate(stored);
}

/** The live form a workspace serves: its own when it has one that still reads, else the built-in one. */
export function resolveBookingTemplate(workspace: Pick<Workspace, "bookingForm"> | null | undefined): BookingFormTemplate {
  return readBookingTemplate(workspace?.bookingForm) ?? defaultBookingFormTemplate();
}

/**
 * What the editor opens on: the draft if there is one, else the live form.
 *
 * The two are kept apart on purpose. Editing writes only to the draft, so a
 * form half-rebuilt over three days is never what a stakeholder meets;
 * publishing is the one act that moves it across.
 */
export function resolveBookingDraft(workspace: Pick<Workspace, "bookingForm" | "bookingFormDraft"> | null | undefined): BookingFormTemplate {
  return readBookingTemplate(workspace?.bookingFormDraft) ?? resolveBookingTemplate(workspace);
}

/** True when the workspace is holding editor work that has not been published. */
export function hasUnpublishedDraft(workspace: Pick<Workspace, "bookingForm" | "bookingFormDraft"> | null | undefined): boolean {
  const draft = readBookingTemplate(workspace?.bookingFormDraft);
  if (!draft) return false;
  return JSON.stringify(draft) !== JSON.stringify(resolveBookingTemplate(workspace));
}

// ---- what a stakeholder still has to do --------------------------------------

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
    case "dueDate":
      return !request.dueDate;
    case "priority":
      return !request.priority;
  }
}

/** Where the service chooser's own message lands, since it is not a field with an id. */
export const SERVICE_ERROR_KEY = "service";

/**
 * And the stakeholder chooser's, which the template does not know about at all:
 * whether it is asked is the portal's business, not the workspace's.
 */

/** And the sub-service chips', which belong to the service rather than to the form. */
export const SUBSERVICE_ERROR_KEY = "subServices";

/**
 * What is still wrong with one step, keyed by the thing that is wrong.
 *
 * Per step rather than all at once, because the wizard will not let anybody
 * past a step with a required answer missing and has to know which step that
 * is. The keys are field ids and block ids, so each message lands under the
 * question it belongs to.
 */
export function validateBookingStep(step: BookingStep, request: BookingRequest, template: BookingFormTemplate, omit: readonly BookingStandardKey[] = []): Record<string, string> {
  const errors: Record<string, string> = {};
  const service = serviceById(template, request.serviceTypeId);
  if (step === "basics") {
    for (const field of template.basics.fields) {
      // A question the caller does not ask cannot be required of anybody: the
      // portal takes the department from the link, so there is no box to fill.
      if (omit.includes(field.key)) continue;
      if (field.required && isStandardAnswerEmpty(request, field.key)) errors[field.id] = `${field.label} is required`;
    }
    if (!service) errors[SERVICE_ERROR_KEY] = "Pick the kind of work this is";
    // A service that offers sub-services is asking a question, and "none of
    // them" is not one of the answers it offers.
    else if (service.subServices.length > 0 && request.subServices.length === 0) errors[SUBSERVICE_ERROR_KEY] = `${service.subServiceLabel} — pick at least one`;
    return errors;
  }
  if (step === "brief") {
    if (!service) {
      errors[SERVICE_ERROR_KEY] = "Pick the kind of work this is";
      return errors;
    }
    // Only the questions the brief is actually showing: a required follow-up
    // behind a choice nobody made is not a question anybody has failed to answer.
    for (const block of visibleBlocks(service.blocks, request.answers)) {
      if (!isQuestionBlock(block)) continue;
      const answer = request.answers[block.id];
      if (answer && answer.kind !== answerKindFor(block.kind)) errors[block.id] = `${block.label} has an answer of the wrong kind`;
      else if (block.required && isAnswerEmpty(answer)) errors[block.id] = `${block.label} is required`;
    }
    return errors;
  }
  // The deliverables may always be skipped, and the recap asks nothing of its own.
  return errors;
}

/** Everything wrong with a request, whichever step it belongs to. What the server checks. */
export function validateBookingAgainstTemplate(request: BookingRequest, template: BookingFormTemplate): Record<string, string> {
  return { ...validateBookingStep("basics", request, template), ...validateBookingStep("brief", request, template), ...validateBookingStep("assets", request, template) };
}

// ---- the brief ----------------------------------------------------------------

/** Anything in an answer that the markup would otherwise read as formatting. */
function plain(text: string): string {
  return text.replace(/([*_#[\]])/g, "\\$1");
}

/** Two spaces a step, as `parseRichText` reads them. */
function pad(depth: number): string {
  return "  ".repeat(depth);
}

/**
 * The answers to step two as the one document the team reads.
 *
 * Composed here and nowhere else, so the browser's recap and the board's Brief
 * column are the same words — and composed as rich text (src/lib/rich-text.ts),
 * because a brief is read rather than scanned. The three sizes each do one job:
 *
 *   heading      the team's own section headings, written into the form
 *   subheading   every question, numbered as the form numbered it
 *   body         the answer under it
 *
 * and the rest of the shape carries what prose cannot. A multiple choice is a
 * bulleted list, because it is a list. A separator block is a rule across the
 * page, which is what the person who put it in the form meant by it. A question
 * that only exists because of an answer is indented under that answer, so the
 * brief has the same shape on the page that the form had on the screen.
 *
 * Blank questions are left out, and so are the instructions the team wrote for
 * whoever was filling the form in: those were never part of what was said.
 *
 * Everything a requester typed is escaped on the way in, so nobody can type
 * markup into a brief and have it come out as markup.
 */
export function composeBrief(request: BookingRequest, template: BookingFormTemplate): string {
  const service = serviceById(template, request.serviceTypeId);
  const lines: string[] = [];
  // The two facts a producer looks at first, on their own lines above the rule.
  if (service) lines.push(`**Service:** ${plain(service.name)}`);
  if (request.subServices.length) lines.push("", `**Involves:** ${request.subServices.map(plain).join(", ")}`);
  if (lines.length) lines.push("", "---");

  const numbers = questionNumbers(service?.blocks ?? []);

  const walk = (blocks: readonly BookingBlock[], depth: number) => {
    for (const block of blocks) {
      if (block.kind === "separator") {
        lines.push("", "---");
        continue;
      }
      if (block.kind === "text") {
        // A note to whoever was filling the form in is not part of the answer.
        if (block.level === "body") continue;
        lines.push("", `${pad(depth)}${block.level === "heading" ? "#" : "##"} ${plain(block.text.trim())}`);
        continue;
      }
      const answer = request.answers[block.id];
      if (!isAnswerEmpty(answer)) {
        // The question is a subheading and the answer the body under it. Bold
        // on its own would not do: a heading ends its block, so the answer
        // starts a new one, where a bold line and the line after it are one
        // paragraph and the question runs into its own answer.
        const number = numbers.get(block.id);
        lines.push("", `${pad(depth)}## ${number ? `${number}. ` : ""}${plain(block.label)}`);
        lines.push(...answerLines(answer!, depth));
      }
      // Under its own question, and a step further in. A follow-up whose
      // question was left blank was never opened, so `openFollowUps` returns
      // nothing for it.
      walk(openFollowUps(block, answer), Math.min(MAX_INDENT, depth + 1));
    }
  };
  walk(service?.blocks ?? [], 0);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** One answer as the lines of the brief it becomes, at the depth its question sits. */
function answerLines(answer: BookingAnswer, depth: number): string[] {
  const prefix = pad(depth);
  // Several choices are a list, because that is what they are; one is a
  // sentence, and a bullet on its own reads as the first of a list that never
  // arrived.
  if (answer.kind === "choice") {
    return answer.values.length > 1 ? answer.values.map((value) => `${prefix}- ${plain(value)}`) : [`${prefix}${plain(answer.values.join(""))}`];
  }
  if (answer.kind === "link") {
    const url = answer.url.trim();
    const label = answer.label.trim();
    return [`${prefix}${label ? `[${plain(label)}](${url})` : url}`];
  }
  // A multi-line answer keeps its shape; a line left blank inside one would
  // otherwise be read as the end of the answer.
  return answer.text
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `${prefix}${plain(line.trim())}` : " "));
}

/** The one-line summary of the service chosen, for a column and for the recap. */
export function serviceSummary(request: BookingRequest, template: BookingFormTemplate): string | null {
  const service = serviceById(template, request.serviceTypeId);
  if (!service) return null;
  return request.subServices.length ? `${service.name} — ${request.subServices.join(", ")}` : service.name;
}

// ---- standard questions -------------------------------------------------------

/** The questions every booking answers, in form order. Their answers are matched to columns by type and name. */
export const STANDARD_BOOKING_FIELDS = ["requesterName", "requesterEmail", "department", "service", "assetTypes", "brief", "assets", "team", "dueDate", "priority", "referenceUrl"] as const;
export type StandardBookingField = (typeof STANDARD_BOOKING_FIELDS)[number];

export const STANDARD_FIELD_LABELS: Record<StandardBookingField, string> = {
  requesterName: "Requester",
  requesterEmail: "Email",
  department: "Department",
  service: "Service",
  assetTypes: "Asset type",
  brief: "Brief",
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
  service: { types: ["TAGS", "TEXT"], hints: ["service", "discipline", "craft"], loneFallback: false },
  assetTypes: { types: ["TAGS", "TEXT"], hints: ["asset", "type", "format", "channel", "deliverable"], loneFallback: false },
  // A rich-text column first: the brief is a document, and that is the column
  // that renders one. Named only, either way — a board with one long-text column
  // called "Notes" is not volunteering it for the brief.
  brief: { types: ["RICH_TEXT", "LONG_TEXT"], hints: ["brief", "request detail"], loneFallback: false },
  assets: { types: ["LONG_TEXT"], hints: ["asset", "spec", "deliverable", "scope", "requirement"], loneFallback: true },
  team: { types: ["TAGS", "TEXT"], hints: ["team", "allocated", "assigned team"], loneFallback: false },
  dueDate: { types: ["DATE", "TIMELINE"], hints: ["due", "deadline", "needed", "delivery"], loneFallback: true },
  priority: { types: ["PRIORITY"], hints: [], loneFallback: true },
  referenceUrl: { types: ["LINK"], hints: ["brief", "reference", "link", "url", "source"], loneFallback: true },
};

const norm = (name: string) => name.trim().toLowerCase();

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

// ---- writing a booking onto a board --------------------------------------------

export interface BookingPlacement {
  /** Values to store, one per column that had a home for an answer. */
  values: Array<{ columnId: string; value: ColumnValue }>;
  /** Answers that found no column; they go into the description instead. */
  leftover: Array<{ field: StandardBookingField; label: string; text: string }>;
  /** True when the board had a Brief column to put the brief in. */
  briefPlaced: boolean;
}

export interface PlacementContext {
  /** The team the service routes to, for the "team" answer. */
  team: Pick<Team, "id" | "name"> | null;
  /** The form the request answered; its services say what the brief is made of. */
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
  const template = ctx.template ?? null;
  const service = template ? serviceById(template, request.serviceTypeId) : null;

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
  // The main service only. The sub-services are chips in the brief, where the
  // question they answer is standing right next to them; a column holding both
  // reads as one flat list of words that used to mean two different things.
  place("service", service?.name ?? null, (column) => (column.type === "TAGS" ? { type: "TAGS", tags: [service!.name] } : { type: "TEXT", text: service!.name }));
  place("assetTypes", request.assetTypes.length ? request.assetTypes.join(", ") : null, (column) =>
    column.type === "TAGS" ? { type: "TAGS", tags: request.assetTypes } : { type: "TEXT", text: request.assetTypes.join(", ") },
  );
  // The brief goes to the Brief column and nowhere else. It used to be written
  // to the description as well, which meant every booking arrived as the same
  // page printed twice — once in a field nobody could format and once in a
  // column that opened as a popup. The description is only its fallback now,
  // for a board that has no Brief column at all (see `describeBooking`).
  const brief = request.brief.trim();
  const briefColumn = plan.brief;
  const briefPlaced = !!brief && !!briefColumn;
  if (briefPlaced) values.push({ columnId: briefColumn!.id, value: briefColumn!.type === "LONG_TEXT" ? { type: "LONG_TEXT", text: richTextToPlain(brief) } : { type: "RICH_TEXT", text: brief } });
  place("assets", request.assets.length ? formatAssets(request.assets) : null, () => ({ type: "LONG_TEXT", text: formatAssets(request.assets) }));
  place("team", ctx.team?.name ?? null, (column) => (column.type === "TAGS" ? { type: "TAGS", tags: [ctx.team!.name] } : { type: "TEXT", text: ctx.team!.name }));
  place("dueDate", request.dueDate, (column) => (column.type === "TIMELINE" ? { type: "TIMELINE", start: null, end: request.dueDate } : { type: "DATE", date: request.dueDate }));
  place("priority", request.priority, (column) => {
    const label = (column.settings as PriorityColumnSettings).labels.find((l) => norm(l.name) === norm(request.priority!));
    return label ? { type: "PRIORITY", labelId: label.id } : null;
  });
  place("referenceUrl", request.referenceUrl, () => ({ type: "LINK", url: request.referenceUrl!, text: null }));

  // The department that booked it, from its portal link. Found by column type
  // and never by name — `labelledItemIds()` in the stakeholder portal service
  // reads these columns the same way, so a board that renames "Stakeholder" to
  // "Requested by" still lines up. No leftover when the board has no such
  // column: this is a label the team filters on, not an answer to a question,
  // and the provenance row already puts the task in the portal either way.
  const spokenFor = new Set(values.map((v) => v.columnId));
  if (ctx.stakeholder) {
    const column = columns.find((c) => c.type === "STAKEHOLDER" && !spokenFor.has(c.id));
    if (column) values.push({ columnId: column.id, value: { type: "STAKEHOLDER", group: ctx.stakeholder } });
  }
  return { values, leftover, briefPlaced };
}

/**
 * The item's description: whatever fixed answers the board had no column for —
 * and the brief itself only when the board had nowhere to put it.
 *
 * A board with a Brief column gets a blank description, deliberately. The brief
 * belongs in the one field that renders it, and a description holding the same
 * words is a second copy nobody maintains: it does not update when the brief is
 * edited, and it made every booking open on two of the same thing.
 */
export function describeBooking(request: BookingRequest, placement: BookingPlacement): string {
  const lines = placement.briefPlaced ? [] : [richTextToPlain(request.brief.trim())];
  if (placement.leftover.length) {
    lines.push("", "Request details");
    for (const entry of placement.leftover) {
      if (entry.text.includes("\n")) lines.push(`${entry.label}:`, ...entry.text.split("\n").map((line) => `  ${line}`));
      else lines.push(`${entry.label}: ${entry.text}`);
    }
  }
  return lines.join("\n").trim();
}

/** The asset list as it is stored in a long-text column or the description: one numbered line each. */
export function formatAssets(lines: readonly BookingAssetLine[]): string {
  return lines.map((line, i) => `${i + 1}. ${formatAssetLine(line)}`).join("\n");
}

/** The status label a new booking starts in: the column's default, else its first label. */
export function initialStatusLabelId(settings: StatusColumnSettings): string | null {
  return settings.defaultLabelId ?? settings.labels[0]?.id ?? null;
}

/** The kinds of block, for an editor's "add" menu. Re-exported so callers need one import. */
export const BOOKING_BLOCK_KIND_LIST = BOOKING_BLOCK_KINDS;
