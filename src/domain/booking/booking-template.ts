import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";
import type { TagOption } from "@/domain/board/column";

/**
 * The shape of the booking form: four steps, and what each of them asks.
 *
 * A booking used to be one long page, and one page cannot ask a photographer
 * and a brand manager the same questions without asking both of them most of
 * the wrong ones. So the form branches. Step one settles who is asking and
 * *what kind of work this is*; the service type chosen there decides which
 * brief opens in step two. Everything after that — the deliverables, the recap
 * — is the same whichever branch was taken.
 *
 * All of it is the workspace's, not the app's. An administrator words every
 * question, adds and removes service types, and builds each service's brief
 * out of blocks (`BookingBlock`). Their version is stored on the workspace and
 * served to everyone from then on, the stakeholder portal included. Versions
 * worth keeping are saved by name as `BookingTemplate`s.
 *
 * Answers to step two do not each get a column of their own. They are one
 * document — the brief — composed as rich text and written to the "Brief"
 * column of the receiving board, where it opens as a popup and sits on the
 * task panel as one collapsible field. A brief is read as a whole or not at
 * all; twelve columns holding one sentence each is a board nobody can look at,
 * and the same words in the description as well is the same page printed twice.
 */

// ---- the blocks a brief is built from ---------------------------------------

/** How a single-choice question is answered: a row of chips, or a dropdown for choices too long to sit in one. */
export const BOOKING_CHOICE_DISPLAYS = ["chips", "dropdown"] as const;
export type BookingChoiceDisplay = (typeof BOOKING_CHOICE_DISPLAYS)[number];

export const BOOKING_CHOICE_DISPLAY_LABELS: Record<BookingChoiceDisplay, string> = { chips: "Chips", dropdown: "Dropdown" };

/** How loud a block of the team's own prose is. */
export const BOOKING_TEXT_LEVELS = ["heading", "subheading", "body"] as const;
export type BookingTextLevel = (typeof BOOKING_TEXT_LEVELS)[number];

export const BOOKING_TEXT_LEVEL_LABELS: Record<BookingTextLevel, string> = { heading: "Heading", subheading: "Subheading", body: "Body" };

export const BOOKING_BLOCK_KINDS = ["short", "long", "multi", "single", "link", "separator", "text"] as const;
export type BookingBlockKind = (typeof BOOKING_BLOCK_KINDS)[number];

interface BookingBlockBase {
  id: string;
}

/** Everything a block that expects an answer has in common. */
interface BookingQuestionBase extends BookingBlockBase {
  label: string;
  /** The explaining line under the question. Null when there is nothing to explain. */
  description: string | null;
  required: boolean;
}

export interface BookingShortBlock extends BookingQuestionBase {
  kind: "short";
}

export interface BookingLongBlock extends BookingQuestionBase {
  kind: "long";
}

/**
 * One of a list, or several of it.
 *
 * Both wear chips by default; a single choice whose options are sentences
 * rather than words can ask to be a dropdown instead. Absent means chips.
 */
export interface BookingChoiceBlock extends BookingQuestionBase {
  kind: "multi" | "single";
  options: TagOption[];
  display?: BookingChoiceDisplay;
  /**
   * Questions that only exist once a particular choice has been made, keyed by
   * the choice that opens them.
   *
   * "Are there people on camera?" → "Yes" → "Who is arranging their consent?"
   * is one question of the brief, not two, and asking the second of everybody
   * is how a form gets long enough that nobody reads it. A single choice is
   * the only block that carries these: one answer means one branch, and a
   * multiple choice would open four branches at once.
   *
   * Keyed by option *name*, the way a TAGS column keys its values — so the
   * editor remaps these when an option is renamed (see `renameFollowUpKey`).
   */
  followUps?: BookingFollowUps;
}

/** The follow-ups of a single-choice question: option name → the questions it opens. */
export type BookingFollowUps = Record<string, BookingBlock[]>;

/** A URL the requester supplies, with their own words for it. */
export interface BookingLinkBlock extends BookingQuestionBase {
  kind: "link";
}

/** A rule between two groups of questions. Asks nothing, so it is never required. */
export interface BookingSeparatorBlock extends BookingBlockBase {
  kind: "separator";
}

