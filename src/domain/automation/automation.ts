import type { ColumnValue } from "@/domain/item/item";
import type { EntityId, ISODateTime } from "@/domain/common/types";

/**
 * Automations: "when this happens, do that", on one board.
 *
 * A rule is data, not code — a trigger, a list of conditions and a list of
 * actions, all stored as JSON — so the same definition is read by the builder
 * in the browser, by the runner on the server and, one day, by anything else
 * that wants to know what a board does on its own.
 *
 * The important design constraint is where a rule runs. Nothing here executes
 * in the browser: a write to a board raises a row in `automation_events` from a
 * database trigger, and the runner drains that queue server-side. A rule fires
 * whether the change came from someone dragging a cell, from the booking form,
 * from a portal, from a link propagating a value, or from a hand-written SQL
 * statement — and it fires when nobody has the app open at all.
 */

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const AUTOMATION_TRIGGER_KINDS = [
  "item_created",
  "subitem_created",
  "item_renamed",
  "name_contains",
  "comment_contains",
  "column_contains",
  "column_changed",
  "column_set_to",
  "column_cleared",
  "number_crosses",
  "person_assigned",
  "person_unassigned",
  "item_moved_to_group",
  "item_moved_from_group",
  "comment_added",
  "item_archived",
  "item_restored",
  "date_arrives",
  "column_unchanged_for",
  "recurring",
  "manual",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

/**
 * The three ways a rule can be set going.
 *
 * An `event` rule is woken by something that happened, and the queue row says
 * what. A `schedule` rule is woken by the clock, has no event behind it, and so
 * has to go looking for the items it applies to. A `manual` rule is never woken
 * at all: it is a saved group of actions — a quick run — that somebody points
 * at a task and fires by hand, and neither the queue nor the clock will touch
 * it. Naming the difference here keeps every `switch` over trigger kinds
 * honest, and keeps the runner's two unattended passes from ever picking up
 * the third kind by accident.
 */
export type AutomationTriggerTiming = "event" | "schedule" | "manual";

export const TRIGGER_TIMING: Record<AutomationTriggerKind, AutomationTriggerTiming> = {
  item_created: "event",
  subitem_created: "event",
  item_renamed: "event",
  name_contains: "event",
  comment_contains: "event",
  column_contains: "event",
  column_changed: "event",
  column_set_to: "event",
  column_cleared: "event",
  number_crosses: "event",
  person_assigned: "event",
  person_unassigned: "event",
  item_moved_to_group: "event",
  item_moved_from_group: "event",
  comment_added: "event",
  item_archived: "event",
  item_restored: "event",
  date_arrives: "schedule",
  column_unchanged_for: "schedule",
  recurring: "schedule",
  manual: "manual",
};

/** Which day a recurring rule wakes on. */
export const RECURRENCE_KINDS = ["daily", "weekdays", "weekly", "monthly"] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

export type AutomationTrigger =
  /** A task was added to the board. `groupId` narrows it to one group. Subitems count. */
  | { kind: "item_created"; groupId?: EntityId | null }
  /** A subitem was added under a task. The subitem is the task in hand. */
  | { kind: "subitem_created" }
  | { kind: "item_renamed" }
  /**
   * Keyword triggers. `text` is one phrase, or several separated by commas,
   * any one of which is enough; the match ignores case. The name is checked
   * when a task is added and when it is renamed; an update when it is posted;
   * a text-like column when it changes.
   */
  | { kind: "name_contains"; text: string }
  | { kind: "comment_contains"; text: string }
  | { kind: "column_contains"; columnId: EntityId; text: string }
  /** A column's value changed, whatever it changed to. */
  | { kind: "column_changed"; columnId: EntityId }
  /** A column that held something now holds nothing. */
  | { kind: "column_cleared"; columnId: EntityId }
  /**
   * A NUMBER column went past a line: from at-or-below to above it, or from
   * at-or-above to below. Only the crossing fires, not every change beyond it.
   */
  | { kind: "number_crosses"; columnId: EntityId; direction: "above" | "below"; threshold: number }
  /**
   * A column became a particular value: a status label, a dropdown option, a
   * tick. `labelId` covers STATUS, DROPDOWN and PRIORITY; `checked` covers
   * CHECKBOX; `text` covers SIZE and STAKEHOLDER, which store a bare string.
   */
  | { kind: "column_set_to"; columnId: EntityId; labelId?: string | null; checked?: boolean; text?: string | null }
  /** Somebody was added to a PERSON or PEOPLE column. `userId` narrows it to one person. */
  | { kind: "person_assigned"; columnId: EntityId; userId?: EntityId | null }
  /** Somebody was taken off a PERSON or PEOPLE column. `userId` narrows it to one person. */
  | { kind: "person_unassigned"; columnId: EntityId; userId?: EntityId | null }
  | { kind: "item_moved_to_group"; groupId: EntityId }
  | { kind: "item_moved_from_group"; groupId: EntityId }
  | { kind: "comment_added" }
  | { kind: "item_archived" }
  | { kind: "item_restored" }
  /**
   * A column has sat unchanged for `days` days. Wakes at `atHour`, and fires
   * once per stretch of stillness rather than every morning: the receipt is
   * keyed to when the value last moved, so a task that is touched and then
   * goes quiet again is flagged again.
   */
  | { kind: "column_unchanged_for"; columnId: EntityId; days: number; atHour: number }
  /**
   * A date column arrives. `offsetDays` shifts the firing away from the date
   * itself: -2 fires two days before, +1 the day after. `atHour` is the hour of
   * the workspace's day the rule wakes at, in the business timezone.
   */
  | { kind: "date_arrives"; columnId: EntityId; offsetDays: number; atHour: number }
  /** The clock, with no item behind it. Actions that need one are refused when the rule is saved. */
  | { kind: "recurring"; recurrence: RecurrenceKind; weekday?: number; dayOfMonth?: number; atHour: number }
  /**
   * Nothing wakes it. A quick run: a named group of actions somebody fires by
   * hand against the tasks they choose, with no trigger and no conditions.
   */
  | { kind: "manual" };

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const CONDITION_OPS = [
  "is",
  "is_not",
  "is_empty",
  "is_not_empty",
  "contains",
  "not_contains",
  "greater_than",
  "less_than",
  "before",
  "after",
  "is_overdue",
] as const;

export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Whether every condition has to hold, or any one of them. */
export type ConditionMatch = "all" | "any";

export type AutomationCondition =
  /**
   * A column, an operator and something to compare against. `value` is a whole
   * `ColumnValue` rather than a bare string so the comparison can be made with
   * the same code that renders the cell, and so a saved condition survives a
   * label being renamed.
   */
  | { kind: "column"; columnId: EntityId; op: ConditionOp; value?: ColumnValue | null }
  | { kind: "group"; op: "is" | "is_not"; groupId: EntityId }
  /** Who set the change off. `actor` is whoever's write raised the event. */
  | { kind: "actor"; op: "is" | "is_not"; userId: EntityId }
  /** A subitem, or a top-level task. Rules that should not run twice over a tree want this. */
  | { kind: "item_kind"; is: "item" | "subitem" };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const AUTOMATION_ACTION_KINDS = [
  "set_value",
  "clear_value",
  "copy_value",
  "adjust_number",
  "add_tags",
  "remove_tags",
  "move_to_group",
  "assign_person",
  "unassign_person",
  "shift_date",
  "set_date_relative",
  "set_name",
  "set_description",
  "set_parent_value",
  "set_subitems_value",
  "notify",
  "add_comment",
  "create_item",
  "create_subitem",
  "duplicate_item",
  "archive_item",
  "restore_item",
  "send_webhook",
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];

/**
 * Who a notification goes to.
 *
 * `people_on_item` is the one people reach for: everybody named in a PERSON or
 * PEOPLE column on the task, which is what "the owners" means everywhere else
 * in the app. `column` is one such column in particular, `creator` whoever
 * added the task, `board_members` everyone on the board. The actor is left
 * out of every audience that describes a group — being told about your own
 * edit is noise, and the app has never done it — but not of `specific`: a
 * person named by name was named on purpose, and a rule that says "tell me"
 * should tell its author even when the author set it off.
 */
export const NOTIFY_AUDIENCES = ["people_on_item", "column", "creator", "actor", "board_owners", "board_members", "specific"] as const;
export type NotifyAudience = (typeof NOTIFY_AUDIENCES)[number];

export type AutomationAction =
  | { kind: "set_value"; columnId: EntityId; value: ColumnValue }
  | { kind: "clear_value"; columnId: EntityId }
  /** Copy one column's value onto another of the same type. An empty source empties the target. */
  | { kind: "copy_value"; fromColumnId: EntityId; toColumnId: EntityId }
  /** Add `delta` to a NUMBER column, treating an empty cell as zero. Negative to count down. */
  | { kind: "adjust_number"; columnId: EntityId; delta: number }
  /** Add tags to a TAGS column, keeping what is there. Templates are filled in. */
  | { kind: "add_tags"; columnId: EntityId; tags: string[] }
  | { kind: "remove_tags"; columnId: EntityId; tags: string[] }
  | { kind: "move_to_group"; groupId: EntityId }
  /**
   * `userIds` may be empty when `useActor` or `useCreator` is set: the person
   * whose change fired the rule, or the person who added the task.
   */
  | { kind: "assign_person"; columnId: EntityId; userIds: EntityId[]; useActor?: boolean; useCreator?: boolean }
  | { kind: "unassign_person"; columnId: EntityId; userIds: EntityId[]; all?: boolean }
  /** Move a date column by a number of days, in either direction. Does nothing to an empty cell. */
  | { kind: "shift_date"; columnId: EntityId; days: number }
  /** Set a date column to today plus (or minus) a number of days. */
  | { kind: "set_date_relative"; columnId: EntityId; days: number }
  /** Rename the task. A template: "{ticket} · {item}" is the usual reason. */
  | { kind: "set_name"; name: string }
  /** Replace the task's description. Empty clears it. */
  | { kind: "set_description"; text: string }
  /** Set a column on the task's parent. Does nothing to a top-level task. */
  | { kind: "set_parent_value"; columnId: EntityId; value: ColumnValue }
  /** Set a column on every live subitem of the task. */
  | { kind: "set_subitems_value"; columnId: EntityId; value: ColumnValue }
  /** `columnId` is for the `column` audience; `userIds` for `specific`. */
  | { kind: "notify"; audience: NotifyAudience; userIds?: EntityId[]; columnId?: EntityId | null; message: string }
  | { kind: "add_comment"; body: string }
  /** A new task, here or on another board this workspace holds. */
  | { kind: "create_item"; boardId?: EntityId | null; groupId?: EntityId | null; name: string; values?: Array<{ columnId: EntityId; value: ColumnValue }> }
  | { kind: "create_subitem"; name: string }
  /** A copy beside the original, subitems and all, named "… (copy)". */
  | { kind: "duplicate_item" }
  | { kind: "archive_item" }
  | { kind: "restore_item" }
  /**
   * POST a JSON description of what happened to an https address. The one
   * action that leaves the app; `webhookUrlProblem` says which addresses are
   * refused and why.
   */
  | { kind: "send_webhook"; url: string };

/**
 * The actions that make sense with no task in hand — a recurring rule, or a
 * quick run pointed at nothing. Everything else edits the task it is given.
 */
export const ACTIONS_WITHOUT_ITEM: readonly AutomationActionKind[] = ["notify", "create_item", "send_webhook"];

export function actionNeedsItem(kind: AutomationActionKind): boolean {
  return !ACTIONS_WITHOUT_ITEM.includes(kind);
}

/** How long a webhook may take to answer before the action is marked failed. */
export const WEBHOOK_TIMEOUT_MS = 8_000;

/**
 * Why a webhook address is refused, or null when it may be used.
 *
 * The runner calls this address from a server that can see things a browser
 * cannot — the database's own network, cloud metadata endpoints, whatever else
 * sits beside it. So: https only, no credentials in the address, and nothing
 * that names this machine or a private range. A hostname that later resolves
 * to a private address is not caught here; the runner refuses redirects for
 * the same reason. Checked when a rule is saved and again when it runs.
 */
export function webhookUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "That is not a web address.";
  }
  if (url.protocol !== "https:") return "A webhook has to be an https:// address.";
  if (url.username || url.password) return "Take the username and password out of the address.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return "That is not a web address.";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "::1" || host === "::") {
    return "A webhook cannot point at this server.";
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return "A webhook cannot point at a private address.";
    }
  }
  if (host.includes(":") && (/^f[cd]/.test(host) || host.startsWith("fe80") || host.startsWith("::ffff:"))) return "A webhook cannot point at a private address.";
  return null;
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

