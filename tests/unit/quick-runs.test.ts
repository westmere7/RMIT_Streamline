import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationCondition, AutomationRuleInput, AutomationTrigger, BoardColumn, ColumnValue } from "@/domain";
import { MAX_QUICK_RUN_ITEMS } from "@/domain";
import { createServices, describeRule, type Services } from "@/services";

/**
 * Quick runs: a saved group of actions, pointed at tasks and fired by hand.
 *
 * The thing these have to prove is a negative as much as a positive. A quick
 * run must do exactly what it says to exactly the tasks chosen — and the two
 * unattended passes, the queue and the clock, must never pick one up on their
 * own. A quick run that fired itself at four in the morning would be the
 * opposite of what the word means.
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
let counter = 0;

describe("quick runs", () => {
  let repos: LocalRepositories;
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `quick-${Date.now()}-${counter}` });
    services = createServices(repos);
    for (const event of await repos.automations.claimEvents(5000)) await repos.automations.finishEvent(event.id, {});
  });

  const columns = () => repos.boards.listColumns(BOARD);
  async function column(name: string): Promise<BoardColumn> {
    const found = (await columns()).find((c) => c.name === name);
    if (!found) throw new Error(`No column ${name}`);
    return found;
  }
  const labelIdFor = (col: BoardColumn, name: string): string => {
    const label = (col.settings as { labels?: Array<{ id: string; name: string }> }).labels?.find((l) => l.name === name);
    if (!label) throw new Error(`No label ${name}`);
    return label.id;
  };
  async function valueOf(itemId: string, columnName: string): Promise<ColumnValue | undefined> {
    const col = await column(columnName);
    return (await repos.items.listValuesByItem(itemId)).find((v) => v.columnId === col.id)?.value;
  }
  async function liveItems(n: number) {
    const items = (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null).slice(0, n);
    if (items.length < n) throw new Error(`The seed board needs ${n} items`);
    return items;
  }
  async function vocabulary() {
    return { columns: await columns(), groups: await repos.boards.listGroups(BOARD), users: await repos.users.list() };
  }
  async function save(trigger: AutomationTrigger, actions: AutomationAction[], conditions: AutomationCondition[] = [], enabled = true) {
    const input: AutomationRuleInput = {
      workspaceId: SEED_WORKSPACE_ID,
      boardId: BOARD,
      name: "",
      enabled,
      trigger,
      conditionMatch: "all",
      conditions,
      actions,
      createdBy: SEED_USER_IDS.danh,
    };
    return services.automations.create(input, await vocabulary());
  }
  const quickRun = (actions: AutomationAction[], conditions: AutomationCondition[] = []) => save({ kind: "manual" }, actions, conditions);

  // -------------------------------------------------------------------------

  it("does every action to every chosen task, and to nothing else", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const [a, b, untouched] = await liveItems(3);
    const rule = await quickRun([
      { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
      { kind: "set_value", columnId: priority.id, value: { type: "PRIORITY", labelId: labelIdFor(priority, "Low") } },
    ]);

    const report = await services.automations.runNow(rule.id, [a!.id, b!.id], SEED_USER_IDS.danh);

    // Two actions on two tasks: four things done, in the report and on the board.
    expect(report).toMatchObject({ ran: 4, failed: 0, skipped: 0 });
    for (const item of [a!, b!]) {
      expect(await valueOf(item.id, "Status")).toEqual({ type: "STATUS", labelId: labelIdFor(status, "Done") });
      expect(await valueOf(item.id, "Priority")).toEqual({ type: "PRIORITY", labelId: labelIdFor(priority, "Low") });
    }
    expect(await valueOf(untouched!.id, "Status")).not.toEqual({ type: "STATUS", labelId: labelIdFor(status, "Done") });
  });

  it("says who pressed the button, not that a machine did it", async () => {
    const [item] = await liveItems(1);
    const rule = await quickRun([{ kind: "add_comment", body: "{actor} ran this on {item}" }]);

    await services.automations.runNow(rule.id, [item!.id], SEED_USER_IDS.emily);

    const comments = await repos.comments.listByItem(item!.id);
    const posted = comments.find((c) => c.body.includes("ran this on"));
    expect(posted?.authorId).toBe(SEED_USER_IDS.emily);
    const emily = (await repos.users.list()).find((u) => u.id === SEED_USER_IDS.emily)!;
    expect(posted?.body).toBe(`${emily.displayName} ran this on ${item!.name}`);
  });

  it("ignores conditions: a person pointing at a task has already decided", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const [item] = await liveItems(1);
    // A condition that cannot possibly hold.
    const rule = await quickRun(
      [{ kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } }],
      [{ kind: "column", columnId: priority.id, op: "is", value: { type: "PRIORITY", labelId: "no-such-label" } }],
    );

    const report = await services.automations.runNow(rule.id, [item!.id], SEED_USER_IDS.danh);

    expect(report.ran).toBe(1);
    expect(report.skipped).toBe(0);
  });

  it("writes a row in the log for each action, and moves the rule's tally", async () => {
    const status = await column("Status");
    const [a, b] = await liveItems(2);
    const rule = await quickRun([{ kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "In Progress") } }]);

    await services.automations.runNow(rule.id, [a!.id, b!.id], SEED_USER_IDS.danh);

    const runs = await repos.automations.listRunsByRule(rule.id, 10);
    expect(runs.filter((r) => r.status === "ran")).toHaveLength(2);
    expect(new Set(runs.map((r) => r.itemId))).toEqual(new Set([a!.id, b!.id]));
    const stored = await repos.automations.getRule(rule.id);
    expect(stored?.lastRunAt).not.toBeNull();
  });

  it("refuses to fire a rule that is not a quick run", async () => {
    const status = await column("Status");
    const [item] = await liveItems(1);
    const rule = await save({ kind: "column_changed", columnId: status.id }, [{ kind: "archive_item" }]);

    await expect(services.automations.runNow(rule.id, [item!.id], SEED_USER_IDS.danh)).rejects.toThrow(/Only a quick run/);
    expect((await repos.items.getById(item!.id))!.archivedAt).toBeNull();
  });

  it("refuses a quick run that has been switched off", async () => {
    const [item] = await liveItems(1);
    const rule = await save({ kind: "manual" }, [{ kind: "archive_item" }], [], false);

    await expect(services.automations.runNow(rule.id, [item!.id], SEED_USER_IDS.danh)).rejects.toThrow(/switched off/);
  });

  it("skips a task from another board rather than writing into the wrong columns", async () => {
    const status = await column("Status");
    const stranger = (await repos.items.listByBoard(SEED_BOARD_IDS.sem1)).find((i) => i.archivedAt === null && i.parentItemId === null);
    if (!stranger) throw new Error("The seed needs a task on another board");
    const rule = await quickRun([{ kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } }]);

    const report = await services.automations.runNow(rule.id, [stranger.id], SEED_USER_IDS.danh);

    expect(report).toMatchObject({ ran: 0, skipped: 1 });
    const runs = await repos.automations.listRunsByRule(rule.id, 5);
    expect(runs[0]?.summary).toMatch(/another board/);
  });

  it("may run against no task at all when nothing in it needs one", async () => {
    const group = (await repos.boards.listGroups(BOARD))[0]!;
    const rule = await quickRun([{ kind: "create_item", groupId: group.id, name: "Made by hand on {today}" }]);

    const report = await services.automations.runNow(rule.id, [], SEED_USER_IDS.danh);

    expect(report.ran).toBe(1);
    expect((await repos.items.listByBoard(BOARD)).some((i) => i.name.startsWith("Made by hand on "))).toBe(true);
  });

  it("marks depth, so a rule its actions wake is a chain of one and not a runaway", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const [item] = await liveItems(1);
    // A rule that answers the quick run's write.
    await save({ kind: "column_changed", columnId: status.id }, [
      { kind: "set_value", columnId: priority.id, value: { type: "PRIORITY", labelId: labelIdFor(priority, "High") } },
    ]);
    const rule = await quickRun([{ kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } }]);

    await services.automations.runNow(rule.id, [item!.id], SEED_USER_IDS.danh);
    const [raised] = await repos.automations.claimEvents(10);

    // The write the quick run made carries a depth of one: it is one automation deep already.
    expect(raised?.kind).toBe("value_changed");
    expect(raised?.depth).toBe(1);
  });

  // -------------------------------------------------------------------------
  // The negative: neither unattended pass ever picks a quick run up
  // -------------------------------------------------------------------------

  it("is never fired by a change on the board, however much changes", async () => {
    const status = await column("Status");
    const [item] = await liveItems(1);
    const rule = await quickRun([{ kind: "archive_item" }]);

    const board = (await repos.boards.getById(BOARD))!;
    const users = await repos.users.list();
    await services.items.setValue(item!.id, status.id, { type: "STATUS", labelId: labelIdFor(status, "Done") }, { column: status, item: item!, board, users }, SEED_USER_IDS.danh);
    await services.automationEngine.drain(100);

    expect((await repos.items.getById(item!.id))!.archivedAt).toBeNull();
    expect(await repos.automations.listRunsByRule(rule.id, 5)).toHaveLength(0);
  });

  it("is never fired by the clock, whatever the hour", async () => {
    const [item] = await liveItems(1);
    const rule = await quickRun([{ kind: "archive_item" }]);

    // Every hour of a day, in case a quick run were ever mistaken for a schedule.
    for (let hour = 0; hour < 24; hour += 1) {
      await services.automationEngine.drain(100);
    }
    expect(await repos.automations.listScheduledRules()).not.toContainEqual(expect.objectContaining({ id: rule.id }));
    expect((await repos.items.getById(item!.id))!.archivedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Saving one
  // -------------------------------------------------------------------------

  it("may hold any action, including the ones a schedule may not", async () => {
    const status = await column("Status");
    const group = (await repos.boards.listGroups(BOARD))[0]!;
    const rule = await quickRun([
      { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
      { kind: "move_to_group", groupId: group.id },
      { kind: "archive_item" },
    ]);
    expect(rule.actions).toHaveLength(3);
  });

  it("reads as what it does, with no 'when' in front", async () => {
    const status = await column("Status");
    const vocab = await vocabulary();
    const sentence = describeRule(
      { kind: "manual" },
      [],
      [
        { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
        { kind: "notify", audience: "people_on_item", message: "x" },
      ],
      "all",
      vocab,
    );
    expect(sentence).toBe("Set Status to Done, and tell everybody on the task");
    expect(sentence.toLowerCase()).not.toMatch(/^when/);
  });

  it("still refuses an empty one", async () => {
    await expect(quickRun([])).rejects.toThrow(/at least one thing/);
  });

  it("caps how many tasks one run may take", () => {
    expect(MAX_QUICK_RUN_ITEMS).toBe(50);
  });
});