/** The team's own words in the middle of the form: a heading, or a note. */
export interface BookingTextBlock extends BookingBlockBase {
  kind: "text";
  level: BookingTextLevel;
  text: string;
}

export type BookingQuestionBlock = BookingShortBlock | BookingLongBlock | BookingChoiceBlock | BookingLinkBlock;
export type BookingBlock = BookingQuestionBlock | BookingSeparatorBlock | BookingTextBlock;

export const BOOKING_BLOCK_LABELS: Record<BookingBlockKind, string> = {
  short: "Short question",
  long: "Long question",
  multi: "Multiple choice",
  single: "Single choice",
  link: "Link",
  separator: "Separator",
  text: "Text",
};

/** True when the block expects an answer — which is also what earns it a number and a "required" switch. */
export function isQuestionBlock(block: BookingBlock): block is BookingQuestionBlock {
  return block.kind !== "separator" && block.kind !== "text";
}

// ---- follow-ups ---------------------------------------------------------------

/**
 * How deep a brief may branch: a question, and the questions its answer opens.
 *
 * One level, deliberately. Two would let an administrator build a decision tree
 * in a form editor, and a stakeholder meet a form whose length depends on a
 * choice they made three questions ago.
 */
export const MAX_FOLLOW_UP_DEPTH = 1;

/** True when this block may carry follow-ups at all: one answer, one branch. */
export function canHaveFollowUps(block: BookingBlock): block is BookingChoiceBlock {
  return block.kind === "single";
}

/** The follow-ups stored against one option, never undefined. */
export function followUpsForOption(block: BookingBlock, optionName: string): BookingBlock[] {
  return (canHaveFollowUps(block) ? block.followUps?.[optionName] : undefined) ?? [];
}

/** Every follow-up of a block, in option order — whichever option was chosen. */
export function allFollowUps(block: BookingBlock): BookingBlock[] {
  if (!canHaveFollowUps(block)) return [];
  return block.options.flatMap((option) => followUpsForOption(block, option.name));
}

/** The follow-ups an answer has actually opened. */
export function openFollowUps(block: BookingBlock, answer: BookingAnswer | undefined): BookingBlock[] {
  if (!canHaveFollowUps(block) || !answer || answer.kind !== "choice") return [];
  const chosen = answer.values[0];
  if (!chosen) return [];
  // Only an option the question still offers: renaming one leaves its old key
  // behind, and a brief must never ask a question nothing can reach.
  if (!block.options.some((option) => option.name === chosen)) return [];
  return followUpsForOption(block, chosen);
}

/** `followUps` with one option's key renamed, dropping keys no option answers to any more. */
export function renameFollowUpKey(followUps: BookingFollowUps | undefined, from: string, to: string): BookingFollowUps | undefined {
  if (!followUps || from === to || !followUps[from]) return followUps;
  const next: BookingFollowUps = {};
  for (const [key, blocks] of Object.entries(followUps)) next[key === from ? to : key] = blocks;
  return next;
}

/**
 * Every block of a brief, follow-ups included, in the order they are numbered.
 *
 * What the server checks answers against and what the editor counts: a question
 * behind a choice is still a question the form may ask.
 */
export function flattenBlocks(blocks: readonly BookingBlock[]): BookingBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(allFollowUps(block))]);
}

/** The blocks a brief is showing right now, in reading order: what is asked of these answers. */
export function visibleBlocks(blocks: readonly BookingBlock[], answers: Record<string, BookingAnswer>): BookingBlock[] {
  return blocks.flatMap((block) => [block, ...visibleBlocks(openFollowUps(block, answers[block.id]), answers)]);
}

// ---- numbering ----------------------------------------------------------------

export interface NumberedQuestion {
  block: BookingQuestionBlock;
  /** "4" at the top level, "4a" for the first question its answer opens. */
  number: string;
  /** 0 for a question of the brief itself, 1 for one a choice opened. */
  depth: number;
}

