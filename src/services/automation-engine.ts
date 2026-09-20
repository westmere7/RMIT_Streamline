import type {
  AutomationAction,
  AutomationCondition,
  AutomationEvent,
  AutomationRule,
  AutomationRunInput,
  Board,
  BoardColumn,
  BoardGroup,
  ColumnValue,
  ConditionOp,
  EntityId,
  Item,
  ItemColumnValue,
  NotificationInput,
  User,
} from "@/domain";
import { MAX_EVENT_DEPTH, TRIGGER_TIMING, WEBHOOK_TIMEOUT_MS, actionNeedsItem, emptyValueFor, isEmptyValue, keywordsOf, mentionsAny, webhookUrlProblem } from "@/domain";
import type { Repositories } from "@/data/repositories";
import type { CommentService } from "./comment-service";
import type { ItemService } from "./item-service";
import type { NotificationService } from "./notification-service";
import { displayValue } from "./column-display";

/**
 * The runner: what a rule means, and how it is carried out.
 *
 * It only ever runs on a server. The queue it drains is filled by database
 * triggers (supabase/migrations/0052_automations.sql), so a rule fires for
 * every write to a board whoever made it — and, because the drain is a cron
 * job rather than a page, it fires with nobody signed in.
 *
 * Everything an action does goes through the ordinary services. Setting a value
 * is `ItemService.setValue`, so it propagates along task links, writes the
 * activity row and raises the notifications that a person doing it by hand
 * would have raised. An automation is a colleague who happens to be a cron job,
 * not a second way of writing to the database.
 */

/** The timezone a schedule is read in. Vercel runs in UTC; "9am" does not mean 9am there. */
const DEFAULT_TIMEZONE = "Australia/Melbourne";

/**
 * How many lanes of the queue are worked at once.
 *
 * Each lane is one task's events in order; the lanes are independent. Eight is
 * enough that a burst of edits across a board finishes in the time one of them
 * used to take, and few enough that the runner's connection pool and the
 * database it shares with everybody else do not notice.
 */
const DRAIN_CONCURRENCY = 8;

/**
 * The queue split into lanes that must stay in order.
 *
 * Everything that happened to one task is one lane, oldest first, as the
 * queue handed it over. An event with no task — a board-level one — gets a
 * lane per board. Exported for the tests: the promise this makes is about
 * ordering, and ordering is what a test can check.
 */
export function lanesOf(events: readonly AutomationEvent[]): AutomationEvent[][] {
  const lanes = new Map<string, AutomationEvent[]>();
  for (const event of events) {
    const key = event.itemId ? `item:${event.itemId}` : `board:${event.boardId}`;
    const lane = lanes.get(key);
    if (lane) lane.push(event);
    else lanes.set(key, [event]);
  }
  return [...lanes.values()];
}

/** Runs `work` over `inputs`, at most `width` at a time, and waits for all of it. */
async function inParallel<T>(inputs: readonly T[], work: (input: T) => Promise<void>, width: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const index = next;
      next += 1;
      await work(inputs[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, inputs.length) }, worker));
}

export interface AutomationEngineOptions {
  /** IANA zone for every "at 9am" and every "today" a rule talks about. */
  timezone?: string;
  /** Overridable so tests can hold time still. */
  now?: () => Date;
}

/** What one drain did, for the route to report and the tests to assert on. */
export interface DrainReport {
  events: number;
  scheduled: number;
  ran: number;
  skipped: number;
  failed: number;
}

/** Everything a rule can look at while it is being evaluated against one task. */
interface FiringContext {
  board: Board;
  columns: BoardColumn[];
  groups: BoardGroup[];
  users: readonly User[];
  item: Item | null;
  values: Map<EntityId, ColumnValue>;
  actorId: EntityId | null;
  event: AutomationEvent | null;
  depth: number;
  /** Board OWNERs, for the notify action's `board_owners` audience. */
  boardOwnerIds: EntityId[];
  /** Everyone on the board, for `board_members`. */
  boardMemberIds: EntityId[];
}

export class AutomationEngine {
  private readonly timezone: string;
  private readonly now: () => Date;