export interface AutomationRule {
  id: EntityId;
  workspaceId: EntityId;
  boardId: EntityId;
  /** What the builder wrote, or the sentence the rule describes itself as. */
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditionMatch: ConditionMatch;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  createdBy: EntityId | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Kept on the row so the list can say "last ran 4 minutes ago" without reading the log. */
  lastRunAt: ISODateTime | null;
  runCount: number;
  /** The last thing that went wrong, cleared by the next clean run. */
  lastError: string | null;
}

export type AutomationRuleInput = Omit<AutomationRule, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "runCount" | "lastError">;

export type AutomationRulePatch = Partial<Pick<AutomationRule, "name" | "enabled" | "trigger" | "conditionMatch" | "conditions" | "actions">>;

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export const AUTOMATION_EVENT_KINDS = ["item_created", "item_renamed", "value_changed", "item_moved", "item_archived", "item_restored", "comment_added"] as const;
export type AutomationEventKind = (typeof AUTOMATION_EVENT_KINDS)[number];

/**
 * One thing that happened on a board, as the database saw it.
 *
 * Raised by triggers on `items`, `item_column_values` and `comments`, so the
 * queue is complete by construction: there is no write path that can reach
 * those tables without going past the trigger, which is the whole reason the
 * rules do not live in `ItemService` where the app's own writes are.
 */