/** a, b, … z, aa, ab — the suffix a follow-up wears under its question. */
function letterSuffix(index: number): string {
  let out = "";
  let n = index;
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * The questions of a brief in order, numbered from one.
 *
 * The number is part of how a brief is read and talked about — "question four
 * is the one about print specs" — so it counts questions and nothing else.
 * Headings and rules are furniture; numbering them would put the fourth badge
 * beside the seventh question.
 *
 * Follow-ups take their question's number and a letter: 4a, 4b. Every one of
 * them is numbered, not only the ones the current answer opens, so the number
 * on a question is the same number whatever anybody answered.
 */
export function numberedQuestions(blocks: readonly BookingBlock[]): NumberedQuestion[] {
  const out: NumberedQuestion[] = [];
  const walk = (list: readonly BookingBlock[], prefix: string | null, depth: number) => {
    // One counter per level. Furniture never touches it: a heading counted as a
    // question would put the fourth badge beside the seventh question.
    let n = 0;
    for (const block of list) {
      let number: string | null = null;
      if (isQuestionBlock(block)) {
        number = prefix === null ? String(++n) : `${prefix}${letterSuffix(n++)}`;
        out.push({ block, number, depth });
      }
      // Only a question can open a branch, so `number` is always set by here.
      const follows = allFollowUps(block);
      if (follows.length && number) walk(follows, number, depth + 1);
    }
  };
  walk(blocks, null, 0);
  return out;
}

/** The number this block wears, or null when it is furniture. */
export function questionNumber(blocks: readonly BookingBlock[], blockId: string): string | null {
  return numberedQuestions(blocks).find((q) => q.block.id === blockId)?.number ?? null;
}

/** Every question's number, keyed by block id: what a form and a brief look numbers up in. */
export function questionNumbers(blocks: readonly BookingBlock[]): Map<string, string> {
  return new Map(numberedQuestions(blocks).map((q) => [q.block.id, q.number]));
}

// ---- what a stakeholder answers ---------------------------------------------

/**
 * One answer to one block.
 *
 * Deliberately not a `ColumnValue`. These answers are a brief, not a row: they
 * are read back as prose, they never have to line up with a column's type, and
 * giving them a shape of their own means a service's brief can be rebuilt
 * without anything on a board having to agree to it.
 */
export type BookingAnswer = { kind: "text"; text: string } | { kind: "choice"; values: string[] } | { kind: "link"; url: string; label: string };

/** The answer shape a block expects; anything else is a mismatch worth refusing. */
export function answerKindFor(kind: BookingQuestionBlock["kind"]): BookingAnswer["kind"] {
  if (kind === "link") return "link";
  return kind === "multi" || kind === "single" ? "choice" : "text";
}

/** A blank answer of the shape `kind` expects, so a control always has something to render. */
export function emptyAnswerFor(kind: BookingQuestionBlock["kind"]): BookingAnswer {
  const shape = answerKindFor(kind);
  if (shape === "choice") return { kind: "choice", values: [] };
  if (shape === "link") return { kind: "link", url: "", label: "" };
  return { kind: "text", text: "" };
}

export function isAnswerEmpty(answer: BookingAnswer | undefined | null): boolean {
  if (!answer) return true;
  if (answer.kind === "text") return answer.text.trim() === "";
  if (answer.kind === "choice") return answer.values.length === 0;
  return answer.url.trim() === "";
}

/** An answer as one line of the brief. */
export function formatBookingAnswer(answer: BookingAnswer): string {
  if (answer.kind === "text") return answer.text.trim();
  if (answer.kind === "choice") return answer.values.join(", ");
  const url = answer.url.trim();
  const label = answer.label.trim();
  return label ? `${label} — ${url}` : url;
}

// ---- service types -----------------------------------------------------------

/**
 * One kind of work the team takes on, and the brief that goes with it.
 *
 * The main choice of step one and the only thing that changes step two. Brand,
 * Design and Production ship with the app; a workspace adds, renames and
 * removes them freely, and each one carries its own sub-services and its own
 * blocks, so rewriting Production's brief cannot disturb Design's.
 *
 * `teamId` is the routing this used to ask a stakeholder about directly. They
 * were being asked to know the team's own structure; naming the team behind
 * each service answers it once, in the editor, by somebody who knows.
 */
export interface BookingServiceType {
  id: string;
  name: string;
  /** A line under the name on the chooser, or null. */
  description: string | null;
  color: ColorToken;
  /** A Lucide icon name, as `DynamicIcon` takes them. */
  icon: string;
  /** The multi-select shown under the service, as chips. Their answers become chips in the brief. */
  subServices: TagOption[];
  subServiceLabel: string;
  subServiceHint: string | null;
  /**
   * The heading over this service's brief, and the blocks it is built from.
   *
   * Nullable because a heading is the team's own words, not a fixture: a brief
   * that opens straight on its first question is a legitimate thing to want,
   * and anything more elaborate is a text block, which can be moved and removed
   * like the rest.
   */
  briefTitle: string | null;
  briefHint: string | null;
  blocks: BookingBlock[];
  /** The team whose board takes these bookings, or null for the allocation queue. */
  teamId: EntityId | null;
}

// ---- the standard questions of step one --------------------------------------

export const BOOKING_STANDARD_KEYS = ["requesterName", "requesterEmail", "department", "title", "dueDate", "priority"] as const;
export type BookingStandardKey = (typeof BOOKING_STANDARD_KEYS)[number];

/**
 * Who is asking: three questions that are really one.
 *
 * A name, an address to reply to and the part of the university it is coming
 * from are a single fact about a single person, so they are one block on one
 * line — always asked, always required, and with nothing to explain. A hint
 * under "Your name" is noise, and a form that let one of the three be dropped
 * would produce requests nobody could answer.
 */
export const BOOKING_REQUESTER_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail", "department"];

export function isRequesterKey(key: BookingStandardKey): boolean {
  return BOOKING_REQUESTER_KEYS.includes(key);
}

/** Questions step one cannot lose: without them there is no requester to answer and no task to name. */
export const BOOKING_LOCKED_KEYS: readonly BookingStandardKey[] = [...BOOKING_REQUESTER_KEYS, "title"];

export function isLockedStandardKey(key: BookingStandardKey): boolean {
  return BOOKING_LOCKED_KEYS.includes(key);
}

/**
 * How wide a question sits in step one.
 *
 * The row is six columns, so a question takes all of it, half of it, or a
 * third. Thirds exist for the three that belong together — who is asking, how
 * to reach them, and where they are from — which read as one question about one
 * person and should sit on one line.
 */
export const BOOKING_FIELD_WIDTHS = ["full", "half", "third"] as const;
export type BookingFieldWidth = (typeof BOOKING_FIELD_WIDTHS)[number];

/** Columns of the six-column row this width spans. */
export const BOOKING_WIDTH_SPAN: Record<BookingFieldWidth, number> = { full: 6, half: 3, third: 2 };

/** The next width the editor's toggle offers: all of it, half, a third, round again. */
export function nextFieldWidth(width: BookingFieldWidth): BookingFieldWidth {
  return width === "full" ? "half" : width === "half" ? "third" : "full";
}

/** One of the fixed questions of a `BookingRequest`, worded the workspace's way. */
export interface BookingStandardField {
  id: string;
  kind: "standard";
  key: BookingStandardKey;
  label: string;
  description: string | null;
  required: boolean;
  width: BookingFieldWidth;
}

export const BOOKING_STANDARD_KEY_LABELS: Record<BookingStandardKey, string> = {
  requesterName: "Requester's name",
  requesterEmail: "Requester's email",
  department: "School or department",
  title: "Task name",
  dueDate: "Needed by",
  priority: "Urgency",
};

// ---- the four steps ----------------------------------------------------------

export const BOOKING_STEPS = ["basics", "brief", "assets", "review"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export interface BookingBasicsStep {
  /** Null when the step should open straight on its questions. */
  title: string | null;
  hint: string | null;
  fields: BookingStandardField[];
  /** Wording of the service chooser, which is not a field because nothing about it is optional. */
  serviceLabel: string;
  serviceHint: string | null;
}

/**
 * The deliverables, and the two questions that live beside them.
 *
 * Every part of this step may be skipped — a stakeholder who has the list in a
 * spreadsheet should be able to paste the link and move on, and one who has not
 * worked it out yet should not be stopped here.
 */
export interface BookingAssetsStep {
  enabled: boolean;
  title: string;
  hint: string;
  /** The "Asset type" chips: what kinds of thing this is, for the team's own counting. */
  askAssetTypes: boolean;
  assetTypesLabel: string;
  /** The "already have the list somewhere?" link. */
  askLink: boolean;
  linkLabel: string;
  linkHint: string | null;
}

export interface BookingReviewStep {
  /** Null when the recap should open straight on the summary. */
  title: string | null;
  hint: string | null;
  submitLabel: string;
  /** The small print beside the submit button. */
  submitNote: string;
  /**
   * What the receipt says back, in the team's own words.
   *
   * The nearest thing to an acknowledgement a stakeholder gets: there is no
   * mail server behind this, so it is shown on the ticket rather than sent.
   * Written once by the team, shown after every booking.
   */
  autoReply: string;
}

export interface BookingFormTemplate {
  version: 2;
  basics: BookingBasicsStep;
  services: BookingServiceType[];
  assets: BookingAssetsStep;
  review: BookingReviewStep;
}

/**
 * A form saved under a name, to be loaded again later.
 *
 * Belongs to the workspace and not to whoever saved it: one administrator
 * writing a summer form and another loading it is the point of these. The
 * description says what the form is for, which a name alone never does once
 * there are five of them.
 */
export interface BookingTemplate extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  description: string | null;
  template: BookingFormTemplate;
  createdBy: EntityId;
}

export type BookingTemplateInput = Pick<BookingTemplate, "workspaceId" | "name" | "description" | "template" | "createdBy">;

export const MAX_BOOKING_TEMPLATE_NAME = 80;
export const MAX_BOOKING_TEMPLATE_DESCRIPTION = 280;

/**
 * One block kept under a name, to be dropped into any brief later.
 *
 * The same question turns up in most briefs — "where are the assets?", "has this
 * been through brand?" — and rebuilding it choice by choice each time is how
 * the copies drift apart. Saving it once keeps the wording and the choices
 * together; inserting it gives the brief a copy with an id of its own, so the
 * saved block and the brief can go their separate ways afterwards.
 */
export interface BookingSavedBlock extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  block: BookingBlock;
  createdBy: EntityId;
}