  constructor(
    private readonly repos: Repositories,
    private readonly items: ItemService,
    private readonly comments: CommentService,
    private readonly notifications: NotificationService,
    options: AutomationEngineOptions = {},
  ) {
    this.timezone = options.timezone ?? DEFAULT_TIMEZONE;
    this.now = options.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Draining
  // -------------------------------------------------------------------------

  /**
   * One pass: everything waiting in the queue, then everything the clock is
   * due to do.
   *
   * The scheduled half can be left out, and there is exactly one caller that
   * should: a nudge from a browser, which wants the change somebody just made
   * acted on and has no business with the clock. The heartbeat goes with the
   * schedules rather than with the queue, because it answers "is the scheduler
   * alive?" — and a nudge stamping it would make a dead cron look healthy for
   * as long as somebody was busy on a board.
   */
  async drain(limit: number, options: { schedules?: boolean } = {}): Promise<DrainReport> {
    const report: DrainReport = { events: 0, scheduled: 0, ran: 0, skipped: 0, failed: 0 };
    await this.drainEvents(limit, report);
    if (options.schedules === false) return report;
    await this.runSchedules(report);
    // Stamped whether or not there was anything to do. A pass that found
    // nothing is exactly the pass worth recording: without it, "the scheduler
    // has been dead since Tuesday" and "no rule matched this week" leave the
    // same evidence, which is none.
    await this.repos.automations.recordHeartbeat(report);
    return report;
  }

  /**
   * The queue, a batch at a time.
   *
   * Events are worked in lanes — one per task, or per board for an event with
   * no task — and the lanes run side by side. Two edits to the same task have
   * to be seen in the order they were made, because a rule that reads the
   * status after another rule set it must see the new one; two edits to
   * different tasks owe each other nothing, and waiting on one round trip to
   * Singapore before starting the next was most of what made a drain slow.
   * Rules are read once per board however many lanes want them.
   */
  private async drainEvents(limit: number, report: DrainReport): Promise<void> {
    const events = await this.repos.automations.claimEvents(limit);
    report.events = events.length;
    const rulesByBoard = new Map<EntityId, Promise<AutomationRule[]>>();
    const rulesFor = (boardId: EntityId): Promise<AutomationRule[]> => {
      let rules = rulesByBoard.get(boardId);
      if (!rules) {
        rules = this.repos.automations.listRulesByBoard(boardId).then((all) => all.filter((r) => r.enabled && TRIGGER_TIMING[r.trigger.kind] === "event"));
        rulesByBoard.set(boardId, rules);
      }
      return rules;
    };

    const lane = async (queue: AutomationEvent[]) => {
      for (const event of queue) {
        try {
          const rules = await rulesFor(event.boardId);
          const matching = rules.filter((rule) => this.triggerMatches(rule, event));
          if (matching.length > 0) await this.fireAll(matching, event, report);
          await this.repos.automations.finishEvent(event.id, { attempts: event.attempts + 1 });
        } catch (error) {
          report.failed += 1;
          await this.repos.automations.finishEvent(event.id, { error: messageOf(error), attempts: event.attempts + 1 });
        }
      }
    };
    await inParallel(lanesOf(events), lane, DRAIN_CONCURRENCY);
  }

  /**
   * Whether an event is the thing a rule is waiting for.
   *
   * Cheap and total: no reads, no conditions, just the shape of what happened
   * against the shape of what was asked for. Conditions come after, because
   * they cost a board snapshot and most events match no rule at all.
   */
  private triggerMatches(rule: AutomationRule, event: AutomationEvent): boolean {
    const trigger = rule.trigger;
    switch (trigger.kind) {
      case "item_created":
        return event.kind === "item_created" && (!trigger.groupId || event.payload.toGroupId === trigger.groupId);
      case "subitem_created":
        return event.kind === "item_created" && !!event.payload.parentItemId;
      case "item_renamed":
        return event.kind === "item_renamed";
      // A subitem never moves on its own: it follows its parent, and the
      // parent's move is the one that happened. Firing once per subitem as
      // well would tell somebody five times about one drag.
      case "item_moved_to_group":
        return event.kind === "item_moved" && !event.payload.parentItemId && event.payload.toGroupId === trigger.groupId;
      case "item_moved_from_group":
        return event.kind === "item_moved" && !event.payload.parentItemId && event.payload.fromGroupId === trigger.groupId;
      case "item_archived":
        return event.kind === "item_archived";
      case "item_restored":
        return event.kind === "item_restored";
      case "comment_added":
        return event.kind === "comment_added";
      case "name_contains":
        return (event.kind === "item_created" || event.kind === "item_renamed") && mentionsAny(event.payload.toName, keywordsOf(trigger.text));
      case "comment_contains":
        return event.kind === "comment_added" && mentionsAny(event.payload.body, keywordsOf(trigger.text));
      case "column_contains":
        return event.kind === "value_changed" && event.columnId === trigger.columnId && mentionsAny(textIn(event.payload.after ?? null), keywordsOf(trigger.text));
      case "column_changed":
        return event.kind === "value_changed" && event.columnId === trigger.columnId;
      case "column_cleared": {
        if (event.kind !== "value_changed" || event.columnId !== trigger.columnId) return false;
        const before = event.payload.before ?? null;
        const after = event.payload.after ?? null;
        return !!before && !isEmptyValue(before) && (!after || isEmptyValue(after));
      }
      case "number_crosses": {
        if (event.kind !== "value_changed" || event.columnId !== trigger.columnId) return false;
        const line = numberOf(trigger.threshold, Number.NaN);
        const after = numberIn(event.payload.after ?? null);
        if (!Number.isFinite(line) || after === null) return false;
        const before = numberIn(event.payload.before ?? null);
        // Only the crossing itself: a number already past the line that moves
        // further past it is not news, and a rule that fired on every edit
        // beyond a threshold would be "a column changes" with extra steps.
        if (trigger.direction === "above") return after > line && (before === null || before <= line);
        return after < line && (before === null || before >= line);
      }
      case "person_unassigned": {
        if (event.kind !== "value_changed" || event.columnId !== trigger.columnId) return false;
        const before = peopleIn(event.payload.before ?? null);
        const after = peopleIn(event.payload.after ?? null);
        const removed = before.filter((id) => !after.includes(id));
        if (removed.length === 0) return false;
        return !trigger.userId || removed.includes(trigger.userId);
      }
      case "column_set_to": {
        if (event.kind !== "value_changed" || event.columnId !== trigger.columnId) return false;
        const after = event.payload.after ?? null;
        if (!after) return false;
        if (trigger.labelId != null) return "labelId" in after && after.labelId === trigger.labelId;
        if (trigger.checked != null) return after.type === "CHECKBOX" && after.checked === trigger.checked;
        if (trigger.text != null) {
          const text = after.type === "SIZE" ? after.size : after.type === "STAKEHOLDER" ? after.group : null;
          return text === trigger.text;
        }
        return false;
      }
      case "person_assigned": {
        if (event.kind !== "value_changed" || event.columnId !== trigger.columnId) return false;
        const before = peopleIn(event.payload.before ?? null);
        const after = peopleIn(event.payload.after ?? null);
        const added = after.filter((id) => !before.includes(id));
        if (added.length === 0) return false;
        return !trigger.userId || added.includes(trigger.userId);
      }
      default:
        return false;
    }
  }

  private async fireAll(rules: AutomationRule[], event: AutomationEvent, report: DrainReport): Promise<void> {
    const context = await this.buildContext(event.boardId, event.itemId, event.actorId, event, event.depth);
    if (!context) return;
    for (const rule of rules) await this.fire(rule, context, report);
  }

  // -------------------------------------------------------------------------
  // Schedules
  // -------------------------------------------------------------------------

  /**
   * The half of the feature that has nothing to do with anybody being there.
   *
   * A deadline rule looks down its board's date column for tasks whose date,
   * shifted by the rule's offset, is today. A recurring rule asks only whether
   * this is its day and its hour. Both then claim a receipt keyed to the
   * occasion, so a tick that runs twice — two cron drivers, a retry, a deploy
   * mid-run — fires once.
   */
  private async runSchedules(report: DrainReport): Promise<void> {
    const rules = await this.repos.automations.listScheduledRules();
    if (rules.length === 0) return;
    const clock = this.clock();

    for (const rule of rules) {
      try {
        if (rule.trigger.kind === "recurring") {
          if (!dueNow(rule.trigger, clock)) continue;
          // The hour is part of the key as well as the day: a rule set to nine
          // and moved to two should still fire twice on the day it moved.
          if (!(await this.repos.automations.claimScheduleFire(rule.id, null, `${clock.date}T${pad(numberOf(rule.trigger.atHour, 9))}`))) continue;
          report.scheduled += 1;
          const context = await this.buildContext(rule.boardId, null, null, null, 0);
          if (context) await this.fire(rule, context, report);
          continue;
        }

        if (rule.trigger.kind === "column_unchanged_for") {
          const trigger = rule.trigger;
          if (clock.hour !== numberOf(trigger.atHour, -1)) continue;
          const still = await this.itemsUnchangedFor(rule.boardId, trigger.columnId, numberOf(trigger.days, 7));
          for (const { item, since } of still) {
            // Keyed to when the value last moved, not to the day: one firing
            // per stretch of stillness. Touch the task and let it go quiet
            // again, and it is flagged again.
            if (!(await this.repos.automations.claimScheduleFire(rule.id, item.id, `still:${since}`))) continue;
            report.scheduled += 1;
            const context = await this.buildContext(rule.boardId, item.id, null, null, 0);
            if (context) await this.fire(rule, context, report);
          }
          continue;
        }

        if (rule.trigger.kind !== "date_arrives") continue;
        const trigger = rule.trigger;
        if (clock.hour !== numberOf(trigger.atHour, -1)) continue;

        // The date the column would have to hold for the rule to be due today:
        // "two days before" fires when the date is two days from now.
        const target = shiftDate(clock.date, -numberOf(trigger.offsetDays, 0));
        const due = await this.itemsWithDate(rule.boardId, trigger.columnId, target);
        for (const item of due) {
          if (!(await this.repos.automations.claimScheduleFire(rule.id, item.id, clock.date))) continue;
          report.scheduled += 1;
          const context = await this.buildContext(rule.boardId, item.id, null, null, 0);
          if (context) await this.fire(rule, context, report);
        }
      } catch (error) {
        report.failed += 1;
        await this.repos.automations.recordRuleOutcome(rule.id, { lastRunAt: null, ranCount: 0, lastError: messageOf(error) });
      }
    }
  }

  /** Live tasks on a board whose date column holds exactly this day. */
  private async itemsWithDate(boardId: EntityId, columnId: EntityId, date: string): Promise<Item[]> {
    const values = await this.repos.items.listValuesByColumns([columnId]);
    const wanted = new Set(
      values
        .filter((v) => {
          const value = v.value;
          if (value.type === "DATE") return value.date === date;
          if (value.type === "TIMELINE") return value.end === date;
          return false;
        })
        .map((v) => v.itemId),
    );
    if (wanted.size === 0) return [];
    const items = await this.repos.items.listByIds([...wanted]);
    return items.filter((item) => item.boardId === boardId && item.archivedAt === null);
  }

  /**
   * Live tasks on a board whose column has held the same non-empty value for
   * at least `days` days, with the moment it last moved.
   *
   * A cell that was never set has no row and so no age; "never filled in" is
   * `column_cleared`'s or a condition's business, not stillness.
   */
  private async itemsUnchangedFor(boardId: EntityId, columnId: EntityId, days: number): Promise<Array<{ item: Item; since: string }>> {
    const cutoff = this.now().getTime() - Math.max(1, days) * 86_400_000;
    const values = await this.repos.items.listValuesByColumns([columnId]);
    const stale = new Map<EntityId, string>();
    for (const v of values) {
      if (isEmptyValue(v.value)) continue;
      if (Date.parse(v.updatedAt) <= cutoff) stale.set(v.itemId, v.updatedAt);
    }
    if (stale.size === 0) return [];
    const items = await this.repos.items.listByIds([...stale.keys()]);
    return items.filter((item) => item.boardId === boardId && item.archivedAt === null).map((item) => ({ item, since: stale.get(item.id)! }));
  }

  // -------------------------------------------------------------------------
  // Firing one rule
  // -------------------------------------------------------------------------

  private async fire(rule: AutomationRule, context: FiringContext, report: DrainReport): Promise<void> {
    // The loop breaker. A rule whose action wakes a rule whose action wakes the
    // first would run until the database filled up; past this depth the chain
    // is cut and the log says so, which is the only way anybody would find out.
    if (context.depth >= MAX_EVENT_DEPTH) {
      report.skipped += 1;
      await this.repos.automations.recordRuns([
        {
          ruleId: rule.id,
          boardId: rule.boardId,
          itemId: context.item?.id ?? null,
          status: "skipped",
          summary: "Stopped: too many automations in a row",
          detail: `This change was already ${context.depth} automations deep. Two rules that answer each other will do this.`,
        },
      ]);
      return;
    }

    const failed = this.firstUnmetCondition(rule, context);
    if (failed) {
      report.skipped += 1;
      await this.repos.automations.recordRuns([
        { ruleId: rule.id, boardId: rule.boardId, itemId: context.item?.id ?? null, status: "skipped", summary: `Condition not met: ${failed}`, detail: null },
      ]);
      return;
    }

    await this.performActions(rule, context, report);
  }

  /**
   * A quick run: a saved group of actions, fired by hand against chosen tasks.
   *
   * No trigger is consulted, because there is none; no condition is checked,
   * because a person pointing at a task and pressing Run has already decided.
   * Everything else is the ordinary path — depth is marked so anything these
   * actions wake is a chain of one, the log gains a row per action, and the
   * rule's tally moves — so a quick run reads in the activity like any other
   * firing rather than as a hole in it.
   *
   * Only ever reached through the server route, which has checked the caller
   * may edit the board. `actorId` is that person, so the activity feed says who
   * pressed the button rather than crediting a cron job.
   */
  async runNow(ruleId: EntityId, itemIds: readonly EntityId[], actorId: EntityId): Promise<DrainReport> {
    const report: DrainReport = { events: 0, scheduled: 0, ran: 0, skipped: 0, failed: 0 };
    const rule = await this.repos.automations.getRule(ruleId);
    if (!rule) throw new Error("That quick run no longer exists.");
    if (rule.trigger.kind !== "manual") throw new Error("Only a quick run can be started by hand.");
    if (!rule.enabled) throw new Error("That quick run is switched off.");

    // A run with no tasks is allowed only when nothing in it needs one; the
    // actions themselves refuse otherwise, and the refusal lands in the log.
    const targets: Array<EntityId | null> = itemIds.length > 0 ? [...itemIds] : [null];
    for (const itemId of targets) {
      const context = await this.buildContext(rule.boardId, itemId, actorId, null, 0);
      if (!context) {
        report.skipped += 1;
        continue;
      }
      // A task from another board is refused rather than acted on: the rule's
      // actions name this board's columns and would write into the wrong one.
      if (context.item && context.item.boardId !== rule.boardId) {
        report.skipped += 1;
        await this.repos.automations.recordRuns([
          { ruleId: rule.id, boardId: rule.boardId, itemId: context.item.id, status: "skipped", summary: "Skipped: that task is on another board", detail: null },
        ]);
        continue;
      }
      await this.performActions(rule, context, report);
    }
    return report;
  }

  /**
   * Carries a rule's actions out against one task, and writes down what happened.
   *
   * The mark is what lets the database stamp a depth onto whatever these
   * actions raise. Set once around the whole rule rather than per action, so
   * three actions on one task are one chain rather than three.
   */
  private async performActions(rule: AutomationRule, context: FiringContext, report: DrainReport): Promise<void> {
    const runs: AutomationRunInput[] = [];
    if (context.item) await this.repos.automations.markDepth(context.item.id, context.depth);
    let ran = 0;
    let lastError: string | null = null;
    try {
      for (const action of rule.actions) {
        try {
          const summary = await this.execute(action, context);
          ran += 1;
          report.ran += 1;
          runs.push({ ruleId: rule.id, boardId: rule.boardId, itemId: context.item?.id ?? null, status: "ran", summary, detail: null });
        } catch (error) {
          lastError = messageOf(error);
          report.failed += 1;
          runs.push({
            ruleId: rule.id,
            boardId: rule.boardId,
            itemId: context.item?.id ?? null,
            status: "failed",
            summary: describeAction(action, context),
            detail: lastError,
          });
        }
      }
    } finally {
      if (context.item) await this.repos.automations.clearMark(context.item.id);
    }

    // The log and the tally are two tables with nothing between them.
    await Promise.all([
      this.repos.automations.recordRuns(runs),
      this.repos.automations.recordRuleOutcome(rule.id, { lastRunAt: this.now().toISOString(), ranCount: ran > 0 ? 1 : 0, lastError }),
    ]);
  }

  /** The first condition that does not hold, worded for the log. Null when the rule may run. */
  private firstUnmetCondition(rule: AutomationRule, context: FiringContext): string | null {
    if (rule.conditions.length === 0) return null;
    const results = rule.conditions.map((condition) => ({ condition, held: this.holds(condition, context) }));
    if (rule.conditionMatch === "any") {
      if (results.some((r) => r.held)) return null;
      return results.map((r) => describeCondition(r.condition, context)).join(", or ");
    }
    const first = results.find((r) => !r.held);
    return first ? describeCondition(first.condition, context) : null;
  }

  private holds(condition: AutomationCondition, context: FiringContext): boolean {
    switch (condition.kind) {
      case "group":
        if (!context.item) return false;
        return condition.op === "is" ? context.item.groupId === condition.groupId : context.item.groupId !== condition.groupId;
      case "actor":
        return condition.op === "is" ? context.actorId === condition.userId : context.actorId !== condition.userId;
      case "item_kind":
        if (!context.item) return false;
        return condition.is === "subitem" ? context.item.parentItemId !== null : context.item.parentItemId === null;
      case "column": {
        const column = context.columns.find((c) => c.id === condition.columnId);
        if (!column) return false;
        const actual = context.values.get(condition.columnId) ?? emptyValueFor(column.type);
        return compare(condition.op, actual, condition.value ?? null, context);
      }
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Carries one action out and returns the line the log should show for it. */
  private async execute(action: AutomationAction, context: FiringContext): Promise<string> {
    const { board, columns, users } = context;
    const item = context.item;
    // Every action but a few edits a task, and a recurring rule has none. The
    // builder refuses to save such a rule; this is the second line.
    if (!item && actionNeedsItem(action.kind)) {
      throw new Error("This action needs a task, and the trigger does not have one.");
    }

    switch (action.kind) {
      case "set_value":
      case "clear_value": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const value = action.kind === "set_value" ? action.value : emptyValueFor(column.type);
        await this.items.setValue(item!.id, column.id, value, { column, item: item!, board, users }, actorFor(context));
        return `Set ${column.name} to ${displayValue(column, value, users) || "nothing"}`;
      }

      case "move_to_group": {
        const group = context.groups.find((g) => g.id === action.groupId);
        if (!group) throw new Error("That group is no longer on this board.");
        // A subitem lives in its parent's group; moving it alone would tear it away.
        if (item!.parentItemId) return "Subitems stay with their parent";
        if (item!.groupId === group.id) return `Already in ${group.name}`;
        await this.items.moveItemsToGroup(board.id, [item!.id], group.id, actorFor(context));
        return `Moved to ${group.name}`;
      }

      case "assign_person":
      case "unassign_person": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const current = peopleIn(context.values.get(column.id) ?? null);
        const named =
          action.kind === "assign_person"
            ? [...action.userIds, ...(action.useActor && context.actorId ? [context.actorId] : []), ...(action.useCreator ? [item!.createdBy] : [])]
            : action.userIds;
        const next =
          action.kind === "assign_person"
            ? [...new Set([...current, ...named])]
            : action.all
              ? []
              : current.filter((id) => !named.includes(id));
        if (sameIds(current, next)) return `${column.name} unchanged`;
        const value: ColumnValue = column.type === "PEOPLE" ? { type: "PEOPLE", userIds: next } : { type: "PERSON", userIds: next };
        await this.items.setValue(item!.id, column.id, value, { column, item: item!, board, users }, actorFor(context));
        const names = named.map((id) => users.find((u) => u.id === id)?.displayName ?? "someone").join(", ");
        return action.kind === "assign_person" ? `Assigned ${names || "nobody"} to ${column.name}` : `Removed ${action.all ? "everybody" : names} from ${column.name}`;
      }

      case "shift_date":
      case "set_date_relative": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const current = context.values.get(column.id) ?? null;
        let next: string;
        if (action.kind === "set_date_relative") {
          next = shiftDate(this.clock().date, numberOf(action.days, 0));
        } else {
          const from = current?.type === "DATE" ? current.date : current?.type === "TIMELINE" ? current.end : null;
          // Nothing to move. Said rather than guessed: a rule that pushes a
          // deadline back a week should not invent one for a task that has none.
          if (!from) return `${column.name} is empty, so there was nothing to move`;
          next = shiftDate(from, numberOf(action.days, 0));
        }
        const value: ColumnValue =
          column.type === "TIMELINE"
            ? { type: "TIMELINE", start: current?.type === "TIMELINE" ? current.start : next, end: next }
            : { type: "DATE", date: next };
        await this.items.setValue(item!.id, column.id, value, { column, item: item!, board, users }, actorFor(context));
        return `Set ${column.name} to ${next}`;
      }

      case "archive_item": {
        if (item!.archivedAt) return "Already archived";
        // Subitems go with their parent: a task put away with live subitems
        // still under it leaves work nobody can see on a board nobody reads.
        const children = (await this.repos.items.listByBoard(board.id)).filter((i) => i.parentItemId === item!.id && i.archivedAt === null);
        await this.items.archiveItems(board.id, [item!.id, ...children.map((c) => c.id)], actorFor(context));
        return children.length > 0 ? `Archived the task and ${children.length} ${children.length === 1 ? "subitem" : "subitems"}` : "Archived the task";
      }

      case "restore_item": {
        if (!item!.archivedAt) return "Not archived";
        // Only the subitems that went into the archive with it come back with
        // it; one put away on its own, earlier, stays where somebody left it.
        const children = (await this.repos.items.listByBoard(board.id, { includeArchived: true })).filter((i) => i.parentItemId === item!.id && i.archivedAt === item!.archivedAt);
        await this.items.restoreItems([item!.id, ...children.map((c) => c.id)], actorFor(context));
        return children.length > 0 ? `Restored the task and ${children.length} ${children.length === 1 ? "subitem" : "subitems"}` : "Restored the task";
      }

      case "duplicate_item": {
        const copy = await this.items.duplicateItem(item!.id, actorFor(context));
        return `Duplicated as "${copy.name}"`;
      }

      case "set_name": {
        const name = this.render(action.name, context).trim();
        if (!name) throw new Error("The new name came out empty.");
        if (name === item!.name) return "Name unchanged";
        await this.items.renameItem(item!.id, name, actorFor(context));
        return `Renamed to "${name}"`;
      }

      case "set_description": {
        const text = this.render(action.text, context).trim();
        await this.items.updateDescription(item!.id, text || null, actorFor(context));
        return text ? "Set the description" : "Cleared the description";
      }

      case "copy_value": {
        const from = columns.find((c) => c.id === action.fromColumnId);
        const to = columns.find((c) => c.id === action.toColumnId);
        if (!from || !to) throw new Error("That column is no longer on this board.");
        if (from.type !== to.type) throw new Error(`${from.name} and ${to.name} hold different kinds of value.`);
        const value = context.values.get(from.id) ?? emptyValueFor(to.type);
        await this.items.setValue(item!.id, to.id, value, { column: to, item: item!, board, users }, actorFor(context));
        return `Copied ${from.name} to ${to.name}`;
      }

      case "adjust_number": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const current = context.values.get(column.id) ?? null;
        const base = current?.type === "NUMBER" && current.number !== null ? current.number : 0;
        const next = base + numberOf(action.delta, 0);
        await this.items.setValue(item!.id, column.id, { type: "NUMBER", number: next }, { column, item: item!, board, users }, actorFor(context));
        return `Set ${column.name} to ${next}`;
      }

      case "add_tags":
      case "remove_tags": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const current = context.values.get(column.id);
        const have = current?.type === "TAGS" ? current.tags : [];
        const wanted = action.tags.map((tag) => this.render(tag, context).trim()).filter(Boolean);
        const next = action.kind === "add_tags" ? [...new Set([...have, ...wanted])] : have.filter((tag) => !wanted.includes(tag));
        if (sameIds(have, next)) return `${column.name} unchanged`;
        await this.items.setValue(item!.id, column.id, { type: "TAGS", tags: next }, { column, item: item!, board, users }, actorFor(context));
        return action.kind === "add_tags" ? `Tagged ${wanted.join(", ")}` : `Untagged ${wanted.join(", ")}`;
      }

