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
  "column_changed",
  "column_set_to",
  "person_assigned",
  "item_moved_to_group",
  "comment_added",
  "item_archived",
  "date_arrives",
  "recurring",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

/**
 * The two ways a rule can be woken.
 *
 * An `event` rule is woken by something that happened, and the queue row says
 * what. A `schedule` rule is woken by the clock, has no event behind it, and so
 * has to go looking for the items it applies to. They are different enough that
 * the runner treats them as two passes, and naming the difference here keeps
 * every `switch` over trigger kinds honest.
 */
export type AutomationTriggerTiming = "event" | "schedule";

export const TRIGGER_TIMING: Record<AutomationTriggerKind, AutomationTriggerTiming> = {
  item_created: "event",
  column_changed: "event",
  column_set_to: "event",
  person_assigned: "event",
  item_moved_to_group: "event",
  comment_added: "event",
  item_archived: "event",
  date_arrives: "schedule",
  recurring: "schedule",
};

/** Which day a recurring rule wakes on. */
export const RECURRENCE_KINDS = ["daily", "weekdays", "weekly", "monthly"] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

export type AutomationTrigger =
  /** A task was added to the board. `groupId` narrows it to one group. */
  | { kind: "item_created"; groupId?: EntityId | null }
  /** A column's value changed, whatever it changed to. */
  | { kind: "column_changed"; columnId: EntityId }
  /**
   * A column became a particular value: a status label, a dropdown option, a
   * tick. `labelId` covers STATUS, DROPDOWN and PRIORITY; `checked` covers
   * CHECKBOX; `text` covers SIZE and STAKEHOLDER, which store a bare string.
   */
  | { kind: "column_set_to"; columnId: EntityId; labelId?: string | null; checked?: boolean; text?: string | null }
  /** Somebody was added to a PERSON or PEOPLE column. `userId` narrows it to one person. */
  | { kind: "person_assigned"; columnId: EntityId; userId?: EntityId | null }
  | { kind: "item_moved_to_group"; groupId: EntityId }
  | { kind: "comment_added" }
  | { kind: "item_archived" }
  /**
   * A date column arrives. `offsetDays` shifts the firing away from the date
   * itself: -2 fires two days before, +1 the day after. `atHour` is the hour of
   * the workspace's day the rule wakes at, in the business timezone.
   */
  | { kind: "date_arrives"; columnId: EntityId; offsetDays: number; atHour: number }
  /** The clock, with no item behind it. Actions that need one are refused when the rule is saved. */
  | { kind: "recurring"; recurrence: RecurrenceKind; weekday?: number; dayOfMonth?: number; atHour: number };

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
  "move_to_group",
  "assign_person",
  "unassign_person",
  "shift_date",
  "set_date_relative",
  "notify",
  "add_comment",
  "create_item",
  "create_subitem",
  "archive_item",
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];

/**
 * Who a notification goes to.
 *
 * `people_on_item` is the one people reach for: everybody named in a PERSON or
 * PEOPLE column on the task, which is what "the owners" means everywhere else
 * in the app. The actor is excluded from every choice except `actor` itself —
 * being told about your own edit is noise, and the app has never done it.
 */
export const NOTIFY_AUDIENCES = ["people_on_item", "actor", "board_owners", "specific"] as const;
export type NotifyAudience = (typeof NOTIFY_AUDIENCES)[number];

export type AutomationAction =
  | { kind: "set_value"; columnId: EntityId; value: ColumnValue }
  | { kind: "clear_value"; columnId: EntityId }
  | { kind: "move_to_group"; groupId: EntityId }
  /** `userIds` may be empty when `useActor` is set: the person whose change fired the rule. */
  | { kind: "assign_person"; columnId: EntityId; userIds: EntityId[]; useActor?: boolean }
  | { kind: "unassign_person"; columnId: EntityId; userIds: EntityId[]; all?: boolean }
  /** Move a date column by a number of days, in either direction. Does nothing to an empty cell. */
  | { kind: "shift_date"; columnId: EntityId; days: number }
  /** Set a date column to today plus (or minus) a number of days. */
  | { kind: "set_date_relative"; columnId: EntityId; days: number }
  | { kind: "notify"; audience: NotifyAudience; userIds?: EntityId[]; message: string }
  | { kind: "add_comment"; body: string }
  /** A new task, here or on another board this workspace holds. */
  | { kind: "create_item"; boardId?: EntityId | null; groupId?: EntityId | null; name: string; values?: Array<{ columnId: EntityId; value: ColumnValue }> }
  | { kind: "create_subitem"; name: string }
  | { kind: "archive_item" };

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

export const AUTOMATION_EVENT_KINDS = ["item_created", "value_changed", "item_moved", "item_archived", "comment_added"] as const;
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
 * meaningless for it; it may create tasks and tell people things, and that is
 * all. Checked when a rule is saved rather than when it runs, so the mistake is
 * caught by the person making it.
 */
export function actionsAllowedFor(kind: AutomationTriggerKind): readonly AutomationActionKind[] {
  if (kind === "recurring") return ["notify", "create_item"];
  return AUTOMATION_ACTION_KINDS;
}

/** Whether this trigger hands the runner a task to act on. */
export function triggerHasItem(kind: AutomationTriggerKind): boolean {
  return kind !== "recurring";
}