export type BookingSavedBlockInput = Pick<BookingSavedBlock, "workspaceId" | "name" | "block" | "createdBy">;

export const MAX_BOOKING_SAVED_BLOCK_NAME = 80;

// ---- the form every workspace starts with ------------------------------------

const std = (key: BookingStandardKey, label: string, rest: Partial<Omit<BookingStandardField, "kind" | "key" | "id" | "label">> = {}): BookingStandardField => ({
  kind: "standard",
  id: `std-${key}`,
  key,
  label,
  description: null,
  required: isLockedStandardKey(key),
  width: "full",
  ...rest,
});

let blockSeq = 0;

/** A block id, unique within one browser and stable once it is in a template. */
export function newBlockId(prefix = "b"): string {
  return `${prefix}-${Date.now().toString(36)}-${(++blockSeq).toString(36)}`;
}

/**
 * A deep copy of a block with every id in it freshly minted — the follow-ups
 * included.
 *
 * Duplicating a question, or dropping a saved one into a brief, has to produce
 * a block that shares nothing with the original: answers are keyed by block id,
 * and two questions with the same id would be one answer wearing two labels.
 */
export function copyBlockWithNewIds(block: BookingBlock): BookingBlock {
  const copy = structuredClone(block) as BookingBlock;
  copy.id = newBlockId();
  if (canHaveFollowUps(copy) && copy.followUps) {
    copy.followUps = Object.fromEntries(Object.entries(copy.followUps).map(([option, blocks]) => [option, blocks.map(copyBlockWithNewIds)]));
  }
  return copy;
}

