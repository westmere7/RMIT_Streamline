import { COLOR_TOKENS, type ColorToken } from "@/domain/common/types";

/**
 * The Button column: a button in every row that does a few things to its task
 * in one press, in the order they are listed. Nothing is stored in the cell;
 * the column's settings are the whole of it: how the button looks and what it
 * does.
 *
 * The steps are the board's own vocabulary where they name something on it (a
 * status label, a group), so a label renamed later still works, and one
 * deleted makes the step do nothing rather than something else.
 */

export const BUTTON_STYLES = ["filled", "soft", "outline"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export const BUTTON_STYLE_LABELS: Record<ButtonStyle, string> = { filled: "Filled", soft: "Soft", outline: "Outline" };

/** When the due date is set to, counted from the day the button is pressed. */
export const BUTTON_DUE_OFFSETS = ["today", "tomorrow", "in3days", "nextWeek", "clear"] as const;
export type ButtonDueOffset = (typeof BUTTON_DUE_OFFSETS)[number];
export const BUTTON_DUE_LABELS: Record<ButtonDueOffset, string> = { today: "Today", tomorrow: "Tomorrow", in3days: "In 3 days", nextWeek: "In a week", clear: "Clear it" };

export type ButtonAction =
  /** A status label by id; null is the board's first "done" label. */
  | { kind: "set_status"; labelId: string | null }
  | { kind: "set_priority"; labelId: string | null }
  | { kind: "assign_me" }
  | { kind: "unassign_me" }
  | { kind: "set_due"; offset: ButtonDueOffset }
  | { kind: "move_to_group"; groupId: string | null }
  | { kind: "complete_assets" }
  | { kind: "post_update"; text: string }
  | { kind: "open_link"; url: string }
  | { kind: "duplicate" }
  | { kind: "archive" };

export type ButtonActionKind = ButtonAction["kind"];

export const BUTTON_ACTION_KINDS: readonly ButtonActionKind[] = ["set_status", "set_priority", "assign_me", "unassign_me", "set_due", "move_to_group", "complete_assets", "post_update", "open_link", "duplicate", "archive"];

export const BUTTON_ACTION_LABELS: Record<ButtonActionKind, string> = {
  set_status: "Set the status",
  set_priority: "Set the priority",
  assign_me: "Put me on it",
  unassign_me: "Take me off it",
  set_due: "Set the due date",
  move_to_group: "Move to a group",
  complete_assets: "Tick off every asset",
  post_update: "Post an update",
  open_link: "Open a link",
  duplicate: "Duplicate the task",
  archive: "Archive the task",
};

/** A fresh step of a kind, with nothing chosen that needs choosing. */
export function newButtonAction(kind: ButtonActionKind): ButtonAction {
  switch (kind) {
    case "set_status":
      return { kind, labelId: null };
    case "set_priority":
      return { kind, labelId: "high" };
    case "set_due":
      return { kind, offset: "today" };
    case "move_to_group":
      return { kind, groupId: null };
    case "post_update":
      return { kind, text: "" };
    case "open_link":
      return { kind, url: "" };
    default:
      return { kind } as ButtonAction;
  }
}

export const BUTTON_MAX_ACTIONS = 6;
export const BUTTON_LABEL_MAX = 24;

export interface ButtonColumnSettings {
  kind: "button";
  label: string;
  color: ColorToken;
  style: ButtonStyle;
  actions: ButtonAction[];
  /** Ask before doing it, for a press that is hard to undo. */
  confirm: boolean;
}

export const DEFAULT_BUTTON_SETTINGS: ButtonColumnSettings = {
  kind: "button",
  label: "Mark done",
  color: "green",
  style: "soft",
  actions: [{ kind: "set_status", labelId: null }],
  confirm: false,
};

/**
 * Ready-made buttons, offered first in the settings so a board gets a useful
 * one in a click. Each is a whole setting: label, colour and steps.
 */
export const BUTTON_PRESETS: ReadonlyArray<{ id: string; name: string; settings: Omit<ButtonColumnSettings, "kind" | "style"> }> = [
  { id: "done", name: "Mark done", settings: { label: "Mark done", color: "green", confirm: false, actions: [{ kind: "set_status", labelId: null }, { kind: "complete_assets" }] } },
  { id: "take", name: "I'll take it", settings: { label: "Take it", color: "blue", confirm: false, actions: [{ kind: "assign_me" }, { kind: "set_status", labelId: "working" }] } },
  { id: "review", name: "Send for review", settings: { label: "To review", color: "violet", confirm: false, actions: [{ kind: "set_status", labelId: "review" }, { kind: "post_update", text: "Ready for review." }] } },
  { id: "urgent", name: "Make it urgent", settings: { label: "Urgent", color: "rose", confirm: false, actions: [{ kind: "set_priority", labelId: "critical" }, { kind: "set_due", offset: "tomorrow" }] } },
  { id: "stuck", name: "Flag as stuck", settings: { label: "Stuck", color: "red", confirm: false, actions: [{ kind: "set_status", labelId: "stuck" }, { kind: "post_update", text: "Stuck: needs a hand." }] } },
  { id: "archive", name: "Archive", settings: { label: "Archive", color: "gray", confirm: true, actions: [{ kind: "archive" }] } },
];

function cleanAction(raw: unknown): ButtonAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const id = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (a.kind) {
    case "set_status":
    case "set_priority":
      return { kind: a.kind, labelId: id(a.labelId) };
    case "set_due":
      return { kind: "set_due", offset: (BUTTON_DUE_OFFSETS as readonly string[]).includes(a.offset as string) ? (a.offset as ButtonDueOffset) : "today" };
    case "move_to_group":
      return { kind: "move_to_group", groupId: id(a.groupId) };
    case "post_update":
      return { kind: "post_update", text: text(a.text).slice(0, 2000) };
    case "open_link":
      return { kind: "open_link", url: text(a.url).slice(0, 2000) };
    case "assign_me":
    case "unassign_me":
    case "complete_assets":
    case "duplicate":
    case "archive":
      return { kind: a.kind };
    default:
      return null;
  }
}

/** A column's settings with anything missing or unknown filled in. */
export function buttonSettings(settings: { kind: string } | null | undefined): ButtonColumnSettings {
  if (settings?.kind !== "button") return structuredClone(DEFAULT_BUTTON_SETTINGS);
  const s = settings as Partial<ButtonColumnSettings>;
  const actions = Array.isArray(s.actions) ? s.actions.map(cleanAction).filter((a): a is ButtonAction => a !== null).slice(0, BUTTON_MAX_ACTIONS) : structuredClone(DEFAULT_BUTTON_SETTINGS.actions);
  return {
    kind: "button",
    label: typeof s.label === "string" && s.label.trim() ? s.label.trim().slice(0, BUTTON_LABEL_MAX) : DEFAULT_BUTTON_SETTINGS.label,
    color: COLOR_TOKENS.includes(s.color as ColorToken) ? (s.color as ColorToken) : DEFAULT_BUTTON_SETTINGS.color,
    style: BUTTON_STYLES.includes(s.style as ButtonStyle) ? s.style! : DEFAULT_BUTTON_SETTINGS.style,
    actions,
    confirm: s.confirm === true,
  };
}

/** A step that will do nothing as set up: a link with no address, an update with no words. */
export function buttonActionIncomplete(action: ButtonAction): boolean {
  if (action.kind === "open_link") return !/^https?:\/\/\S+/i.test(action.url.trim());
  if (action.kind === "post_update") return action.text.trim() === "";
  if (action.kind === "move_to_group") return action.groupId === null;
  return false;
}
