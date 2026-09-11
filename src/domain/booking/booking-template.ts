import type { TagOption } from "@/domain/board/column";
import type { EntityId, Timestamps } from "@/domain/common/types";
import type { BookingFieldType } from "./booking";

/**
 * The shape of the booking form: what it asks, in which words, in what order.
 *
 * Every workspace starts with the built-in form (`defaultBookingFormTemplate`)
 * and an admin may change any of it from the Book a task page: rename a
 * question, rewrite a hint, drop a question that never gets answered, add one
 * of their own. Their version is stored on the workspace and shown to everyone
 * from then on, stakeholders on the public link included. Versions worth
 * keeping are saved by name as `BookingTemplate`s, so a form can be swapped
 * for another one (say, a leaner one over the summer) and back again.
 *
 * Two kinds of question. Standard questions map onto the fixed parts of a
 * `BookingRequest` (who is asking, what the task is, when it is needed…); the
 * booking service already knows where each of those lands on a board. Custom
 * questions are the workspace's own; their answers either become part of the
 * brief (the item's description) or get a column of their own on Task
 * Allocation, chosen per question.
 */

export const BOOKING_STANDARD_KEYS = ["requesterName", "requesterEmail", "department", "title", "brief", "assetTypes", "dueDate", "priority", "referenceUrl", "team"] as const;
export type BookingStandardKey = (typeof BOOKING_STANDARD_KEYS)[number];

/** Questions the form cannot lose: a booking without them has no requester to answer or no task to do. */
export const BOOKING_LOCKED_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail", "title", "brief"];

export function isLockedStandardKey(key: BookingStandardKey): boolean {
  return BOOKING_LOCKED_KEYS.includes(key);
}

/** How wide a question sits in the two-column layout. */
export type BookingFieldWidth = "full" | "half";

/** Where a custom question's answer ends up. */
export type BookingAnswerDestination = "brief" | "column";

interface BookingFieldBase {
  id: string;
  label: string;
  /** Small print under the control, or null. */
  hint: string | null;
  /** Placeholder inside text-like controls, or null. */
  placeholder: string | null;
  required: boolean;
  width: BookingFieldWidth;
}

/** One of the fixed questions of a `BookingRequest`, worded the workspace's way. */
export interface BookingStandardField extends BookingFieldBase {
  kind: "standard";
  key: BookingStandardKey;
}

/** A question the workspace added itself. */
export interface BookingCustomField extends BookingFieldBase {
  kind: "custom";
  type: BookingFieldType;
  /** TAGS: what can be chosen. Ignored for other types. */
  options: TagOption[];
  destination: BookingAnswerDestination;
  /** destination "column": the Task Allocation column that receives the answer, once the form has been saved. */
  columnId: EntityId | null;
}

export type BookingTemplateField = BookingStandardField | BookingCustomField;

export interface BookingTemplateSection {
  id: string;
  title: string;
  hint: string | null;
  fields: BookingTemplateField[];
}

/** The optional second tab where deliverables are listed line by line. */
export interface BookingAssetsSection {
  enabled: boolean;
  tabLabel: string;
  title: string;
  hint: string;
}

export interface BookingFormTemplate {
  version: 1;
  requestTabLabel: string;
  sections: BookingTemplateSection[];
  assets: BookingAssetsSection;
  submitLabel: string;
  /** The small print beside the submit button. */
  submitNote: string;
}

/** A form saved under a name, to be loaded again later. Belongs to the workspace, not to whoever saved it. */
export interface BookingTemplate extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  template: BookingFormTemplate;
  createdBy: EntityId;
}

export type BookingTemplateInput = Pick<BookingTemplate, "workspaceId" | "name" | "template" | "createdBy">;

/** Human names for the kinds of custom question. */
export const BOOKING_FIELD_TYPE_LABELS: Record<BookingFieldType, string> = {
  TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  LINK: "Link",
  CHECKBOX: "Yes / no",
  TAGS: "Choice",
  SIZE: "Size",
};