/** A fresh block of `kind`, with sensible blanks, ready for the editor. */
export function newBookingBlock(kind: BookingBlockKind): BookingBlock {
  const base = { id: newBlockId(), description: null, required: false };
  switch (kind) {
    case "short":
      return { ...base, kind, label: "Short question" };
    case "long":
      return { ...base, kind, label: "Long question" };
    case "multi":
      return { ...base, kind, label: "Pick any that apply", options: [{ name: "First choice", color: "blue" }, { name: "Second choice", color: "violet" }] };
    case "single":
      return { ...base, kind, label: "Pick one", options: [{ name: "First choice", color: "blue" }, { name: "Second choice", color: "violet" }] };
    case "link":
      return { ...base, kind, label: "A link" };
    case "separator":
      return { id: base.id, kind };
    case "text":
      return { id: base.id, kind, level: "subheading", text: "A note for whoever is filling this in" };
  }
}

const tags = (...names: Array<[string, ColorToken]>): TagOption[] => names.map(([name, color]) => ({ name, color }));

/** A service type with nothing in its brief yet, as the editor's "Add a service" makes one. */
export function newServiceType(name: string): BookingServiceType {
  return {
    id: newBlockId("svc"),
    name,
    description: null,
    color: "blue",
    icon: "Shapes",
    subServices: [],
    subServiceLabel: "What does it involve?",
    subServiceHint: "Pick every one that applies.",
    briefTitle: `About the ${name.toLowerCase()} work`,
    briefHint: null,
    blocks: [],
    teamId: null,
  };
}