      case "set_parent_value": {
        if (!item!.parentItemId) return "No parent task";
        const parent = await this.repos.items.getById(item!.parentItemId);
        if (!parent) return "No parent task";
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        // The write lands on another task, so the depth mark has to go with
        // it: without one the parent's event would start a fresh chain at
        // zero, and a parent and its subitems answering each other would
        // never be cut.
        await this.writingTo([parent.id], context.depth, () => this.items.setValue(parent.id, column.id, action.value, { column, item: parent, board, users }, actorFor(context)));
        return `Set ${column.name} on "${parent.name}"`;
      }

      case "set_subitems_value": {
        const column = columns.find((c) => c.id === action.columnId);
        if (!column) throw new Error("That column is no longer on this board.");
        const children = (await this.repos.items.listByBoard(board.id)).filter((i) => i.parentItemId === item!.id && i.archivedAt === null);
        if (children.length === 0) return "No subitems";
        await this.writingTo(
          children.map((c) => c.id),
          context.depth,
          async () => {
            for (const child of children) {
              await this.items.setValue(child.id, column.id, action.value, { column, item: child, board, users }, actorFor(context));
            }
          },
        );
        return `Set ${column.name} on ${children.length} ${children.length === 1 ? "subitem" : "subitems"}`;
      }

      case "send_webhook": {
        await this.sendWebhook(action.url, context);
        return `Called ${new URL(action.url).host}`;
      }

