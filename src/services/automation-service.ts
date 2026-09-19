import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationRuleInput,
  AutomationRulePatch,
  AutomationRun,
  AutomationTrigger,
  BoardColumn,
  BoardGroup,
  ColumnValue,
  EntityId,
  User,
} from "@/domain";
import {
  MAX_ACTIONS_PER_RULE,
  MAX_CONDITIONS_PER_RULE,
  RECURRENCE_KINDS,
  TRIGGER_TIMING,
  actionsAllowedFor,
  columnLabels,
} from "@/domain";
import type { Repositories } from "@/data/repositories";

/** A rule that could not be saved, worded for the person who wrote it. */
export class AutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationError";
  }
}

/** What the builder needs to word a rule: the board's own columns, groups and people. */
export interface RuleVocabulary {
  columns: readonly BoardColumn[];
  groups: readonly BoardGroup[];
  users: readonly User[];
}

/**
 * Automations, from the side that writes them.
 *
 * The runner is a separate class on purpose (`AutomationEngine`). This one is
 * what the browser talks to: it reads the rules on a board, checks a new one
 * makes sense before it is stored, and turns a stored one back into the
 * sentence somebody meant by it. It never fires anything.
 *
 * Validation is here rather than in the builder because a rule can also arrive
 * from a duplicated board, and because "this action needs a task and your
 * trigger has none" is the sort of mistake that is cheap to catch on save and
 * expensive to find in a log a fortnight later.
 */
export class AutomationService {
  constructor(private readonly repos: Repositories) {}

  listByBoard(boardId: EntityId): Promise<AutomationRule[]> {
    return this.repos.automations.listRulesByBoard(boardId);
  }

  listByWorkspace(workspaceId: EntityId): Promise<AutomationRule[]> {
    return this.repos.automations.listRulesByWorkspace(workspaceId);
  }

  listRuns(boardId: EntityId, limit = 50): Promise<AutomationRun[]> {
    return this.repos.automations.listRuns(boardId, limit);
  }

  listRunsByRule(ruleId: EntityId, limit = 50): Promise<AutomationRun[]> {
    return this.repos.automations.listRunsByRule(ruleId, limit);
  }

  async create(input: AutomationRuleInput, vocabulary: RuleVocabulary): Promise<AutomationRule> {
    validate({ trigger: input.trigger, conditions: input.conditions, actions: input.actions }, vocabulary);
    const name = input.name.trim() || describeRule(input.trigger, input.conditions, input.actions, input.conditionMatch, vocabulary);
    return this.repos.automations.createRule({ ...input, name: name.slice(0, 200) });
  }

  async update(id: EntityId, patch: AutomationRulePatch, vocabulary: RuleVocabulary): Promise<AutomationRule> {
    const existing = await this.repos.automations.getRule(id);
    if (!existing) throw new AutomationError("That automation no longer exists.");
    const merged = {
      trigger: patch.trigger ?? existing.trigger,
      conditions: patch.conditions ?? existing.conditions,
      actions: patch.actions ?? existing.actions,
    };
    // A rule being switched off is the one change that never needs checking —
    // and the one most likely to be reached for when a rule is misbehaving.
    if (patch.trigger || patch.conditions || patch.actions) validate(merged, vocabulary);
    return this.repos.automations.updateRule(id, patch);
  }

  setEnabled(id: EntityId, enabled: boolean): Promise<AutomationRule> {
    return this.repos.automations.updateRule(id, { enabled });
  }

  delete(id: EntityId): Promise<void> {
    return this.repos.automations.deleteRule(id);
  }