/**
 * The three services the app ships with, and the questions each of them asks.
 *
 * The sub-service lists are the team's own; the briefs are a starting point an
 * administrator is expected to rewrite. They are deliberately short — a first
 * brief that asks twelve questions teaches everybody to skim.
 */
function defaultServices(): BookingServiceType[] {
  return [
    {
      id: "svc-brand",
      name: "Brand",
      description: "Brand guardianship, approvals, and anything carrying the RMIT identity.",
      color: "violet",
      icon: "BadgeCheck",
      subServices: tags(["Approval", "green"], ["Digital / Social", "blue"], ["Print", "orange"], ["Publication", "amber"], ["Installation", "teal"], ["Others", "gray"]),
      subServiceLabel: "What does it involve?",
      subServiceHint: "Pick every one that applies.",
      briefTitle: "About the brand work",
      briefHint: "The more precisely this is answered, the fewer rounds of review it takes.",
      teamId: null,
      blocks: [
        { id: "brand-what", kind: "long", label: "What are you asking for?", description: "What it is, who it is for, and what it has to achieve.", required: true },
        { id: "brand-audience", kind: "short", label: "Who is the audience?", description: "e.g. prospective students, staff, alumni", required: true },
        { id: "brand-sep", kind: "separator" },
        {
          id: "brand-history",
          kind: "single",
          label: "Has this been through brand before?",
          description: null,
          required: true,
          options: tags(["First time", "blue"], ["An update to something approved", "green"], ["Not sure", "gray"]),
        },
        { id: "brand-ref", kind: "link", label: "Anything we should look at first?", description: "A brief, a past campaign, a folder of references.", required: false },
      ],
    },
    {
      id: "svc-design",
      name: "Design",
      description: "Artwork, layouts and key visuals, from a single flyer to a campaign.",
      color: "blue",
      icon: "PenTool",
      subServices: tags(["Digital / Social", "blue"], ["Print", "orange"], ["Publication", "amber"], ["Installation", "teal"], ["Key Visual", "pink"], ["Others", "gray"]),
      subServiceLabel: "What does it involve?",
      subServiceHint: "Pick every one that applies.",
      briefTitle: "About the design work",
      briefHint: "Sizes, formats and copy are what hold a job up. Say what you know.",
      teamId: null,
      blocks: [
        { id: "design-what", kind: "long", label: "What are you asking for?", description: "What it is, who it is for, and what it has to achieve.", required: true },
        { id: "design-specs", kind: "long", label: "Sizes, formats and where it will run", description: "e.g. A1 portrait for print, plus 1080x1350 for Instagram.", required: true },
        {
          id: "design-copy",
          kind: "single",
          label: "Is the copy written?",
          description: null,
          required: true,
          options: tags(["Yes, final and approved", "green"], ["Drafted, not approved", "amber"], ["No — we need help with it", "rose"]),
        },
        { id: "design-sep", kind: "separator" },
        { id: "design-assets", kind: "link", label: "Where are the assets?", description: "Photography, logos, copy documents — a link to the folder is perfect.", required: false },
      ],
    },
    {
      id: "svc-production",
      name: "Production",
      description: "Photography and video, on location or in the studio.",
      color: "orange",
      icon: "Clapperboard",
      subServices: tags(["Photography", "sky"], ["Videography", "purple"]),
      subServiceLabel: "What does it involve?",
      subServiceHint: "Pick every one that applies.",
      briefTitle: "About the shoot",
      briefHint: "A shoot is booked around a date and a place, so those two matter most.",
      teamId: null,
      blocks: [
        { id: "prod-what", kind: "long", label: "What needs shooting?", description: "What we are capturing, and what it is for.", required: true },
        { id: "prod-where", kind: "short", label: "Where is it?", description: "Campus, building and room, or the address.", required: true },
        { id: "prod-when", kind: "short", label: "When does it happen?", description: "A shoot cannot be moved the way a layout can — give us the date and time.", required: true },
        { id: "prod-sep", kind: "separator" },
        { id: "prod-people", kind: "single", label: "Are there people on camera?", description: "If so, we will need their consent before the day.", required: true, options: tags(["Yes", "amber"], ["No", "green"], ["Not sure yet", "gray"]) },
        { id: "prod-use", kind: "multi", label: "Where will it be used?", description: null, required: false, options: tags(["Social", "blue"], ["Website", "cyan"], ["Paid media", "rose"], ["Internal", "gray"], ["Print", "orange"]) },
      ],
    },
  ];
}

