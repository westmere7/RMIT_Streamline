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
  ColumnType,
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
  keywordsOf,
  webhookUrlProblem,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import type { AutomationEngine, DrainReport } from "./automation-engine";

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
/**
 * How a quick run reaches the server when the browser cannot carry it out
 * itself. Under Supabase the actions run with the service key, on the same code
 * path a scheduled firing takes; the local provider has no server and runs the
 * engine directly, so it passes nothing here.
 */
export interface AutomationRunTransport {
  runNow(input: { ruleId: EntityId; itemIds: EntityId[] }): Promise<DrainReport>;
  /** Asks the server to look at the queue now, as the signed-in person. Failure is the caller's to ignore. */
  nudge(): Promise<void>;
}

export class AutomationService {
  constructor(
    private readonly repos: Repositories,
    private readonly engine: AutomationEngine,
    private readonly transport: AutomationRunTransport | null,
  ) {}

  /**
   * Fires a quick run against chosen tasks, now.
   *
   * `actorId` is honoured only on the local path. Over the transport the server
   * takes the actor from the session it was handed, because a browser saying
   * "I am Danh" is not evidence of anything.
   */
  runNow(ruleId: EntityId, itemIds: EntityId[], actorId: EntityId): Promise<DrainReport> {
    if (this.transport) return this.transport.runNow({ ruleId, itemIds });
    return this.engine.runNow(ruleId, itemIds, actorId);
  }

