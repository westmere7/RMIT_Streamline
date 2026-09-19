import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationCondition, AutomationRuleInput, AutomationTrigger, BoardColumn, ColumnValue } from "@/domain";
import { AutomationEngine, clockIn, dueNow, shiftDate } from "@/services/automation-engine";
import { AutomationService } from "@/services/automation-service";
import { createServices, type Services } from "@/services";

/**
 * Automations, end to end, with no browser anywhere in the test.
 *
 * That absence is the point of the feature and so it is the point of these
 * tests. Nothing here renders a component, mounts a hook or holds a query
 * client: a write lands in the repositories, the queue notices, and a runner
 * that could just as well be a cron job at four in the morning drains it. If
 * these pass, a rule fires with every browser in the building shut.
 *
 * The scheduled half is tested by moving the clock rather than by waiting. The
 * engine takes its `now` from outside for exactly this reason — a test that
 * waited an hour to prove "at 9am" works is a test nobody runs.
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
let counter = 0;

describe("automations", () => {
  let repos: LocalRepositories;
  let services: Services;
  /** The instant every engine in a test is told it is. Moved, never waited for. */
  let clock: Date;

  /** A runner reading the clock this test controls, in a fixed zone. */
  function engineAt(instant: Date, timezone = "Australia/Melbourne"): AutomationEngine {
    clock = instant;
    return new AutomationEngine(repos, services.items, services.comments, services.notifications, { timezone, now: () => clock });
  }

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `automations-${Date.now()}-${counter}` });
    services = createServices(repos);
    clock = new Date("2026-09-21T00:00:00Z");
    // The seed's own writes queue events like anything else. Drop them, so each
    // test starts with a queue holding only what the test put there.
    await drainQuietly();
  });

  async function drainQuietly(): Promise<void> {
    const pending = await repos.automations.claimEvents(1000);
    for (const event of pending) await repos.automations.finishEvent(event.id, {});
  }

  // ---- helpers -------------------------------------------------------------

  const columns = () => repos.boards.listColumns(BOARD);
  const groups = () => repos.boards.listGroups(BOARD);

  async function column(name: string): Promise<BoardColumn> {
    const found = (await columns()).find((c) => c.name === name);
    if (!found) throw new Error(`No column "${name}" on the board. There are: ${(await columns()).map((c) => c.name).join(", ")}`);
    return found;
  }

  async function firstItem() {
    const items = (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null);
    const item = items[0];
    if (!item) throw new Error("The seed board has no items");
    return item;
  }

  async function vocabulary() {
    return { columns: await columns(), groups: await groups(), users: await repos.users.list() };
  }

  async function addRule(
    trigger: AutomationTrigger,
    actions: AutomationAction[],
    options: { conditions?: AutomationCondition[]; match?: "all" | "any"; name?: string } = {},
  ) {
    const input: AutomationRuleInput = {
      workspaceId: SEED_WORKSPACE_ID,
      boardId: BOARD,
      name: options.name ?? "",
      enabled: true,
      trigger,
      conditionMatch: options.match ?? "all",
      conditions: options.conditions ?? [],
      actions,
      createdBy: SEED_USER_IDS.danh,
    };
    return new AutomationService(repos).create(input, await vocabulary());
  }

  async function setValue(itemId: string, columnName: string, value: ColumnValue, actor = SEED_USER_IDS.danh) {
    const board = (await repos.boards.getById(BOARD))!;
    const col = await column(columnName);
    const item = (await repos.items.getById(itemId))!;
    const users = await repos.users.list();
    return services.items.setValue(itemId, col.id, value, { column: col, item, board, users }, actor);
  }

  async function valueOf(itemId: string, columnName: string): Promise<ColumnValue | undefined> {
    const col = await column(columnName);
    return (await repos.items.listValuesByItem(itemId)).find((v) => v.columnId === col.id)?.value;
  }

  /**
   * The UTC instant at which a Melbourne clock reads this date and this hour.
   *
   * Searched rather than calculated, because the offset is +10 for half the
   * year and +11 for the other half, and a test that hard-coded either would
   * pass in one season and fail in the next — which is the exact bug the
   * engine reads its clock through `Intl` to avoid.
   */
  function melbourne(date: string, hour: number): Date {
    const midnightUtc = Date.parse(date + "T00:00:00Z");
    for (let offset = -14; offset <= 14; offset += 1) {
      const candidate = new Date(midnightUtc + offset * 3_600_000);
      const read = clockIn(candidate, "Australia/Melbourne");
      if (read.date === date && read.hour === hour) return candidate;
    }
    throw new Error("No instant reads " + date + " " + hour + ":00 in Melbourne");
  }

  const labelIdFor = (col: BoardColumn, name: string): string => {
    const settings = col.settings as { labels?: Array<{ id: string; name: string }> };
    const label = settings.labels?.find((l) => l.name === name);
    if (!label) throw new Error(`No label "${name}" on ${col.name}`);
    return label.id;
  };

  // =========================================================================
  // Events
  // =========================================================================

  it("fires a rule from a write that no page was watching", async () => {
    const status = await column("Status");
    const done = labelIdFor(status, "Done");
    const item = await firstItem();

    await addRule({ kind: "column_set_to", columnId: status.id, labelId: done }, [{ kind: "set_date_relative", columnId: (await column("Due Date")).id, days: 0 }]);

    await setValue(item.id, "Status", { type: "STATUS", labelId: done });
    // The write is done and nothing has happened yet. This is the state the
    // feature lives in: the change is recorded, the rule has not run, and the
    // person who made it may well have closed the laptop.
    expect(await valueOf(item.id, "Due Date")).not.toEqual({ type: "DATE", date: "2026-09-21" });

    const report = await engineAt(new Date("2026-09-21T03:00:00Z")).drain(100);

    expect(report.ran).toBe(1);
    expect(await valueOf(item.id, "Due Date")).toEqual({ type: "DATE", date: "2026-09-21" });
  });

  it("leaves a rule alone when its trigger value is not the one that landed", async () => {
    const status = await column("Status");
    const item = await firstItem();
    await addRule({ kind: "column_set_to", columnId: status.id, labelId: labelIdFor(status, "Done") }, [{ kind: "archive_item" }]);

    await setValue(item.id, "Status", { type: "STATUS", labelId: labelIdFor(status, "In Progress") });
    const report = await engineAt(clock).drain(100);

    expect(report.ran).toBe(0);
    expect((await repos.items.getById(item.id))!.archivedAt).toBeNull();
  });

  it("holds a rule back when a condition does not hold, and says which one", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const item = await firstItem();

    await setValue(item.id, "Priority", { type: "PRIORITY", labelId: labelIdFor(priority, "Low") });
    await drainQuietly();

    await addRule(
      { kind: "column_set_to", columnId: status.id, labelId: labelIdFor(status, "Done") },
      [{ kind: "archive_item" }],
      { conditions: [{ kind: "column", columnId: priority.id, op: "is", value: { type: "PRIORITY", labelId: labelIdFor(priority, "Critical") } }] },
    );

    await setValue(item.id, "Status", { type: "STATUS", labelId: labelIdFor(status, "Done") });
    const report = await engineAt(clock).drain(100);

    expect(report.skipped).toBe(1);
    expect((await repos.items.getById(item.id))!.archivedAt).toBeNull();
    const runs = await repos.automations.listRuns(BOARD, 10);
    expect(runs[0]?.status).toBe("skipped");
    expect(runs[0]?.summary).toContain("Priority is Critical");
  });

  it("runs on any condition when the rule asks for any rather than all", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const item = await firstItem();
    await setValue(item.id, "Priority", { type: "PRIORITY", labelId: labelIdFor(priority, "Low") });
    await drainQuietly();

    await addRule(
      { kind: "column_set_to", columnId: status.id, labelId: labelIdFor(status, "Done") },
      [{ kind: "archive_item" }],
      {
        match: "any",
        conditions: [
          { kind: "column", columnId: priority.id, op: "is", value: { type: "PRIORITY", labelId: labelIdFor(priority, "Critical") } },
          { kind: "column", columnId: priority.id, op: "is", value: { type: "PRIORITY", labelId: labelIdFor(priority, "Low") } },
        ],
      },
    );

    await setValue(item.id, "Status", { type: "STATUS", labelId: labelIdFor(status, "Done") });
    await engineAt(clock).drain(100);

    expect((await repos.items.getById(item.id))!.archivedAt).not.toBeNull();
  });

  it("fires when somebody is added to a person column, and not when one is taken away", async () => {
    const people = (await columns()).find((c) => c.type === "PERSON" || c.type === "PEOPLE");
    if (!people) return;
    const item = await firstItem();
    await setValue(item.id, people.name, { type: "PERSON", userIds: [] });
    await drainQuietly();

    await addRule({ kind: "person_assigned", columnId: people.id }, [{ kind: "notify", audience: "people_on_item", message: "You are on {item}" }]);

    await setValue(item.id, people.name, { type: "PERSON", userIds: [SEED_USER_IDS.emily] });
    expect((await engineAt(clock).drain(100)).ran).toBe(1);

    await setValue(item.id, people.name, { type: "PERSON", userIds: [] });
    expect((await engineAt(clock).drain(100)).ran).toBe(0);
  });

  it("fires when a task is created, and reads its name into the update it posts", async () => {
    const group = (await groups())[0]!;
    await addRule({ kind: "item_created" }, [{ kind: "add_comment", body: "Logged {item} on {board}." }]);

    const created = await services.items.createItem({ boardId: BOARD, groupId: group.id, name: "Filming day" }, SEED_USER_IDS.danh);
    await engineAt(clock).drain(100);

    const comments = await repos.comments.listByItem(created.id);
    expect(comments.map((c) => c.body)).toContain("Logged Filming day on RMITinerary 2026.");
  });

  it("fires when a task moves into the group the rule watches", async () => {
    const all = await groups();
    const [from, to] = all;
    if (!from || !to) throw new Error("The seed board needs two groups");
    const item = (await repos.items.listByBoard(BOARD)).find((i) => i.groupId === from.id && i.archivedAt === null)!;

    await addRule({ kind: "item_moved_to_group", groupId: to.id }, [{ kind: "add_comment", body: "Moved to {group}" }]);
    await services.items.moveItemsToGroup(BOARD, [item.id], to.id, SEED_USER_IDS.danh);
    await engineAt(clock).drain(100);

    expect((await repos.comments.listByItem(item.id)).some((c) => c.body === `Moved to ${to.name}`)).toBe(true);
  });

  it("settles by itself when a rule writes a value that is already there", async () => {
    const status = await column("Status");
    const priority = await column("Priority");
    const item = await firstItem();

    // Two rules that answer each other, but with fixed values. The first round
    // changes both columns; the second writes what is already in them, and a
    // write that changes nothing raises nothing. The loop ends without the
    // guard being needed, which is why the guard needs its own test below.
    await addRule({ kind: "column_changed", columnId: status.id }, [
      { kind: "set_value", columnId: priority.id, value: { type: "PRIORITY", labelId: labelIdFor(priority, "High") } },
    ]);
    await addRule({ kind: "column_changed", columnId: priority.id }, [
      { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "In Progress") } },
    ]);

    await setValue(item.id, "Status", { type: "STATUS", labelId: labelIdFor(status, "Done") });

    const engine = engineAt(clock);
    for (let pass = 0; pass < 8; pass += 1) await engine.drain(100);

    expect((await repos.automations.claimEvents(50)).length).toBe(0);
    expect((await repos.automations.listRuns(BOARD, 100)).every((r) => r.status !== "failed")).toBe(true);
  });

  it("cuts a chain of rules that genuinely feed each other", async () => {
    const due = await column("Due Date");
    const timeline = await column("Timeline");
    const item = await firstItem();

    // Each action moves a date by a day, so every write is a real change and
    // the pair would run until the database filled up. Neither rule writes the
    // column it watches, so the validator has no reason to refuse either: the
    // depth guard is the only thing standing between this and a runaway.
    await addRule({ kind: "column_changed", columnId: due.id }, [{ kind: "shift_date", columnId: timeline.id, days: 1 }]);
    await addRule({ kind: "column_changed", columnId: timeline.id }, [{ kind: "shift_date", columnId: due.id, days: 1 }]);

    await setValue(item.id, "Timeline", { type: "TIMELINE", start: "2027-05-01", end: "2027-05-02" });
    await setValue(item.id, "Due Date", { type: "DATE", date: "2027-05-10" });

    const engine = engineAt(clock);
    for (let pass = 0; pass < 10; pass += 1) await engine.drain(100);

    const runs = await repos.automations.listRuns(BOARD, 200);
    expect(runs.some((r) => r.summary.includes("too many automations"))).toBe(true);
    // And it actually stopped rather than merely complaining: nothing is left
    // waiting to go round again.
    expect((await repos.automations.claimEvents(50)).length).toBe(0);
  });

  it("refuses to save a rule that would set the very column it watches", async () => {
    const status = await column("Status");
    await expect(
      addRule({ kind: "column_changed", columnId: status.id }, [
        { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
      ]),
    ).rejects.toThrow(/set it off again/);
  });

  // =========================================================================
  // Schedules — the half that runs with nobody there at all
  // =========================================================================

  describe("on a schedule", () => {
    /**
     * A day no seeded task falls on.
     *
     * The demo data hangs its dates off the day it is generated, so a test that
     * picked "in two days" would be counting the seed's tasks as well as its
     * own — and would start failing on a date nobody chose.
     */
    const DEADLINE = "2027-03-15";
    /** The day a rule set to "two days before" speaks on. */
    const TWO_DAYS_BEFORE = "2027-03-13";

    /** A rule that speaks two days before a due date, at 9am. */
    async function reminderRule(offsetDays = -2, atHour = 9) {
      const due = await column("Due Date");
      return addRule({ kind: "date_arrives", columnId: due.id, offsetDays, atHour }, [
        { kind: "notify", audience: "people_on_item", message: "{item} is due on {column:Due Date}" },
      ]);
    }

    it("fires on the day the offset points at, and at the hour asked for", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: DEADLINE });
      await drainQuietly();
      await reminderRule(-2, 9);

      // Nine in the morning in Melbourne, which is the evening before in UTC.
      // A runner reading the server's clock rather than the workspace's would
      // miss this entirely, which is the bug this assertion exists for.
      const report = await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100);

      expect(report.scheduled).toBe(1);
      expect(report.ran).toBe(1);
    });

    it("says nothing at the wrong hour of the right day", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: DEADLINE });
      await drainQuietly();
      await reminderRule(-2, 9);

      const report = await engineAt(melbourne(TWO_DAYS_BEFORE, 14)).drain(100);
      expect(report.scheduled).toBe(0);
    });

    it("says nothing on the wrong day", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: "2027-03-22" });
      await drainQuietly();
      await reminderRule(-2, 9);

      expect((await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100)).scheduled).toBe(0);
    });

    it("fires once however many times the runner ticks in that hour", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: DEADLINE });
      await drainQuietly();
      await reminderRule(-2, 9);

      // Twelve ticks inside the nine o'clock hour, which is what a five-minute
      // cron does. The receipt in automation_schedule_fires is what makes the
      // other eleven do nothing.
      const nine = melbourne(TWO_DAYS_BEFORE, 9).getTime();
      let scheduled = 0;
      for (let minute = 0; minute < 60; minute += 5) {
        scheduled += (await engineAt(new Date(nine + minute * 60_000)).drain(100)).scheduled;
      }
      expect(scheduled).toBe(1);
    });

    it("comes back the next day for a different task", async () => {
      const items = (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null);
      const [first, second] = items;
      if (!first || !second) throw new Error("The seed board needs two items");
      await setValue(first.id, "Due Date", { type: "DATE", date: DEADLINE });
      await setValue(second.id, "Due Date", { type: "DATE", date: "2027-03-16" });
      await drainQuietly();
      await reminderRule(-2, 9);

      expect((await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100)).scheduled).toBe(1);
      expect((await engineAt(melbourne("2027-03-14", 9)).drain(100)).scheduled).toBe(1);
    });

    it("can speak after a date as well as before one", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: "2027-03-11" });
      await drainQuietly();
      await reminderRule(2, 9);

      expect((await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100)).scheduled).toBe(1);
    });

    it("ignores an archived task when the deadline comes round", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: DEADLINE });
      await services.items.archiveItems(BOARD, [item.id], SEED_USER_IDS.danh);
      await drainQuietly();
      await reminderRule(-2, 9);

      expect((await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100)).scheduled).toBe(0);
    });

    it("creates the task a recurring rule asks for, weekly, on its day", async () => {
      const group = (await groups())[0]!;
      // Monday is 1. 2026-09-21 is a Monday in Melbourne.
      await addRule({ kind: "recurring", recurrence: "weekly", weekday: 1, atHour: 8 }, [
        { kind: "create_item", groupId: group.id, name: "Weekly report — {today}" },
      ]);

      const monday = await engineAt(melbourne("2027-03-15", 8)).drain(100); // 2027-03-15 is a Monday.
      expect(monday.scheduled).toBe(1);
      const names = (await repos.items.listByBoard(BOARD)).map((i) => i.name);
      expect(names).toContain("Weekly report — 2027-03-15");

      // Tuesday at the same hour: not its day.
      expect((await engineAt(melbourne("2027-03-16", 8)).drain(100)).scheduled).toBe(0);
    });

    it("refuses a scheduled rule that tries to edit a task it does not have", async () => {
      const status = await column("Status");
      await expect(
        addRule({ kind: "recurring", recurrence: "daily", atHour: 9 }, [
          { kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
        ]),
      ).rejects.toThrow(/no task in hand/);
    });

    /**
     * The regression this exists for: a rule stored with its hour as the JSON
     * string "2" rather than the number 2. `2 !== "2"`, so the rule went quiet
     * for ever and said nothing about why. A schedule that silently never fires
     * is the worst failure this feature has, because the whole point of it is
     * that nobody is watching.
     */
    it("still fires when the stored hour is a string rather than a number", async () => {
      const item = await firstItem();
      await setValue(item.id, "Due Date", { type: "DATE", date: DEADLINE });
      await drainQuietly();
      const rule = await reminderRule(-2, 9);
      // Written past the typed builder, the way an import or a hand edit would.
      await repos.automations.updateRule(rule.id, {
        trigger: { kind: "date_arrives", columnId: (await column("Due Date")).id, offsetDays: "-2", atHour: "9" } as never,
      });

      expect((await engineAt(melbourne(TWO_DAYS_BEFORE, 9)).drain(100)).scheduled).toBe(1);
    });

    it("still reads a recurring day and hour stored as strings", () => {
      expect(dueNow({ recurrence: "weekly", weekday: "4" as never, atHour: "9" as never }, { hour: 9, weekday: 4, dayOfMonth: 1 })).toBe(true);
      expect(dueNow({ recurrence: "monthly", dayOfMonth: "15" as never, atHour: "9" as never }, { hour: 9, weekday: 2, dayOfMonth: 15 })).toBe(true);
      // And a value that is not a number at all does not match every hour.
      expect(dueNow({ recurrence: "daily", atHour: "nonsense" as never }, { hour: 9, weekday: 2, dayOfMonth: 1 })).toBe(false);
    });

    it("refuses a monthly rule on a day that does not exist every month", async () => {
      const group = (await groups())[0]!;
      await expect(
        addRule({ kind: "recurring", recurrence: "monthly", dayOfMonth: 31, atHour: 9 }, [{ kind: "create_item", groupId: group.id, name: "Month end" }]),
      ).rejects.toThrow(/1 to 28/);
    });
  });

  // =========================================================================
  // The clock itself
  // =========================================================================

  describe("reading the clock", () => {
    it("reads the workspace's hour, not the server's", () => {
      const instant = new Date("2026-09-20T23:30:00Z");
      expect(clockIn(instant, "Australia/Melbourne")).toMatchObject({ date: "2026-09-21", hour: 9 });
      expect(clockIn(instant, "UTC")).toMatchObject({ date: "2026-09-20", hour: 23 });
    });

    it("keeps 9am at 9am on both sides of a daylight saving change", () => {
      // Melbourne is UTC+10 in September and UTC+11 from the first Sunday of
      // October. An engine that added a fixed offset would be an hour out from
      // that Sunday until April, which is most of the year.
      expect(clockIn(new Date("2026-09-20T23:00:00Z"), "Australia/Melbourne").hour).toBe(9);
      expect(clockIn(new Date("2026-10-11T22:00:00Z"), "Australia/Melbourne").hour).toBe(9);
    });

    it("reads midnight as hour nought rather than twenty-four", () => {
      expect(clockIn(new Date("2026-09-20T14:00:00Z"), "Australia/Melbourne").hour).toBe(0);
    });

    it("knows which days a recurrence wants", () => {
      const at = (hour: number, weekday: number, dayOfMonth = 1) => ({ hour, weekday, dayOfMonth });
      expect(dueNow({ recurrence: "daily", atHour: 9 }, at(9, 3))).toBe(true);
      expect(dueNow({ recurrence: "daily", atHour: 9 }, at(10, 3))).toBe(false);
      expect(dueNow({ recurrence: "weekdays", atHour: 9 }, at(9, 6))).toBe(false);
      expect(dueNow({ recurrence: "weekdays", atHour: 9 }, at(9, 1))).toBe(true);
      expect(dueNow({ recurrence: "weekly", weekday: 4, atHour: 9 }, at(9, 4))).toBe(true);
      expect(dueNow({ recurrence: "weekly", weekday: 4, atHour: 9 }, at(9, 5))).toBe(false);
      expect(dueNow({ recurrence: "monthly", dayOfMonth: 15, atHour: 9 }, at(9, 2, 15))).toBe(true);
      expect(dueNow({ recurrence: "monthly", dayOfMonth: 15, atHour: 9 }, at(9, 2, 16))).toBe(false);
    });

    it("counts days across a month end and a leap year", () => {
      expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
      expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
      expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
      expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
    });
  });
});
