import { COLOR_TOKENS, type ColorToken, type EntityId } from "@/domain/common/types";
import { BUTTON_MAX_ACTIONS, cleanButtonAction, type ButtonAction } from "./button";

/**
 * The board toolbar's first button is a slot. New item sits there unless the
 * board has made buttons of its own: each one a label, a colour and one thing
 * it does when pressed. Whichever is chosen is the one on the toolbar.
 *
 * A button is made first and given its command after, so the commands can
 * grow without the buttons changing shape.
 */
export type ToolbarCommand =
  /** These steps on every ticked task, the same steps a Button column runs. */
  | { kind: "steps"; actions: ButtonAction[] }
  /** One of the board's quick runs, on the ticked tasks or ones picked then. */
  | { kind: "quick_run"; ruleId: EntityId | null }
  /** One of the board's saved views. */
  | { kind: "open_view"; viewId: EntityId | null }
  | { kind: "open_link"; url: string };

export type ToolbarCommandKind = ToolbarCommand["kind"];

export const TOOLBAR_COMMAND_KINDS: readonly ToolbarCommandKind[] = ["steps", "quick_run", "open_view", "open_link"];

export const TOOLBAR_COMMAND_LABELS: Record<ToolbarCommandKind, string> = {
  steps: "Run steps on the ticked tasks",
  quick_run: "Run a quick run",
  open_view: "Open a saved view",
  open_link: "Open a link",
};

export interface ToolbarButton {
  id: EntityId;
  label: string;
  color: ColorToken;
  /** A Lucide icon name from the app's icon set (DynamicIcon). */
  icon: string;
  command: ToolbarCommand;
}

export const DEFAULT_TOOLBAR_BUTTON_ICON = "zap";

export interface ToolbarSlot {
  /** The board's own buttons, in the order they were made. */
  buttons: ToolbarButton[];
  /** The one on the toolbar; null is New item. */
  activeId: EntityId | null;
}

export const TOOLBAR_BUTTON_LABEL_MAX = 24;
export const TOOLBAR_BUTTONS_MAX = 12;

export function newToolbarCommand(kind: ToolbarCommandKind): ToolbarCommand {
  switch (kind) {
    case "steps":
      return { kind, actions: [{ kind: "set_status", labelId: null }] };
    case "quick_run":
      return { kind, ruleId: null };
    case "open_view":
      return { kind, viewId: null };
    case "open_link":
      return { kind, url: "" };
  }
}

function cleanCommand(raw: unknown): ToolbarCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (c.kind) {
    case "steps":
      return { kind: "steps", actions: Array.isArray(c.actions) ? c.actions.map(cleanButtonAction).filter((a): a is ButtonAction => a !== null).slice(0, BUTTON_MAX_ACTIONS) : [] };
    case "quick_run":
      return { kind: "quick_run", ruleId: id(c.ruleId) };
    case "open_view":
      return { kind: "open_view", viewId: id(c.viewId) };
    case "open_link":
      return { kind: "open_link", url: typeof c.url === "string" ? c.url.slice(0, 2000) : "" };
    default:
      return null;
  }
}

/**
 * A stored slot read back whole. The first version held a single quick run
 * ({kind: "quick_run", ruleId, label}); it reads as one button, chosen.
 */
export function toolbarSlot(raw: unknown): ToolbarSlot {
  if (!raw || typeof raw !== "object") return { buttons: [], activeId: null };
  const r = raw as Record<string, unknown>;
  if (r.kind === "quick_run" && typeof r.ruleId === "string") {
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, TOOLBAR_BUTTON_LABEL_MAX) : "Quick run";
    const id = `legacy-${r.ruleId}`;
    return { buttons: [{ id, label, color: "red", icon: DEFAULT_TOOLBAR_BUTTON_ICON, command: { kind: "quick_run", ruleId: r.ruleId } }], activeId: id };
  }
  const buttons: ToolbarButton[] = [];
  for (const b of Array.isArray(r.buttons) ? r.buttons : []) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    const command = cleanCommand(x.command);
    if (typeof x.id !== "string" || !command) continue;
    buttons.push({
      id: x.id,
      label: typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, TOOLBAR_BUTTON_LABEL_MAX) : "Button",
      color: COLOR_TOKENS.includes(x.color as ColorToken) ? (x.color as ColorToken) : "red",
      icon: typeof x.icon === "string" && /^[a-z0-9-]{1,40}$/.test(x.icon) ? x.icon : DEFAULT_TOOLBAR_BUTTON_ICON,
      command,
    });
  }
  const capped = buttons.slice(0, TOOLBAR_BUTTONS_MAX);
  const activeId = typeof r.activeId === "string" && capped.some((b) => b.id === r.activeId) ? r.activeId : null;
  return { buttons: capped, activeId };
}

/** A command that would do nothing as set up. */
export function toolbarCommandIncomplete(command: ToolbarCommand): boolean {
  switch (command.kind) {
    case "steps":
      return command.actions.length === 0;
    case "quick_run":
      return command.ruleId === null;
    case "open_view":
      return command.viewId === null;
    case "open_link":
      return !/^https?:\/\/\S+/i.test(command.url.trim());
  }
}