/** What each standard question is, for the editor's "add a question" list. */
export const BOOKING_STANDARD_KEY_LABELS: Record<BookingStandardKey, string> = {
  requesterName: "Requester's name",
  requesterEmail: "Requester's email",
  department: "School or department",
  title: "Task name",
  brief: "Brief",
  assetTypes: "Asset type",
  dueDate: "Needed by",
  priority: "Urgency",
  referenceUrl: "Link to a brief",
  team: "Team",
};

const std = (key: BookingStandardKey, label: string, rest: Partial<Omit<BookingStandardField, "kind" | "key" | "id" | "label">> = {}): BookingStandardField => ({
  kind: "standard",
  id: `std-${key}`,
  key,
  label,
  hint: null,
  placeholder: null,
  required: isLockedStandardKey(key),
  width: "full",
  ...rest,
});

/** The form every workspace starts with; also what "Reset to default" restores. */
export function defaultBookingFormTemplate(): BookingFormTemplate {
  return {
    version: 1,
    requestTabLabel: "Request",
    sections: [
      {
        id: "sec-about",
        title: "About you",
        hint: "So the team knows who to come back to.",
        fields: [
          std("requesterName", "Your name", { placeholder: "e.g. Priya Nair", width: "half" }),
          std("requesterEmail", "Email", { placeholder: "you@rmit.edu.au", width: "half" }),
          std("department", "School, department or portfolio", { placeholder: "e.g. School of Design" }),
        ],
      },
      {
        id: "sec-task",
        title: "The task",
        hint: "Plain language is perfect. Attach links to briefs or examples where you have them.",
        fields: [
          std("title", "What is it?", { placeholder: "e.g. Open Day 2026 wayfinding posters" }),
          std("brief", "Tell us more", { placeholder: "What do you need, who is it for, what should it achieve, and is there anything it must include?" }),
          // The two chip questions take the full width: at half they wrap their
          // last chip onto a line of its own, which reads as a mistake.
          std("assetTypes", "Asset type"),
          // The two that answer "when": a dropdown and a date, side by side.
          std("priority", "How urgent?", { width: "half" }),
          std("dueDate", "Needed by", { width: "half" }),
          std("referenceUrl", "Link to a brief or examples", { placeholder: "https://" }),
        ],
      },
      {
        id: "sec-team",
        title: "Who should do it?",
        hint: "Not sure? Leave it blank and we will route it.",
        fields: [std("team", "Team")],
      },
    ],
    assets: {
      enabled: true,
      tabLabel: "Assets & specs",
      title: "Assets and specs",
      hint: "Optional. List each deliverable with its size, format or other requirements and the team tracks them one by one — or paste a link to a list you already have.",
    },
    submitLabel: "Book this task",
    submitNote: "You'll get a reference to quote when following up.",
  };
}

/** Every question on the form, in reading order. */
export function templateFields(template: BookingFormTemplate): BookingTemplateField[] {
  return template.sections.flatMap((s) => s.fields);
}

export function standardFieldFor(template: BookingFormTemplate, key: BookingStandardKey): BookingStandardField | null {
  for (const field of templateFields(template)) if (field.kind === "standard" && field.key === key) return field;
  return null;
}

export function customFields(template: BookingFormTemplate): BookingCustomField[] {
  return templateFields(template).filter((f): f is BookingCustomField => f.kind === "custom");
}

/** Standard questions the form does not currently ask; the editor offers these to add back. */
export function missingStandardKeys(template: BookingFormTemplate): BookingStandardKey[] {
  const present = new Set(templateFields(template).flatMap((f) => (f.kind === "standard" ? [f.key] : [])));
  return BOOKING_STANDARD_KEYS.filter((key) => !present.has(key));
}

/** A fresh custom question with sensible blanks, ready for the editor. */
export function newCustomField(id: string, label: string, type: BookingFieldType, destination: BookingAnswerDestination, options: TagOption[] = []): BookingCustomField {
  return { kind: "custom", id, label, hint: null, placeholder: null, required: false, width: "full", type, options: type === "TAGS" ? options : [], destination, columnId: null };
}

/** A standard question added back with its default wording. */
export function newStandardField(key: BookingStandardKey): BookingStandardField {
  const fromDefault = standardFieldFor(defaultBookingFormTemplate(), key);
  return fromDefault ?? std(key, BOOKING_STANDARD_KEY_LABELS[key]);
}