export interface AutomationEvent {
  id: string;
  boardId: EntityId;
  itemId: EntityId | null;
  kind: AutomationEventKind;
  columnId: EntityId | null;
  actorId: EntityId | null;
  /** Shape depends on `kind`: before/after values, the group moved from and to, the comment body. */
  payload: AutomationEventPayload;
  /**
   * How many automations deep this event is. A person's own edit is 0; anything
   * an action writes is one more than the event that caused it. The runner
   * refuses to act past `MAX_EVENT_DEPTH`, which is what stops two rules that
   * undo each other from running until the database fills up.
   */
  depth: number;
  createdAt: ISODateTime;
  processedAt: ISODateTime | null;
  attempts: number;
  error: string | null;
}

export interface AutomationEventPayload {
  before?: ColumnValue | null;
  after?: ColumnValue | null;
  fromGroupId?: EntityId | null;
  toGroupId?: EntityId | null;
  commentId?: EntityId | null;
  body?: string | null;
  parentItemId?: EntityId | null;
  /** For `item_renamed`: what it was called, and what it is called now. `item_created` carries `toName` too. */
  fromName?: string | null;
  toName?: string | null;
}

/**
 * The phrases a keyword trigger is listening for, from what was typed:
 * split on commas, trimmed, lower-cased, empties dropped.
 */