  /** The sentence a rule reads as, for a list that has to be scannable. */
  describe(rule: AutomationRule, vocabulary: RuleVocabulary): string {
    return describeRule(rule.trigger, rule.conditions, rule.actions, rule.conditionMatch, vocabulary);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  rule: { trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[] },
  vocabulary: RuleVocabulary,
): void {
  const { trigger, conditions, actions } = rule;
  if (actions.length === 0) throw new AutomationError("An automation needs at least one thing to do.");
  if (actions.length > MAX_ACTIONS_PER_RULE) throw new AutomationError(`An automation can do at most ${MAX_ACTIONS_PER_RULE} things.`);
  if (conditions.length > MAX_CONDITIONS_PER_RULE) throw new AutomationError(`An automation can check at most ${MAX_CONDITIONS_PER_RULE} things.`);

  const column = (id: EntityId) => vocabulary.columns.find((c) => c.id === id);
  const group = (id: EntityId) => vocabulary.groups.find((g) => g.id === id);

  switch (trigger.kind) {
    case "column_changed":
    case "column_set_to":
      if (!column(trigger.columnId)) throw new AutomationError("Pick a column for the trigger.");
      break;
    case "person_assigned": {
      const found = column(trigger.columnId);
      if (!found) throw new AutomationError("Pick a column for the trigger.");
      if (found.type !== "PERSON" && found.type !== "PEOPLE") throw new AutomationError(`${found.name} does not hold people.`);
      break;
    }
    case "item_moved_to_group":
      if (!group(trigger.groupId)) throw new AutomationError("Pick a group for the trigger.");
      break;
    case "item_created":
      if (trigger.groupId && !group(trigger.groupId)) throw new AutomationError("That group is no longer on this board.");
      break;
    case "date_arrives": {
      const found = column(trigger.columnId);
      if (!found) throw new AutomationError("Pick a date column for the trigger.");
      if (found.type !== "DATE" && found.type !== "TIMELINE") throw new AutomationError(`${found.name} does not hold a date.`);
      assertHour(trigger.atHour);
      break;
    }
    case "recurring":
      if (!RECURRENCE_KINDS.includes(trigger.recurrence)) throw new AutomationError("Pick how often this should run.");
      assertHour(trigger.atHour);
      if (trigger.recurrence === "weekly" && (trigger.weekday == null || trigger.weekday < 0 || trigger.weekday > 6)) {
        throw new AutomationError("Pick a day of the week.");
      }
      if (trigger.recurrence === "monthly" && (trigger.dayOfMonth == null || trigger.dayOfMonth < 1 || trigger.dayOfMonth > 28)) {
        // Twenty-eight, not thirty-one: a rule set to the 31st would skip
        // February entirely and most of the people who set it would never
        // notice. "Last day of the month" is a different feature.
        throw new AutomationError("Pick a day from 1 to 28. Later days do not exist in every month.");
      }
      break;
  }

  const allowed = actionsAllowedFor(trigger.kind);
  for (const action of actions) {
    if (!allowed.includes(action.kind)) {
      throw new AutomationError("A rule that runs on a schedule has no task in hand, so it can only create tasks and tell people things.");
    }
    switch (action.kind) {
      case "set_value":
      case "clear_value":
      case "shift_date":
      case "set_date_relative":
      case "assign_person":
      case "unassign_person": {
        const found = column(action.columnId);
        if (!found) throw new AutomationError("Pick a column for every action.");
        if ((action.kind === "shift_date" || action.kind === "set_date_relative") && found.type !== "DATE" && found.type !== "TIMELINE") {
          throw new AutomationError(`${found.name} does not hold a date.`);
        }
        if ((action.kind === "assign_person" || action.kind === "unassign_person") && found.type !== "PERSON" && found.type !== "PEOPLE") {
          throw new AutomationError(`${found.name} does not hold people.`);
        }
        break;
      }
      case "move_to_group":
        if (!group(action.groupId)) throw new AutomationError("Pick a group to move the task to.");
        break;
      case "notify":
        if (!action.message.trim()) throw new AutomationError("Say what the notification should read.");
        if (action.audience === "specific" && (action.userIds ?? []).length === 0) throw new AutomationError("Pick who to tell.");
        break;
      case "add_comment":
        if (!action.body.trim()) throw new AutomationError("Say what the update should read.");
        break;
      case "create_item":
      case "create_subitem":
        if (!action.name.trim()) throw new AutomationError("Give the new task a name.");
        break;
    }
  }

  for (const condition of conditions) {
    if (condition.kind === "column" && !column(condition.columnId)) throw new AutomationError("Pick a column for every condition.");
    if (condition.kind === "group" && !group(condition.groupId)) throw new AutomationError("Pick a group for every condition.");
  }

  // A rule that fires on every change to a column and then writes to the same
  // column is the shortest possible loop, and the one people build by accident
  // on their first try. The depth guard would stop it three events in; refusing
  // it here means it never runs at all.
  if (trigger.kind === "column_changed" || trigger.kind === "column_set_to") {
    const writesBack = actions.some(
      (action) =>
        (action.kind === "set_value" || action.kind === "clear_value" || action.kind === "shift_date" || action.kind === "set_date_relative") &&
        action.columnId === trigger.columnId,
    );
    if (writesBack) {
      const name = column(trigger.columnId)?.name ?? "that column";
      throw new AutomationError(`This would set ${name} whenever ${name} changes, which would set it off again. Pick a different column to write to.`);
    }
  }
}

function assertHour(hour: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new AutomationError("Pick an hour between 0 and 23.");
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hourWord(hour: number): string {
  if (hour === 0) return "midnight";
  if (hour === 12) return "midday";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function describeTrigger(trigger: AutomationTrigger, vocabulary: RuleVocabulary): string {
  const columnName = (id: EntityId) => vocabulary.columns.find((c) => c.id === id)?.name ?? "a column";
  const groupName = (id: EntityId) => vocabulary.groups.find((g) => g.id === id)?.name ?? "a group";
  switch (trigger.kind) {
    case "item_created":
      return trigger.groupId ? `a task is added to ${groupName(trigger.groupId)}` : "a task is added";
    case "column_changed":
      return `${columnName(trigger.columnId)} changes`;
    case "column_set_to": {
      const column = vocabulary.columns.find((c) => c.id === trigger.columnId);
      const label = column && trigger.labelId ? columnLabels(column).find((l) => l.id === trigger.labelId)?.name : null;
      const word = label ?? (trigger.checked != null ? (trigger.checked ? "ticked" : "unticked") : trigger.text) ?? "something";
      return `${columnName(trigger.columnId)} becomes ${word}`;
    }
    case "person_assigned":
      return trigger.userId
        ? `${vocabulary.users.find((u) => u.id === trigger.userId)?.displayName ?? "someone"} is added to ${columnName(trigger.columnId)}`
        : `somebody is added to ${columnName(trigger.columnId)}`;
    case "item_moved_to_group":
      return `a task moves to ${groupName(trigger.groupId)}`;
    case "comment_added":
      return "an update is posted";
    case "item_archived":
      return "a task is archived";
    case "date_arrives": {
      const name = columnName(trigger.columnId);
      if (trigger.offsetDays === 0) return `${name} arrives`;
      const days = Math.abs(trigger.offsetDays);
      const unit = days === 1 ? "day" : "days";
      return trigger.offsetDays < 0 ? `it is ${days} ${unit} before ${name}` : `it is ${days} ${unit} after ${name}`;
    }
    case "recurring":
      switch (trigger.recurrence) {
        case "daily":
          return `every day at ${hourWord(trigger.atHour)}`;
        case "weekdays":
          return `every weekday at ${hourWord(trigger.atHour)}`;
        case "weekly":
          return `every ${WEEKDAY_NAMES[trigger.weekday ?? 1]} at ${hourWord(trigger.atHour)}`;
        case "monthly":
          return `on day ${trigger.dayOfMonth ?? 1} of the month at ${hourWord(trigger.atHour)}`;
      }
      return "on a schedule";
  }
}

export function describeAction(action: AutomationAction, vocabulary: RuleVocabulary): string {
  const columnName = (id: EntityId) => vocabulary.columns.find((c) => c.id === id)?.name ?? "a column";
  const userName = (id: EntityId) => vocabulary.users.find((u) => u.id === id)?.displayName ?? "someone";
  switch (action.kind) {
    case "set_value": {
      const column = vocabulary.columns.find((c) => c.id === action.columnId);
      return `set ${columnName(action.columnId)} to ${labelOrPlain(column, action.value)}`;
    }
    case "clear_value":
      return `clear ${columnName(action.columnId)}`;
    case "move_to_group":
      return `move it to ${vocabulary.groups.find((g) => g.id === action.groupId)?.name ?? "a group"}`;
    case "assign_person": {
      const names = [...action.userIds.map(userName), ...(action.useActor ? ["whoever made the change"] : [])];
      return `add ${names.join(" and ") || "nobody"} to ${columnName(action.columnId)}`;
    }
    case "unassign_person":
      return action.all ? `clear ${columnName(action.columnId)}` : `remove ${action.userIds.map(userName).join(" and ")} from ${columnName(action.columnId)}`;
    case "shift_date":
      return `move ${columnName(action.columnId)} by ${action.days} ${Math.abs(action.days) === 1 ? "day" : "days"}`;
    case "set_date_relative":
      return action.days === 0 ? `set ${columnName(action.columnId)} to today` : `set ${columnName(action.columnId)} to ${action.days} days from today`;
    case "notify":
      switch (action.audience) {
        case "people_on_item":
          return "tell everybody on the task";
        case "actor":
          return "tell whoever made the change";
        case "board_owners":
          return "tell the board's owners";
        default:
          return `tell ${(action.userIds ?? []).map(userName).join(" and ") || "nobody"}`;
      }
    case "add_comment":
      return "post an update";
    case "create_item":
      return `create a task called "${action.name}"`;
    case "create_subitem":
      return `add a subitem called "${action.name}"`;
    case "archive_item":
      return "archive it";
  }
}

/**
 * A value in words: the label's name where it has one, the thing itself where
 * it does not.
 *
 * Labels are looked up rather than stored in the rule, so renaming "Done" to
 * "Shipped" re-words every automation that mentions it instead of leaving a
 * board describing itself in language it no longer uses.
 */
function labelOrPlain(column: BoardColumn | undefined, value: ColumnValue): string {
  if (column && (value.type === "STATUS" || value.type === "DROPDOWN" || value.type === "PRIORITY")) {
    return columnLabels(column).find((l) => l.id === value.labelId)?.name ?? "a label";
  }
  switch (value.type) {
    case "CHECKBOX":
      return value.checked ? "ticked" : "unticked";
    case "DATE":
      return value.date ?? "";
    case "TIMELINE":
      return [value.start, value.end].filter(Boolean).join(" to ");
    case "NUMBER":
      return value.number === null ? "" : String(value.number);
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
      return value.text ?? "";
    case "SIZE":
      return value.size ?? "";
    case "STAKEHOLDER":
      return value.group ?? "";
    case "TAGS":
      return value.tags.join(", ");
    case "LINK":
      return value.url ?? "";
    case "PERSON":
    case "PEOPLE":
      return `${value.userIds.length} ${value.userIds.length === 1 ? "person" : "people"}`;
    default:
      return "a value";
  }
}

export function describeCondition(condition: AutomationCondition, vocabulary: RuleVocabulary): string {
  switch (condition.kind) {
    case "column": {
      const column = vocabulary.columns.find((c) => c.id === condition.columnId);
      const name = column?.name ?? "a column";
      const words: Record<string, string> = {
        is: "is",
        is_not: "is not",
        is_empty: "is empty",
        is_not_empty: "is not empty",
        contains: "contains",
        not_contains: "does not contain",
        greater_than: "is more than",
        less_than: "is less than",
        before: "is before",
        after: "is after",
        is_overdue: "is overdue",
      };
      const op = words[condition.op] ?? condition.op;
      if (condition.op === "is_empty" || condition.op === "is_not_empty" || condition.op === "is_overdue") return `${name} ${op}`;
      return `${name} ${op} ${condition.value ? labelOrPlain(column, condition.value) : ""}`.trim();
    }
    case "group":
      return `it ${condition.op === "is" ? "is" : "is not"} in ${vocabulary.groups.find((g) => g.id === condition.groupId)?.name ?? "a group"}`;
    case "actor":
      return `${condition.op === "is" ? "" : "anybody but "}${vocabulary.users.find((u) => u.id === condition.userId)?.displayName ?? "someone"} made the change`;
    case "item_kind":
      return condition.is === "subitem" ? "it is a subitem" : "it is a top-level task";
  }
}

/** "When Status becomes Done, only if Priority is High, set Due date to today and tell everybody on the task." */
export function describeRule(
  trigger: AutomationTrigger,
  conditions: AutomationCondition[],
  actions: AutomationAction[],
  match: "all" | "any",
  vocabulary: RuleVocabulary,
): string {
  const when = TRIGGER_TIMING[trigger.kind] === "schedule" && trigger.kind === "recurring" ? describeTrigger(trigger, vocabulary) : `when ${describeTrigger(trigger, vocabulary)}`;
  const only =
    conditions.length === 0
      ? ""
      : `, only if ${conditions.map((c) => describeCondition(c, vocabulary)).join(match === "all" ? " and " : " or ")}`;
  const then = actions.map((a) => describeAction(a, vocabulary)).join(", and ");
  const sentence = `${when}${only}, ${then}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
