import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationRuleInput, AutomationTrigger, BoardColumn } from "@/domain";
import { MAX_EVENT_DEPTH } from "@/domain";
import { AutomationEngine } from "@/services/automation-engine";
import { authoriseRunner } from "@/server/automations";
import { HttpError } from "@/server/http";
import { createServices, type Services } from "@/services";

/**
 * The runner as an operator meets it: who may set it going, what one tick
 * reports, and how it behaves when it is run twice, run late, or run against a
 * rule somebody has switched off.
 *
 * Separate from automations.test.ts, which is about what rules mean. This file
 * is about the thing that calls them when nobody is there.
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
let counter = 0;

describe("the automation runner", () => {
  let repos: LocalRepositories;
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `runner-${Date.now()}-${counter}` });
    services = createServices(repos);
    for (const event of await repos.automations.claimEvents(5000)) await repos.automations.finishEvent(event.id, {});
  });

  function engine(at = new Date("2026-09-21T03:00:00Z")): AutomationEngine {
    return new AutomationEngine(repos, services.items, services.comments, services.notifications, {
      timezone: "Australia/Melbourne",
      now: () => at,
    });
  }

  async function column(name: string): Promise<BoardColumn> {
    const found = (await repos.boards.listColumns(BOARD)).find((c) => c.name === name);
    if (!found) throw new Error(`No column ${name}`);
    return found;
  }

  const labelIdFor = (col: BoardColumn, name: string): string => {
    const settings = col.settings as { labels?: Array<{ id: string; name: string }> };
    const label = settings.labels?.find((l) => l.name === name);
    if (!label) throw new Error(`No label ${name}`);
    return label.id;
  };

  async function addRule(trigger: AutomationTrigger, actions: AutomationAction[], enabled = true) {
    const input: AutomationRuleInput = {
      workspaceId: SEED_WORKSPACE_ID,
      boardId: BOARD,
      name: "",
      enabled,
      trigger,
      conditionMatch: "all",
      conditions: [],
      actions,
      createdBy: SEED_USER_IDS.danh,
    };
    return services.automations.create(input, {
      columns: await repos.boards.listColumns(BOARD),
      groups: await repos.boards.listGroups(BOARD),
      users: await repos.users.list(),
    });
  }

  async function setStatus(itemId: string, labelName: string) {
    const status = await column("Status");
    const board = (await repos.boards.getById(BOARD))!;
    const item = (await repos.items.getById(itemId))!;
    return services.items.setValue(
      itemId,
      status.id,
      { type: "STATUS", labelId: labelIdFor(status, labelName) },
      { column: status, item, board, users: await repos.users.list() },
      SEED_USER_IDS.danh,
    );
  }

  const anItem = async () => (await repos.items.listByBoard(BOARD)).find((i) => i.archivedAt === null && i.parentItemId === null)!;

  // ---- who may start it ----------------------------------------------------

  describe("who may set it going", () => {
    const original = { ...process.env };
    afterEach(() => {
      process.env.AUTOMATION_SECRET = original.AUTOMATION_SECRET;
      process.env.CRON_SECRET = original.CRON_SECRET;
    });

    const request = (headers: Record<string, string>) => new Request("https://example.test/api/automations/run", { headers });

    it("accepts the shared secret as a bearer token", () => {
      process.env.AUTOMATION_SECRET = "a-long-enough-secret";
      expect(() => authoriseRunner(request({ authorization: "Bearer a-long-enough-secret" }))).not.toThrow();
    });

    it("accepts it in a header, for callers that cannot send Authorization", () => {
      process.env.AUTOMATION_SECRET = "a-long-enough-secret";
      expect(() => authoriseRunner(request({ "x-automation-secret": "a-long-enough-secret" }))).not.toThrow();
    });

    it("refuses a wrong secret, a missing one, and one of the wrong length", () => {
      process.env.AUTOMATION_SECRET = "a-long-enough-secret";
      expect(() => authoriseRunner(request({ authorization: "Bearer nope" }))).toThrow(HttpError);
      expect(() => authoriseRunner(request({}))).toThrow(HttpError);
      expect(() => authoriseRunner(request({ authorization: "Bearer a-long-enough-secre" }))).toThrow(HttpError);
    });

    it("refuses everybody when no secret is configured, forged cron header included", () => {
      delete process.env.AUTOMATION_SECRET;
      delete process.env.CRON_SECRET;
      // `x-vercel-cron` is just a header, so a stranger can send one. A drain
      // endpoint that believed it would be a way to make this database work for
      // free, held down by anybody who found the URL.
      expect(() => authoriseRunner(request({ "x-vercel-cron": "1" }))).toThrow(/not configured/);
      expect(() => authoriseRunner(request({}))).toThrow(/not configured/);
    });

    it("takes CRON_SECRET too, which is what Vercel's scheduler is configured with", () => {
      delete process.env.AUTOMATION_SECRET;
      process.env.CRON_SECRET = "vercel-side-secret";
      expect(() => authoriseRunner(request({ authorization: "Bearer vercel-side-secret" }))).not.toThrow();
    });
  });

  // ---- what a tick does ----------------------------------------------------

  it("reports what it did, so a cron log says something useful", async () => {
    const item = await anItem();
    await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "Status moved" }]);
    await setStatus(item.id, "Done");

    const report = await engine().drain(100);

    expect(report).toMatchObject({ ran: 1, failed: 0, skipped: 0 });
    expect(report.events).toBeGreaterThan(0);
  });

  it("does nothing at all when there is nothing waiting", async () => {
    expect(await engine().drain(100)).toMatchObject({ events: 0, scheduled: 0, ran: 0, skipped: 0, failed: 0 });
  });

  it("never acts on the same event twice, however often it is run", async () => {
    const item = await anItem();
    await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "Once" }]);
    await setStatus(item.id, "Done");

    const runner = engine();
    await runner.drain(100);
    await runner.drain(100);
    await runner.drain(100);

    expect((await repos.comments.listByItem(item.id)).filter((c) => c.body === "Once")).toHaveLength(1);
  });

  it("leaves a switched-off rule alone, and picks it up again once it is on", async () => {
    const item = await anItem();
    const rule = await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "Back on" }], false);

    await setStatus(item.id, "Done");
    expect((await engine().drain(100)).ran).toBe(0);

    await services.automations.setEnabled(rule.id, true);
    await setStatus(item.id, "In Progress");
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("carries on past a rule that fails, and records why", async () => {
    const item = await anItem();
    const status = await column("Status");
    const rule = await addRule({ kind: "column_changed", columnId: status.id }, [{ kind: "add_comment", body: "Still here" }]);

    // A column deleted after the rule was written: the commonest way an
    // automation breaks, and the one a person needs told about.
    const doomed = await addRule({ kind: "column_changed", columnId: status.id }, [{ kind: "clear_value", columnId: (await column("Notes")).id }]);
    await repos.boards.deleteColumn((await column("Notes")).id);

    await setStatus(item.id, "Done");
    const report = await engine().drain(100);

    expect(report.failed).toBe(1);
    expect(report.ran).toBe(1);
    const runs = await repos.automations.listRunsByRule(doomed.id, 5);
    expect(runs[0]?.status).toBe("failed");
    expect(runs[0]?.detail).toContain("no longer on this board");
    // The healthy rule still ran, and its own record is clean.
    expect((await repos.automations.getRule(rule.id))?.lastError).toBeNull();
  });

  it("counts a rule's firings and remembers when it last went off", async () => {
    const item = await anItem();
    const rule = await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "tick" }]);

    await setStatus(item.id, "Done");
    await engine(new Date("2026-09-21T03:00:00Z")).drain(100);
    await setStatus(item.id, "In Progress");
    await engine(new Date("2026-09-21T04:00:00Z")).drain(100);

    const stored = await repos.automations.getRule(rule.id);
    expect(stored?.runCount).toBe(2);
    expect(stored?.lastRunAt).toBe("2026-09-21T04:00:00.000Z");
  });

  it("works through a backlog a batch at a time rather than choking on it", async () => {
    const items = (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null).slice(0, 6);
    await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "batched" }]);
    for (const item of items) await setStatus(item.id, "Done");

    const runner = engine();
    const first = await runner.drain(2);
    expect(first.events).toBe(2);
    // The rest are still waiting, not lost.
    expect((await repos.automations.claimEvents(100)).length).toBeGreaterThan(0);

    for (let pass = 0; pass < 10; pass += 1) await runner.drain(50);
    expect((await repos.automations.claimEvents(100)).length).toBe(0);
  });

  it("sweeps what it has already dealt with and keeps what it has not", async () => {
    const item = await anItem();
    await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "swept" }]);
    await setStatus(item.id, "Done");
    await engine().drain(100);

    // Nothing is a month old yet, so a sweep should take nothing.
    expect(await repos.automations.sweep(30)).toBe(0);
    expect((await repos.automations.listRuns(BOARD, 10)).length).toBeGreaterThan(0);

    // With a zero-day window, everything settled goes and the log with it.
    await repos.automations.sweep(0);
    expect(await repos.automations.listRuns(BOARD, 10)).toHaveLength(0);
  });

  it("stops a chain at the depth the domain says it should", async () => {
    // The guard is a domain constant rather than a number buried in the engine,
    // because it is a promise about behaviour: three automations off one edit.
    expect(MAX_EVENT_DEPTH).toBe(3);

    const due = await column("Due Date");
    const timeline = await column("Timeline");
    const item = await anItem();
    await addRule({ kind: "column_changed", columnId: due.id }, [{ kind: "shift_date", columnId: timeline.id, days: 1 }]);
    await addRule({ kind: "column_changed", columnId: timeline.id }, [{ kind: "shift_date", columnId: due.id, days: 1 }]);

    const board = (await repos.boards.getById(BOARD))!;
    const users = await repos.users.list();
    await services.items.setValue(item.id, timeline.id, { type: "TIMELINE", start: "2027-05-01", end: "2027-05-02" }, { column: timeline, item, board, users }, SEED_USER_IDS.danh);
    await services.items.setValue(item.id, due.id, { type: "DATE", date: "2027-05-10" }, { column: due, item, board, users }, SEED_USER_IDS.danh);

    const runner = engine();
    for (let pass = 0; pass < 12; pass += 1) await runner.drain(100);

    const runs = await repos.automations.listRuns(BOARD, 200);
    const cut = runs.filter((r) => r.summary.includes("too many automations"));
    expect(cut.length).toBeGreaterThan(0);
    expect(cut[0]?.status).toBe("skipped");
    // A bounded number of date shifts, not an unbounded one.
    expect(runs.filter((r) => r.status === "ran").length).toBeLessThan(12);
  });

  /**
   * The gap this closes: a board with rules and an empty log looks exactly the
   * same whether nothing matched or nothing has called the runner in a week,
   * and only the second needs a person. The heartbeat is the difference.
   */
  describe("the heartbeat", () => {
    it("is stamped even by a pass that finds nothing at all", async () => {
      expect(await repos.automations.readHeartbeat()).toBeNull();

      const report = await engine().drain(100);
      expect(report).toMatchObject({ events: 0, ran: 0 });

      const beat = await repos.automations.readHeartbeat();
      expect(beat).not.toBeNull();
      expect(beat).toMatchObject({ events: 0, scheduled: 0, ran: 0, skipped: 0, failed: 0 });
      expect(Date.parse(beat!.lastRunAt)).toBeGreaterThan(0);
    });

    it("carries what the last pass actually did", async () => {
      const item = await anItem();
      await addRule({ kind: "column_changed", columnId: (await column("Status")).id }, [{ kind: "add_comment", body: "beat" }]);
      await setStatus(item.id, "Done");

      await engine().drain(100);

      const beat = await repos.automations.readHeartbeat();
      expect(beat?.ran).toBe(1);
      expect(beat?.events).toBeGreaterThan(0);
    });

    it("moves on with every pass, so its age is the answer to whether anything is running", async () => {
      await engine(new Date("2026-09-21T03:00:00Z")).drain(100);
      const first = await repos.automations.readHeartbeat();
      await engine(new Date("2026-09-21T04:00:00Z")).drain(100);
      const second = await repos.automations.readHeartbeat();
      expect(Date.parse(second!.lastRunAt)).toBeGreaterThanOrEqual(Date.parse(first!.lastRunAt));
    });
  });

  it("tells the people on a task, and not whoever set the change off", async () => {
    const item = await anItem();
    const status = await column("Status");
    const people = (await repos.boards.listColumns(BOARD)).find((c) => c.type === "PERSON" || c.type === "PEOPLE");
    if (!people) return;
    const board = (await repos.boards.getById(BOARD))!;
    const users = await repos.users.list();
    await services.items.setValue(
      item.id,
      people.id,
      { type: "PERSON", userIds: [SEED_USER_IDS.danh, SEED_USER_IDS.emily] },
      { column: people, item, board, users },
      SEED_USER_IDS.danh,
    );
    for (const event of await repos.automations.claimEvents(500)) await repos.automations.finishEvent(event.id, {});

    await addRule({ kind: "column_changed", columnId: status.id }, [{ kind: "notify", audience: "people_on_item", message: "{item} moved on" }]);

    // The event is put on the queue by hand with an actor named, which is what
    // the database trigger does with auth.uid(). IndexedDB has no session to
    // read, so the local provider cannot name one — and who set a change off is
    // exactly what this assertion is about.
    await repos.automations.raise({
      boardId: BOARD,
      itemId: item.id,
      kind: "value_changed",
      columnId: status.id,
      actorId: SEED_USER_IDS.danh,
      payload: { before: null, after: { type: "STATUS", labelId: labelIdFor(status, "Done") } },
      depth: 0,
    });
    await engine().drain(100);

    const fromTheRule = (userId: string) =>
      repos.notifications.listByUser(userId).then((all) => all.filter((n) => n.title.includes("moved on")));

    expect(await fromTheRule(SEED_USER_IDS.emily)).toHaveLength(1);
    // Danh is on the task too, and set it off, so he hears nothing about it.
    expect(await fromTheRule(SEED_USER_IDS.danh)).toHaveLength(0);
  });
});