/** The form every workspace starts with; also what "Reset to default" restores. */
export function defaultBookingFormTemplate(): BookingFormTemplate {
  return {
    version: 2,
    basics: {
      title: "About you and your request",
      hint: "So we know who to come back to, and which of our teams picks this up.",
      fields: [
        // The three that are all one question about one person, on one line.
        std("requesterName", "Your name", { width: "third" }),
        std("requesterEmail", "Email", { width: "third" }),
        std("department", "School or department", { width: "third" }),
        std("title", "What should we call this?", { description: "e.g. Open Day 2026 wayfinding posters" }),
        std("priority", "How urgent?", { required: true, width: "half" }),
        std("dueDate", "Needed by", { required: true, width: "half" }),
      ],
      serviceLabel: "What kind of work is this?",
      serviceHint: "This decides what we ask you next.",
    },
    services: defaultServices(),
    assets: {
      enabled: true,
      title: "What are the deliverables?",
      hint: "Optional. List each one with its size or format and the team tracks them separately — or skip this and we will work it out with you.",
      askAssetTypes: true,
      assetTypesLabel: "Asset type",
      askLink: true,
      linkLabel: "Already have the list somewhere?",
      linkHint: "Paste a link to the spreadsheet or brief instead and the team will work from that.",
    },
    review: {
      title: "Check it over",
      hint: "Anything here can still be changed — step back and edit it.",
      submitLabel: "Book this task",
      submitNote: "You'll get a reference to quote when following up.",
      autoReply: "Thanks — we have your request. A producer reads every booking and will come back to you within two working days, sooner if it is urgent.",
    },
  };
}

// ---- reading a template ------------------------------------------------------

export function serviceById(template: BookingFormTemplate, id: string | null | undefined): BookingServiceType | null {
  if (!id) return null;
  return template.services.find((s) => s.id === id) ?? null;
}

export function standardFieldFor(template: BookingFormTemplate, key: BookingStandardKey): BookingStandardField | null {
  return template.basics.fields.find((f) => f.key === key) ?? null;
}

/** Standard questions step one does not currently ask; the editor offers these to add back. */
export function missingStandardKeys(template: BookingFormTemplate): BookingStandardKey[] {
  const present = new Set(template.basics.fields.map((f) => f.key));
  return BOOKING_STANDARD_KEYS.filter((key) => !present.has(key));
}

/** A standard question added back with its default wording. */
export function newStandardField(key: BookingStandardKey): BookingStandardField {
  return standardFieldFor(defaultBookingFormTemplate(), key) ?? std(key, BOOKING_STANDARD_KEY_LABELS[key]);
}

/**
 * Every question of every service: what the editor's summary counts.
 *
 * Defensive about `services` because this is also pointed at whatever a
 * workspace has stored, and a form saved by an earlier version has no services
 * at all. A count is never worth a blank page.
 */
export function templateQuestionCount(template: Pick<BookingFormTemplate, "services"> | null | undefined): number {
  return (template?.services ?? []).reduce((n, service) => n + flattenBlocks(service.blocks ?? []).filter(isQuestionBlock).length, 0);
}