  /**
   * Asks the runner to drain the queue now rather than at its next tick.
   *
   * Purely so somebody watching a board sees their rule fire in a second
   * rather than a minute. The write has already raised whatever it was going
   * to raise, from a database trigger, and the scheduler will get to it
   * whether or not this call is made or succeeds — so a failure here is
   * swallowed: a toast saying "could not run automations" after an edit that
   * saved perfectly well would be a lie about what went wrong.
   *
   * Nothing to do without a transport: the local provider has no server, and
   * no runner, to nudge.
   */
  async nudge(): Promise<void> {
    if (!this.transport) return;
    await this.transport.nudge().catch(() => undefined);
  }

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
    validate({ trigger: input.trigger, conditions: input.conditions, actions: input.actions }, vocabulary, input.boardId);
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
    if (patch.trigger || patch.conditions || patch.actions) validate(merged, vocabulary, existing.boardId);
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
  /** The board the rule lives on, for the checks that ask "the same board?". */
  boardId: EntityId,
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
    case "column_cleared":
      if (!column(trigger.columnId)) throw new AutomationError("Pick a column for the trigger.");
      break;
    case "number_crosses": {
      const found = column(trigger.columnId);
      if (!found) throw new AutomationError("Pick a number column for the trigger.");
      if (found.type !== "NUMBER") throw new AutomationError(`${found.name} does not hold a number.`);
      if (!Number.isFinite(Number(trigger.threshold))) throw new AutomationError("Say what number it has to cross.");
      break;
    }
    case "person_assigned":
    case "person_unassigned": {
      const found = column(trigger.columnId);
      if (!found) throw new AutomationError("Pick a column for the trigger.");
      if (found.type !== "PERSON" && found.type !== "PEOPLE") throw new AutomationError(`${found.name} does not hold people.`);
      break;
    }
    case "item_moved_to_group":
    case "item_moved_from_group":
      if (!group(trigger.groupId)) throw new AutomationError("Pick a group for the trigger.");
      break;
    case "name_contains":
    case "comment_contains":
      if (keywordsOf(trigger.text).length === 0) throw new AutomationError("Say which word or phrase to listen for.");
      break;
    case "column_contains": {
      const found = column(trigger.columnId);
      if (!found) throw new AutomationError("Pick a column for the trigger.");
      if (!TEXTUAL_COLUMNS.includes(found.type)) throw new AutomationError(`${found.name} does not hold words to search.`);
      if (keywordsOf(trigger.text).length === 0) throw new AutomationError("Say which word or phrase to listen for.");
      break;
    }
    case "column_unchanged_for": {
      if (!column(trigger.columnId)) throw new AutomationError("Pick a column for the trigger.");
      const days = Number(trigger.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new AutomationError("Pick how many days it has to sit still, from 1 to 365.");
      assertHour(trigger.atHour);
      break;
    }
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
      throw new AutomationError("A rule that runs on a schedule has no task in hand, so it can only create tasks, tell people things and call a webhook.");
    }
    switch (action.kind) {
      case "set_value":
      case "clear_value":
      case "shift_date":
      case "set_date_relative":
      case "assign_person":
      case "unassign_person":
      case "adjust_number":
      case "add_tags":
      case "remove_tags":
      case "set_parent_value":
      case "set_subitems_value": {
        const found = column(action.columnId);
        if (!found) throw new AutomationError("Pick a column for every action.");
        if ((action.kind === "shift_date" || action.kind === "set_date_relative") && found.type !== "DATE" && found.type !== "TIMELINE") {
          throw new AutomationError(`${found.name} does not hold a date.`);
        }
        if ((action.kind === "assign_person" || action.kind === "unassign_person") && found.type !== "PERSON" && found.type !== "PEOPLE") {
          throw new AutomationError(`${found.name} does not hold people.`);
        }
        if (action.kind === "adjust_number") {
          if (found.type !== "NUMBER") throw new AutomationError(`${found.name} does not hold a number.`);
          const delta = Number(action.delta);
          if (!Number.isFinite(delta) || delta === 0) throw new AutomationError("Say how much to change it by.");
        }
        if (action.kind === "add_tags" || action.kind === "remove_tags") {
          if (found.type !== "TAGS") throw new AutomationError(`${found.name} does not hold tags.`);
          if (action.tags.map((tag) => tag.trim()).filter(Boolean).length === 0) throw new AutomationError("Say which tags.");
        }
        break;
      }
      case "copy_value": {
        const from = column(action.fromColumnId);
        const to = column(action.toColumnId);
        if (!from || !to) throw new AutomationError("Pick both columns to copy between.");
        if (from.id === to.id) throw new AutomationError("Pick two different columns to copy between.");
        if (from.type !== to.type) throw new AutomationError(`${from.name} and ${to.name} hold different kinds of value.`);
        break;
      }
      case "move_to_group":
        if (!group(action.groupId)) throw new AutomationError("Pick a group to move the task to.");
        break;
      case "notify":
        if (!action.message.trim()) throw new AutomationError("Say what the notification should read.");
        if (action.audience === "specific" && (action.userIds ?? []).length === 0) throw new AutomationError("Pick who to tell.");
        if (action.audience === "column") {
          const found = action.columnId ? column(action.columnId) : undefined;
          if (!found) throw new AutomationError("Pick which people column to tell.");
          if (found.type !== "PERSON" && found.type !== "PEOPLE") throw new AutomationError(`${found.name} does not hold people.`);
        }
        break;
      case "add_comment":
        if (!action.body.trim()) throw new AutomationError("Say what the update should read.");
        break;
      case "set_name":
        if (!action.name.trim()) throw new AutomationError("Say what the task should be called.");
        break;
      case "create_item":
      case "create_subitem":
        if (!action.name.trim()) throw new AutomationError("Give the new task a name.");
        break;
      case "send_webhook": {
        const problem = webhookUrlProblem(action.url);
        if (problem) throw new AutomationError(problem);
        break;
      }
    }
  }

  for (const condition of conditions) {
    if (condition.kind === "column" && !column(condition.columnId)) throw new AutomationError("Pick a column for every condition.");
    if (condition.kind === "group" && !group(condition.groupId)) throw new AutomationError("Pick a group for every condition.");
  }

  // A rule woken by a task arriving that then adds a task to the same board
  // wakes itself with everything it adds. The depth guard would stop it three
  // tasks in; refusing it here means the three are never made.
  if (trigger.kind === "item_created" || trigger.kind === "subitem_created" || trigger.kind === "name_contains") {
    const addsHere = actions.some(
      (action) =>
        action.kind === "create_subitem" ||
        action.kind === "duplicate_item" ||
        (action.kind === "create_item" && (!action.boardId || action.boardId === boardId)),
    );
    if (addsHere) {
      throw new AutomationError("A rule that fires when a task is added cannot add tasks to the same board: each one it added would set it off again. Create the task on another board instead.");
    }
  }

  // A rule that fires on every change to a column and then writes to the same
  // column is the shortest possible loop, and the one people build by accident
  // on their first try. The depth guard would stop it three events in; refusing
  // it here means it never runs at all.
  if (trigger.kind === "column_changed" || trigger.kind === "column_set_to" || trigger.kind === "column_cleared" || trigger.kind === "number_crosses") {
    const writesBack = actions.some((action) => {
      switch (action.kind) {
        case "set_value":
        case "clear_value":
        case "shift_date":
        case "set_date_relative":
        case "adjust_number":
        case "add_tags":
        case "remove_tags":
          return action.columnId === trigger.columnId;
        case "copy_value":
          return action.toColumnId === trigger.columnId;
        default:
          return false;
      }
    });
    if (writesBack) {
      const name = column(trigger.columnId)?.name ?? "that column";
      throw new AutomationError(`This would set ${name} whenever ${name} changes, which would set it off again. Pick a different column to write to.`);
    }
  }
}