      case "add_comment": {
        const body = this.render(action.body, context);
        await this.comments.addComment(item!.id, body, actorFor(context), users);
        return `Posted an update`;
      }

      case "notify": {
        const recipients = this.recipients(action, context);
        if (recipients.length === 0) return "Nobody to tell";
        const title = this.render(action.message, context);
        const inputs: NotificationInput[] = recipients.map((userId) => ({
          userId,
          // Deliberately an existing type rather than a new "AUTOMATION" one:
          // people already have a preference for each of these, and a new type
          // would arrive switched on for everybody at once.
          type: "ASSIGNED",
          title,
          body: item ? item.name : board.name,
          entityType: item ? "ITEM" : "BOARD",
          entityId: item ? item.id : board.id,
          boardId: board.id,
          actorId: context.actorId,
        }));
        await this.notifications.deliver(inputs);
        return `Told ${recipients.length} ${recipients.length === 1 ? "person" : "people"}`;
      }

      case "create_item": {
        const targetBoardId = action.boardId ?? board.id;
        const groups = targetBoardId === board.id ? context.groups : await this.repos.boards.listGroups(targetBoardId);
        const group = groups.find((g) => g.id === action.groupId) ?? groups[0];
        if (!group) throw new Error("That board has no group to put the task in.");
        const created = await this.items.createItem(
          { boardId: targetBoardId, groupId: group.id, name: this.render(action.name, context), values: action.values ?? [] },
          actorFor(context),
        );
        return `Created "${created.name}"`;
      }