export function keywordsOf(text: string): string[] {
  return text
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether any of the phrases appears in the text, ignoring case. Markup in the text is ignored. */
export function mentionsAny(haystack: string | null | undefined, keywords: readonly string[]): boolean {
  if (!haystack || keywords.length === 0) return false;
  const plain = haystack.replace(/<[^>]*>/g, " ").toLowerCase();
  return keywords.some((word) => plain.includes(word));
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

/**
 * When the runner last looked, and what it found.
 *
 * Stamped on every pass, including the ones that find nothing, so that "the
 * scheduler is dead" and "no rule matched anything" stop looking identical.
 */
export interface AutomationHeartbeat {
  lastRunAt: ISODateTime;
  events: number;
  scheduled: number;
  ran: number;
  skipped: number;
  failed: number;
}

/**
 * How long the runner may be quiet before the board says something.
 *
 * The shipped drivers tick every five minutes (GitHub Actions) or every minute
 * (pg_cron). Twenty is late enough that an ordinary late run says nothing and
 * early enough that somebody notices the same morning.
 */
export const HEARTBEAT_STALE_MINUTES = 20;

export const AUTOMATION_RUN_STATUSES = ["ran", "skipped", "failed"] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

/**
 * What a rule did, and to what.
 *
 * `skipped` rows are kept as well as `ran` ones, because "why did my automation
 * not fire?" is the question people actually ask, and a log that only records
 * successes cannot answer it.
 */
export interface AutomationRun {
  id: EntityId;
  ruleId: EntityId;
  boardId: EntityId;
  itemId: EntityId | null;
  status: AutomationRunStatus;
  /** One line a person can read: "Set Status to Done", or "Condition not met: Priority is not High". */
  summary: string;
  detail: string | null;
  createdAt: ISODateTime;
}

export type AutomationRunInput = Omit<AutomationRun, "id" | "createdAt">;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * How many automations may run off one person's edit before the chain is cut.
 *
 * Three is enough for the arrangements people actually build — a status change
 * sets a date, which notifies somebody — and short enough that a rule pair that
 * feeds each other is stopped within a second rather than discovered on a bill.
 */
export const MAX_EVENT_DEPTH = 3;

/** How many events one drain takes, so a backlog cannot time the runner out. */
export const EVENT_BATCH_SIZE = 200;

/** How many times a failing event is retried before it is left alone. */
export const MAX_EVENT_ATTEMPTS = 3;

/** Actions per rule. A builder that lets somebody add forty of them is a builder with a bug. */
export const MAX_ACTIONS_PER_RULE = 10;

export const MAX_CONDITIONS_PER_RULE = 10;

/**
 * Which triggers can carry which actions.
 *
 * A recurring rule has no task in hand, so every action that edits one is
 * meaningless for it; it may create tasks, tell people things and call out,
 * and that is all. Checked when a rule is saved rather than when it runs, so
 * the mistake is caught by the person making it.
 */
export function actionsAllowedFor(kind: AutomationTriggerKind): readonly AutomationActionKind[] {
  if (kind === "recurring") return ACTIONS_WITHOUT_ITEM;
  return AUTOMATION_ACTION_KINDS;
}

/** Whether this trigger hands the runner a task to act on. */
export function triggerHasItem(kind: AutomationTriggerKind): boolean {
  return kind !== "recurring";
}

/**
 * How many tasks one quick run may be pointed at.
 *
 * Fifty is a whole group on most boards. Above that a person is not running a
 * quick run, they are running a migration, and a migration wants a progress
 * bar and an undo — neither of which a dialog with a Run button should
 * pretend to be.
 */
export const MAX_QUICK_RUN_ITEMS = 50;