/** The column types a keyword can be found in. Exported for the builder's picker. */
export const TEXTUAL_COLUMNS: readonly ColumnType[] = ["TEXT", "LONG_TEXT", "RICH_TEXT", "LINK", "TAGS"];

function assertHour(hour: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new AutomationError("Pick an hour between 0 and 23.");
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** “abc”, or “abc” or “def” — the phrases a keyword trigger listens for, quoted. */
function quoteKeywords(text: string): string {
  const words = keywordsOf(text).map((word) => `“${word}”`);
  if (words.length === 0) return "something";
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

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
    case "subitem_created":
      return "a subitem is added";
    case "item_renamed":
      return "a task is renamed";
    case "column_changed":
      return `${columnName(trigger.columnId)} changes`;
    case "column_cleared":
      return `${columnName(trigger.columnId)} is cleared`;
    case "number_crosses":
      return `${columnName(trigger.columnId)} goes ${trigger.direction} ${trigger.threshold}`;
    case "person_unassigned":
      return trigger.userId
        ? `${vocabulary.users.find((u) => u.id === trigger.userId)?.displayName ?? "someone"} is removed from ${columnName(trigger.columnId)}`
        : `somebody is removed from ${columnName(trigger.columnId)}`;
    case "item_moved_from_group":
      return `a task leaves ${groupName(trigger.groupId)}`;
    case "item_restored":
      return "a task is restored";
    case "column_unchanged_for":
      return `${columnName(trigger.columnId)} has not changed for ${trigger.days} ${trigger.days === 1 ? "day" : "days"}`;
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
    case "name_contains":
      return `the name contains ${quoteKeywords(trigger.text)}`;
    case "comment_contains":
      return `an update mentions ${quoteKeywords(trigger.text)}`;
    case "column_contains":
      return `${columnName(trigger.columnId)} contains ${quoteKeywords(trigger.text)}`;
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
    case "manual":
      return "run by hand";
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
      const names = [...action.userIds.map(userName), ...(action.useActor ? ["whoever made the change"] : []), ...(action.useCreator ? ["whoever added the task"] : [])];
      return `add ${names.join(" and ") || "nobody"} to ${columnName(action.columnId)}`;
    }
    case "copy_value":
      return `copy ${columnName(action.fromColumnId)} to ${columnName(action.toColumnId)}`;
    case "adjust_number":
      return action.delta >= 0 ? `add ${action.delta} to ${columnName(action.columnId)}` : `take ${-action.delta} off ${columnName(action.columnId)}`;
    case "add_tags":
      return `tag it ${action.tags.filter(Boolean).join(", ")}`;
    case "remove_tags":
      return `untag ${action.tags.filter(Boolean).join(", ")}`;
    case "set_name":
      return `rename it "${action.name}"`;
    case "set_description":
      return action.text.trim() ? "set its description" : "clear its description";
    case "set_parent_value": {
      const column = vocabulary.columns.find((c) => c.id === action.columnId);
      return `set ${columnName(action.columnId)} on the parent to ${labelOrPlain(column, action.value)}`;
    }
    case "set_subitems_value": {
      const column = vocabulary.columns.find((c) => c.id === action.columnId);
      return `set ${columnName(action.columnId)} on every subitem to ${labelOrPlain(column, action.value)}`;
    }
    case "duplicate_item":
      return "duplicate it";
    case "restore_item":
      return "restore it";
    case "send_webhook": {
      try {
        return `call ${new URL(action.url).host}`;
      } catch {
        return "call a webhook";
      }
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
        case "creator":
          return "tell whoever added the task";
        case "board_owners":
          return "tell the board's owners";
        case "board_members":
          return "tell everybody on the board";
        case "column":
          return `tell everybody in ${action.columnId ? columnName(action.columnId) : "a column"}`;
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
  const then = actions.map((a) => describeAction(a, vocabulary)).join(", and ");
  // A quick run is not "when" anything. It is the list of what it does, which
  // is also all a person wants to read off a button they are about to press.
  if (trigger.kind === "manual") return then.charAt(0).toUpperCase() + then.slice(1);
  const when = TRIGGER_TIMING[trigger.kind] === "schedule" && trigger.kind === "recurring" ? describeTrigger(trigger, vocabulary) : `when ${describeTrigger(trigger, vocabulary)}`;
  const only =
    conditions.length === 0
      ? ""
      : `, only if ${conditions.map((c) => describeCondition(c, vocabulary)).join(match === "all" ? " and " : " or ")}`;
  const sentence = `${when}${only}, ${then}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