      case "create_subitem": {
        // One level deep is what the board draws; a subitem's subitem would exist and never be seen.
        if (item!.parentItemId) return "A subitem cannot have subitems of its own";
        const created = await this.items.createItem(
          { boardId: board.id, groupId: item!.groupId, parentItemId: item!.id, name: this.render(action.name, context) },
          actorFor(context),
        );
        return `Added subitem "${created.name}"`;
      }

      default:
        throw new Error("Unknown action");
    }
  }

  /**
   * Runs `write` with depth marks on other tasks, so whatever it raises on
   * them is counted as one more link of this chain rather than the start of a
   * new one. The marks are cleared afterwards whatever happens.
   */
  private async writingTo(itemIds: readonly EntityId[], depth: number, write: () => Promise<unknown>): Promise<void> {
    for (const id of itemIds) await this.repos.automations.markDepth(id, depth);
    try {
      await write();
    } finally {
      for (const id of itemIds) await this.repos.automations.clearMark(id);
    }
  }

  private recipients(action: Extract<AutomationAction, { kind: "notify" }>, context: FiringContext): EntityId[] {
    const people = new Set<EntityId>();
    if (action.audience === "specific") {
      for (const id of action.userIds ?? []) people.add(id);
    } else if (action.audience === "actor") {
      if (context.actorId) people.add(context.actorId);
    } else if (action.audience === "people_on_item") {
      for (const column of context.columns) {
        if (column.type !== "PERSON" && column.type !== "PEOPLE") continue;
        for (const id of peopleIn(context.values.get(column.id) ?? null)) people.add(id);
      }
    } else if (action.audience === "board_owners") {
      for (const id of context.boardOwnerIds) people.add(id);
    } else if (action.audience === "board_members") {
      for (const id of context.boardMemberIds) people.add(id);
    } else if (action.audience === "creator") {
      if (context.item) people.add(context.item.createdBy);
    } else if (action.audience === "column") {
      const column = context.columns.find((c) => c.id === action.columnId);
      if (column) for (const id of peopleIn(context.values.get(column.id) ?? null)) people.add(id);
    }
    // Telling somebody about their own edit is noise, and nothing else in the
    // app does it. Two exceptions: `actor`, because that is what it asked for,
    // and `specific`, because a person named by name was named on purpose — a
    // rule that says "tell me" should tell its author when the author set it off.
    if (action.audience !== "actor" && action.audience !== "specific" && context.actorId) people.delete(context.actorId);
    return [...people];
  }

  /**
   * POSTs what happened to an outside address.
   *
   * The body is what a person would want to know and nothing they would not:
   * the board, the task, its cells in words, who did it and when. No ids of
   * people, no tokens, no internals. The address is checked again here rather
   * than trusted from the rule, redirects are refused (a public address that
   * answers "go to 10.0.0.1" is the classic way round the check), and a slow
   * endpoint is cut off so it cannot hold the whole tick.
   */
  private async sendWebhook(url: string, context: FiringContext): Promise<void> {
    const problem = webhookUrlProblem(url);
    if (problem) throw new Error(problem);
    const { board, item, columns, users } = context;
    const cells: Record<string, string> = {};
    if (item) for (const column of columns) cells[column.name] = displayValue(column, context.values.get(column.id), users) ?? "";
    const body = {
      event: context.event?.kind ?? (item ? "manual" : "schedule"),
      at: this.now().toISOString(),
      board: { id: board.id, name: board.name },
      item: item
        ? { id: item.id, name: item.name, ticket: item.ticket ?? null, group: context.groups.find((g) => g.id === item.groupId)?.name ?? null, archived: !!item.archivedAt }
        : null,
      cells,
      actor: users.find((u) => u.id === context.actorId)?.displayName ?? null,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Streamline-Automations/1" },
        body: JSON.stringify(body),
        redirect: "manual",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`The webhook answered ${response.status}.`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`The webhook did not answer within ${WEBHOOK_TIMEOUT_MS / 1000} seconds.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Context, templates, time
  // -------------------------------------------------------------------------

  private async buildContext(
    boardId: EntityId,
    itemId: EntityId | null,
    actorId: EntityId | null,
    event: AutomationEvent | null,
    depth: number,
  ): Promise<FiringContext | null> {
    // Seven reads, one round trip: nothing here depends on anything else here,
    // and the item's values are keyed by the id we were handed rather than by
    // the item row, so they need not wait for it.
    const [board, columns, groups, users, members, item, stored] = await Promise.all([
      this.repos.boards.getById(boardId),
      this.repos.boards.listColumns(boardId),
      this.repos.boards.listGroups(boardId),
      this.repos.users.list(),
      this.repos.boards.listMembers(boardId),
      itemId ? this.repos.items.getById(itemId) : Promise.resolve(null),
      itemId ? this.repos.items.listValuesByItem(itemId) : Promise.resolve([] as ItemColumnValue[]),
    ]);
    if (!board) return null;
    // A task deleted between the write and the drain is not an error: the
    // change it is evidence of no longer has anything to act on.
    if (itemId && !item) return null;

    const values = new Map<EntityId, ColumnValue>();
    if (item) for (const value of stored) values.set(value.columnId, value.value);
    const boardOwnerIds = members.filter((m) => m.role === "OWNER").map((m) => m.userId);
    const boardMemberIds = members.map((m) => m.userId);
    return { board, columns, groups, users, item, values, actorId, event, depth, boardOwnerIds, boardMemberIds };
  }

  /**
   * `{item}`, `{board}`, `{ticket}`, `{actor}`, `{today}` and `{column:Name}`.
   *
   * Deliberately small and deliberately forgiving: a placeholder nobody
   * recognises is left as it was typed rather than replaced with an empty
   * string, so a message that says `{statsu}` reads as a typo instead of
   * quietly losing a word.
   */
  private render(template: string, context: FiringContext): string {
    const clock = this.clock();
    return template.replace(/\{([a-zA-Z]+)(?::([^}]+))?\}/g, (whole: string, key: string, argument?: string): string => {
      switch (key.toLowerCase()) {
        case "item":
          return context.item?.name ?? "";
        case "board":
          return context.board.name;
        case "group":
          return context.groups.find((g) => g.id === context.item?.groupId)?.name ?? "";
        case "ticket":
          return context.item?.ticket ?? "";
        case "actor":
          return context.users.find((u) => u.id === context.actorId)?.displayName ?? "an automation";
        case "today":
          return clock.date;
        case "column": {
          if (!argument) return whole;
          const column = context.columns.find((c) => c.name.toLowerCase() === argument.trim().toLowerCase());
          if (!column) return whole;
          const value = context.values.get(column.id);
          return (value ? displayValue(column, value, context.users) : "") ?? "";
        }
        default:
          return whole;
      }
    });
  }

  /** The date and hour in the workspace's own timezone, not the server's. */
  private clock(): { date: string; hour: number; weekday: number; dayOfMonth: number } {
    return clockIn(this.now(), this.timezone);
  }
}

/**
 * Who an automation's writes are attributed to.
 *
 * Whoever set the change off, so the activity feed reads "Danh set Status to
 * Done" and then "Danh set Due date to Friday" — which is true, in the sense
 * that everybody understands. Where there is no actor at all — a scheduled rule
 * running at four in the morning — it falls back to the board's owner, who is
 * the person answerable for what the board does on its own.
 */
function actorFor(context: FiringContext): EntityId {
  return context.actorId ?? context.board.ownerId;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** People named by a PERSON or PEOPLE value, and nobody for anything else. */
function peopleIn(value: ColumnValue | null): EntityId[] {
  if (!value) return [];
  if (value.type === "PERSON" || value.type === "PEOPLE") return value.userIds;
  return [];
}

/** The words a value holds, for a keyword to be found in. Labels are not words: `column_set_to` names those. */
function textIn(value: ColumnValue | null): string | null {
  if (!value) return null;
  switch (value.type) {
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
      return value.text;
    case "LINK":
      return [value.text, value.url].filter(Boolean).join(" ");
    case "TAGS":
      return value.tags.join(" ");
    default:
      return null;
  }
}

/** The number a NUMBER value holds, and null for an empty cell or anything else. */
function numberIn(value: ColumnValue | null): number | null {
  if (!value || value.type !== "NUMBER" || value.number === null) return null;
  const n = numberOf(value.number, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** The scalar a value compares as: a label id, a number, a date, a string. */
function comparable(value: ColumnValue | null): string | number | boolean | null {
  if (!value) return null;
  switch (value.type) {
    case "STATUS":
    case "DROPDOWN":
    case "PRIORITY":
      return value.labelId;
    case "NUMBER":
      return value.number;
    case "CHECKBOX":
      return value.checked;
    case "DATE":
      return value.date;
    case "TIMELINE":
      return value.end;
    case "SIZE":
      return value.size;
    case "STAKEHOLDER":
      return value.group;
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
      return value.text;
    case "LINK":
      return value.url;
    default:
      return null;
  }
}

function compare(op: ConditionOp, actual: ColumnValue, expected: ColumnValue | null, context: FiringContext): boolean {
  if (op === "is_empty") return isEmptyValue(actual);
  if (op === "is_not_empty") return !isEmptyValue(actual);
  if (op === "is_overdue") {
    const date = comparable(actual);
    return typeof date === "string" && date !== "" && date < clockIn(new Date(), "UTC").date;
  }

  // People and tags hold sets, so "is" means "contains this one" rather than
  // "is exactly this list" — which is what somebody picking a name off a filter
  // means by it, and what the board's own filters already do.
  const actualPeople = peopleIn(actual);
  if (actualPeople.length > 0 || actual.type === "PERSON" || actual.type === "PEOPLE") {
    const wanted = peopleIn(expected);
    const hit = wanted.some((id) => actualPeople.includes(id));
    return op === "is_not" || op === "not_contains" ? !hit : hit;
  }
  if (actual.type === "TAGS") {
    const wanted = expected?.type === "TAGS" ? expected.tags : [];
    const hit = wanted.some((tag) => actual.tags.includes(tag));
    return op === "is_not" || op === "not_contains" ? !hit : hit;
  }

  const left = comparable(actual);
  const right = comparable(expected);
  switch (op) {
    case "is":
      return left === right;
    case "is_not":
      return left !== right;
    case "contains":
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "not_contains":
      return !String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "greater_than":
      return Number(left) > Number(right);
    case "less_than":
      return Number(left) < Number(right);
    case "after":
      return String(left ?? "") > String(right ?? "");
    case "before":
      return String(left ?? "") !== "" && String(left ?? "") < String(right ?? "");
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Wording for the log
// ---------------------------------------------------------------------------

function describeCondition(condition: AutomationCondition, context: FiringContext): string {
  switch (condition.kind) {
    case "group": {
      const group = context.groups.find((g) => g.id === condition.groupId);
      return `group ${condition.op === "is" ? "is" : "is not"} ${group?.name ?? "a group that is gone"}`;
    }
    case "actor": {
      const user = context.users.find((u) => u.id === condition.userId);
      return `changed by ${condition.op === "is" ? "" : "anyone but "}${user?.displayName ?? "someone"}`;
    }
    case "item_kind":
      return condition.is === "subitem" ? "it is a subitem" : "it is a top-level task";
    case "column": {
      const column = context.columns.find((c) => c.id === condition.columnId);
      const name = column?.name ?? "a column that is gone";
      const words = condition.op.replace(/_/g, " ");
      const value = (column && condition.value ? displayValue(column, condition.value, context.users) : "") ?? "";
      return `${name} ${words}${value ? ` ${value}` : ""}`;
    }
    default:
      return "a condition";
  }
}

function describeAction(action: AutomationAction, context: FiringContext): string {
  const columnName = (id: string) => context.columns.find((c) => c.id === id)?.name ?? "a column";
  switch (action.kind) {
    case "set_value":
      return `Set ${columnName(action.columnId)}`;
    case "clear_value":
      return `Clear ${columnName(action.columnId)}`;
    case "move_to_group":
      return `Move to ${context.groups.find((g) => g.id === action.groupId)?.name ?? "a group"}`;
    case "assign_person":
      return `Assign ${columnName(action.columnId)}`;
    case "unassign_person":
      return `Unassign ${columnName(action.columnId)}`;
    case "shift_date":
      return `Move ${columnName(action.columnId)} by ${action.days} days`;
    case "set_date_relative":
      return `Set ${columnName(action.columnId)}`;
    case "notify":
      return "Notify";
    case "add_comment":
      return "Post an update";
    case "create_item":
      return "Create a task";
    case "create_subitem":
      return "Add a subitem";
    case "archive_item":
      return "Archive";
    case "restore_item":
      return "Restore";
    case "duplicate_item":
      return "Duplicate";
    case "set_name":
      return "Rename";
    case "set_description":
      return "Set the description";
    case "copy_value":
      return `Copy ${columnName(action.fromColumnId)} to ${columnName(action.toColumnId)}`;
    case "adjust_number":
      return `Change ${columnName(action.columnId)} by ${action.delta}`;
    case "add_tags":
      return `Tag ${columnName(action.columnId)}`;
    case "remove_tags":
      return `Untag ${columnName(action.columnId)}`;
    case "set_parent_value":
      return `Set ${columnName(action.columnId)} on the parent`;
    case "set_subitems_value":
      return `Set ${columnName(action.columnId)} on the subitems`;
    case "send_webhook":
      return "Call a webhook";
    default:
      return "Act";
  }
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * What day and hour it is somewhere.
 *
 * Through `Intl` rather than by adding an offset, because the offset changes
 * twice a year and a rule set to 9am should be 9am in November as well as June.
 */
export function clockIn(instant: Date, timezone: string): { date: string; hour: number; weekday: number; dayOfMonth: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Midnight comes back as "24" from some implementations of hour12: false.
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    weekday: Math.max(0, days.indexOf(get("weekday"))),
    dayOfMonth: Number(get("day")),
  };
}

/**
 * A number that came out of a JSON column, whatever it looks like in there.
 *
 * The builder always writes these as numbers and the domain types say so, but
 * the value sits in `jsonb` where nothing enforces that, and a rule can arrive
 * from somewhere other than the builder — an import, a duplicated board, a hand
 * edit in the SQL editor. `9 !== "9"` is true, so a quoted hour turns into a
 * schedule that never fires and never explains itself, which is the worst thing
 * a feature whose whole point is running unattended can do. Found by exactly
 * that: a test wrote "2" and the rule went quiet.
 */
function numberOf(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Whether a recurring rule's day and hour are the ones we are standing in. */
export function dueNow(
  trigger: { recurrence: string; weekday?: number; dayOfMonth?: number; atHour: number },
  clock: { hour: number; weekday: number; dayOfMonth: number },
): boolean {
  if (clock.hour !== numberOf(trigger.atHour, -1)) return false;
  switch (trigger.recurrence) {
    case "daily":
      return true;
    case "weekdays":
      return clock.weekday >= 1 && clock.weekday <= 5;
    case "weekly":
      return clock.weekday === numberOf(trigger.weekday, 1);
    case "monthly":
      return clock.dayOfMonth === numberOf(trigger.dayOfMonth, 1);
    default:
      return false;
  }
}

/** Calendar arithmetic on a yyyy-mm-dd, in no timezone at all. */
export function shiftDate(date: string, days: number): string {
  const parts = date.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
