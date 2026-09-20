import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationRuleInput, AutomationTrigger, BoardColumn, ColumnType, Item } from "@/domain";
import { webhookUrlProblem } from "@/domain";
import { AutomationEngine } from "@/services/automation-engine";
import { createServices, type Services } from "@/services";

/**
 * The second wave of triggers and actions, each proved the same way as the
 * first: a write lands in the repositories, the queue notices, a runner
 * drains it. Where an action needs no trigger to be exercised it is run as a
 * quick run, which is the shortest path from "this action" to "this happened".
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
const DANH = SEED_USER_IDS.danh;
const JOANNE = SEED_USER_IDS.joanne;
let counter = 0;

describe("more triggers and actions", () => {
  let repos: LocalRepositories;
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `more-${Date.now()}-${counter}` });
    services = createServices(repos);
    // The seed's own writes raised events; the tests care about their own.
    for (const event of await repos.automations.claimEvents(5000)) await repos.automations.finishEvent(event.id, {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Melbourne, 9am, a Monday in September: the hour every scheduled test uses. */
  const NINE_AM = new Date("2026-09-20T23:00:00Z");

  function engine(at = NINE_AM): AutomationEngine {
    return new AutomationEngine(repos, services.items, services.comments, services.notifications, { timezone: "Australia/Melbourne", now: () => at });
  }

  async function column(name: string): Promise<BoardColumn> {
    const found = (await repos.boards.listColumns(BOARD)).find((c) => c.name === name);
    if (!found) throw new Error(`No column ${name}`);
    return found;
  }

  const addColumn = (name: string, type: ColumnType) => repos.boards.createColumn({ boardId: BOARD, name, type });

  const labelIdFor = (col: BoardColumn, name: string): string => {
    const settings = col.settings as { labels?: Array<{ id: string; name: string }> };
    const label = settings.labels?.find((l) => l.name === name);
    if (!label) throw new Error(`No label ${name}`);
    return label.id;
  };

  async function vocabulary() {
    return { columns: await repos.boards.listColumns(BOARD), groups: await repos.boards.listGroups(BOARD), users: await repos.users.list() };
  }

  async function addRule(trigger: AutomationTrigger, actions: AutomationAction[]) {
    const input: AutomationRuleInput = { workspaceId: SEED_WORKSPACE_ID, boardId: BOARD, name: "", enabled: true, trigger, conditionMatch: "all", conditions: [], actions, createdBy: DANH };
    return services.automations.create(input, await vocabulary());
  }

  /** Saves a quick run with these actions and fires it at the task, as Danh. */
  async function runOn(item: Item | null, actions: AutomationAction[]) {
    const rule = await addRule({ kind: "manual" }, actions);
    return services.automationEngine.runNow(rule.id, item ? [item.id] : [], DANH);
  }

  async function setValue(item: Item, col: BoardColumn, value: Parameters<Services["items"]["setValue"]>[2], actor = DANH) {
    const board = (await repos.boards.getById(BOARD))!;
    const fresh = (await repos.items.getById(item.id))!;
    return services.items.setValue(item.id, col.id, value, { column: col, item: fresh, board, users: await repos.users.list() }, actor);
  }

  const live = async () => (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null);
  const anItem = async () => (await live())[0]!;
  const withSubitems = async () => {
    const all = await repos.items.listByBoard(BOARD);
    return all.find((i) => i.parentItemId === null && all.some((c) => c.parentItemId === i.id))!;
  };
  const summaries = async () => (await repos.automations.listRuns(BOARD, 100)).map((r) => r.summary);

  // ---- triggers ------------------------------------------------------------

  it("hears a task being renamed", async () => {
    const item = await anItem();
    await addRule({ kind: "item_renamed" }, [{ kind: "add_comment", body: "Now called {item}" }]);
    await services.items.renameItem(item.id, "Something new", DANH);
    expect((await engine().drain(100)).ran).toBe(1);
    const comments = await repos.comments.listByItem(item.id);
    expect(comments.some((c) => c.body === "Now called Something new")).toBe(true);
  });

  it("hears a task coming back from the archive, and not the archiving itself", async () => {
    const item = await anItem();
    await addRule({ kind: "item_restored" }, [{ kind: "add_comment", body: "Back" }]);
    await services.items.archiveItems(BOARD, [item.id], DANH);
    expect((await engine().drain(100)).ran).toBe(0);
    await services.items.restoreItems([item.id], DANH);
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears a subitem being added, but not a top-level task", async () => {
    const parent = await anItem();
    await addRule({ kind: "subitem_created" }, [{ kind: "add_comment", body: "Sub" }]);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, name: "Top level" }, DANH);
    expect((await engine().drain(100)).ran).toBe(0);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, parentItemId: parent.id, name: "Under it" }, DANH);
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears a task leaving a group", async () => {
    const item = await anItem();
    const elsewhere = (await repos.boards.listGroups(BOARD)).find((g) => g.id !== item.groupId)!;
    await addRule({ kind: "item_moved_from_group", groupId: item.groupId }, [{ kind: "add_comment", body: "Left" }]);
    await services.items.moveItemsToGroup(BOARD, [item.id], elsewhere.id, DANH);
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears somebody being taken off a people column, and not somebody being added", async () => {
    const item = await anItem();
    const owner = await column("Owner");
    await addRule({ kind: "person_unassigned", columnId: owner.id, userId: JOANNE }, [{ kind: "add_comment", body: "Gone" }]);
    await setValue(item, owner, { type: "PERSON", userIds: [DANH, JOANNE] });
    expect((await engine().drain(100)).ran).toBe(0);
    await setValue(item, owner, { type: "PERSON", userIds: [DANH] });
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears a column being emptied, and not one being filled", async () => {
    const item = await anItem();
    const due = await column("Due Date");
    await addRule({ kind: "column_cleared", columnId: due.id }, [{ kind: "add_comment", body: "Undated" }]);
    await setValue(item, due, { type: "DATE", date: "2027-01-01" });
    expect((await engine().drain(100)).ran).toBe(0);
    await setValue(item, due, { type: "DATE", date: null });
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears a number crossing a line once, not every step beyond it", async () => {
    const item = await anItem();
    const budget = await addColumn("Budget", "NUMBER");
    await addRule({ kind: "number_crosses", columnId: budget.id, direction: "above", threshold: 100 }, [{ kind: "add_comment", body: "Over" }]);
    await setValue(item, budget, { type: "NUMBER", number: 50 });
    expect((await engine().drain(100)).ran).toBe(0);
    await setValue(item, budget, { type: "NUMBER", number: 150 });
    expect((await engine().drain(100)).ran).toBe(1);
    await setValue(item, budget, { type: "NUMBER", number: 200 });
    expect((await engine().drain(100)).ran).toBe(0);
    await setValue(item, budget, { type: "NUMBER", number: 90 });
    await setValue(item, budget, { type: "NUMBER", number: 101 });
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("flags a column that has sat still, once per stretch of stillness", async () => {
    const status = await column("Status");
    await addRule({ kind: "column_unchanged_for", columnId: status.id, days: 7, atHour: 9 }, [{ kind: "add_comment", body: "Still" }]);
    // The seed wrote every value moments ago; a runner a month on finds them all stale.
    const later = new Date("2026-10-20T22:00:00Z"); // 9am Melbourne, after the clocks change.
    const first = await engine(later).drain(100);
    expect(first.scheduled).toBeGreaterThan(0);
    // The next morning nothing has moved, so nothing is flagged again.
    expect((await engine(new Date("2026-10-21T22:00:00Z")).drain(100)).scheduled).toBe(0);
    // Touch one and it starts a new stretch; a month later that one alone is flagged.
    const item = await anItem();
    await setValue(item, status, { type: "STATUS", labelId: labelIdFor(status, "Stuck") });
    for (const event of await repos.automations.claimEvents(100)) await repos.automations.finishEvent(event.id, {});
    expect((await engine(new Date("2026-11-20T22:00:00Z")).drain(100)).scheduled).toBe(1);
  });

  it("wakes only at its hour", async () => {
    const status = await column("Status");
    await addRule({ kind: "column_unchanged_for", columnId: status.id, days: 7, atHour: 9 }, [{ kind: "add_comment", body: "Still" }]);
    expect((await engine(new Date("2026-10-20T23:00:00Z")).drain(100)).scheduled).toBe(0); // 10am
  });

  // ---- actions -------------------------------------------------------------

  it("renames a task from a template", async () => {
    const item = await anItem();
    await runOn(item, [{ kind: "set_name", name: "Reviewed: {item}" }]);
    expect((await repos.items.getById(item.id))!.name).toBe(`Reviewed: ${item.name}`);
  });

  it("sets and clears a description", async () => {
    const item = await anItem();
    await runOn(item, [{ kind: "set_description", text: "From {board}" }]);
    expect((await repos.items.getById(item.id))!.description).toBe("From RMITinerary 2026");
    await runOn(item, [{ kind: "set_description", text: "" }]);
    expect((await repos.items.getById(item.id))!.description).toBeNull();
  });

  it("copies one column onto another of the same type, and refuses different types", async () => {
    const item = await anItem();
    const due = await column("Due Date");
    const review = await addColumn("Review date", "DATE");
    await setValue(item, due, { type: "DATE", date: "2027-03-03" });
    await runOn(item, [{ kind: "copy_value", fromColumnId: due.id, toColumnId: review.id }]);
    const copied = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === review.id)?.value;
    expect(copied).toEqual({ type: "DATE", date: "2027-03-03" });

    const timeline = await column("Timeline");
    await expect(addRule({ kind: "manual" }, [{ kind: "copy_value", fromColumnId: due.id, toColumnId: timeline.id }])).rejects.toThrow(/different kinds/);
  });

  it("adds to a number, treating an empty cell as nought", async () => {
    const item = await anItem();
    const budget = await addColumn("Budget", "NUMBER");
    await runOn(item, [{ kind: "adjust_number", columnId: budget.id, delta: 5 }]);
    await runOn(item, [{ kind: "adjust_number", columnId: budget.id, delta: -2 }]);
    const value = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === budget.id)?.value;
    expect(value).toEqual({ type: "NUMBER", number: 3 });
  });

  it("adds and removes tags without disturbing the rest", async () => {
    const item = await anItem();
    const tags = await addColumn("Tags", "TAGS");
    await setValue(item, tags, { type: "TAGS", tags: ["print"] });
    await runOn(item, [{ kind: "add_tags", columnId: tags.id, tags: ["urgent", " print "] }]);
    let value = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === tags.id)?.value;
    expect(value).toEqual({ type: "TAGS", tags: ["print", "urgent"] });
    await runOn(item, [{ kind: "remove_tags", columnId: tags.id, tags: ["print"] }]);
    value = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === tags.id)?.value;
    expect(value).toEqual({ type: "TAGS", tags: ["urgent"] });
  });

  it("sets a column on every subitem, and on the parent", async () => {
    const parent = await withSubitems();
    const status = await column("Status");
    const priority = await column("Priority");
    const stuck = labelIdFor(status, "Stuck");
    const report = await runOn(parent, [{ kind: "set_subitems_value", columnId: status.id, value: { type: "STATUS", labelId: stuck } }]);
    expect(report.ran).toBe(1);
    const children = (await repos.items.listByBoard(BOARD)).filter((i) => i.parentItemId === parent.id);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      const value = (await repos.items.listValuesByItem(child.id)).find((v) => v.columnId === status.id)?.value;
      expect(value).toEqual({ type: "STATUS", labelId: stuck });
    }

    const critical = labelIdFor(priority, "Critical");
    await runOn(children[0]!, [{ kind: "set_parent_value", columnId: priority.id, value: { type: "PRIORITY", labelId: critical } }]);
    const parentPriority = (await repos.items.listValuesByItem(parent.id)).find((v) => v.columnId === priority.id)?.value;
    expect(parentPriority).toEqual({ type: "PRIORITY", labelId: critical });
    expect(await summaries()).toContain(`Set Priority on "${parent.name}"`);
  });

  it("says so rather than failing when a task has no parent or no subitems", async () => {
    const item = (await live()).find((i) => i.name === "Cover concept – final artwork")!;
    const status = await column("Status");
    await runOn(item, [
      { kind: "set_parent_value", columnId: status.id, value: { type: "STATUS", labelId: null } },
      { kind: "set_subitems_value", columnId: status.id, value: { type: "STATUS", labelId: null } },
    ]);
    const words = await summaries();
    expect(words).toContain("No parent task");
    expect(words).toContain("No subitems");
  });

  it("duplicates and restores", async () => {
    const item = await anItem();
    await runOn(item, [{ kind: "duplicate_item" }]);
    expect((await repos.items.listByBoard(BOARD)).some((i) => i.name === `${item.name} (copy)`)).toBe(true);

    await services.items.archiveItems(BOARD, [item.id], DANH);
    await runOn(item, [{ kind: "restore_item" }]);
    expect((await repos.items.getById(item.id))!.archivedAt).toBeNull();
  });

  it("tells a person named by name even when they set the rule off, and everybody in a chosen column", async () => {
    const item = await anItem();
    const owner = await column("Owner");
    await setValue(item, owner, { type: "PERSON", userIds: [JOANNE] });
    const before = (await repos.notifications.listByUser(DANH)).length;
    const joanneBefore = (await repos.notifications.listByUser(JOANNE)).length;

    await runOn(item, [
      { kind: "notify", audience: "specific", userIds: [DANH], message: "For you" },
      { kind: "notify", audience: "column", columnId: owner.id, message: "For the owner" },
    ]);

    expect((await repos.notifications.listByUser(DANH)).length).toBe(before + 1);
    expect((await repos.notifications.listByUser(JOANNE)).length).toBe(joanneBefore + 1);
    expect(await summaries()).toContain("Told 1 person");
  });

  it("puts the task's creator on it", async () => {
    const item = (await live()).find((i) => i.createdBy === JOANNE)!;
    const owner = await column("Owner");
    await setValue(item, owner, { type: "PERSON", userIds: [] });
    await runOn(item, [{ kind: "assign_person", columnId: owner.id, userIds: [], useCreator: true }]);
    const value = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === owner.id)?.value;
    expect(value).toEqual({ type: "PERSON", userIds: [JOANNE] });
  });

  // ---- webhooks --------------------------------------------------------------

  it("refuses webhook addresses that are not https, or point inside", () => {
    expect(webhookUrlProblem("http://example.com/hook")).toMatch(/https/);
    expect(webhookUrlProblem("https://localhost/hook")).toMatch(/this server/);
    expect(webhookUrlProblem("https://10.0.0.4/hook")).toMatch(/private/);
    expect(webhookUrlProblem("https://192.168.1.1/hook")).toMatch(/private/);
    expect(webhookUrlProblem("https://169.254.169.254/latest/meta-data")).toMatch(/private/);
    expect(webhookUrlProblem("https://user:pw@example.com/hook")).toMatch(/username/);
    expect(webhookUrlProblem("not a url")).toMatch(/not a web address/);
    expect(webhookUrlProblem("https://hooks.example.com/abc")).toBeNull();
  });

  it("will not save a rule with a refused address", async () => {
    await expect(addRule({ kind: "manual" }, [{ kind: "send_webhook", url: "http://example.com" }])).rejects.toThrow(/https/);
  });

  it("posts what happened, and marks a bad answer failed", async () => {
    const item = await anItem();
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const report = await runOn(item, [{ kind: "send_webhook", url: "https://hooks.example.com/abc" }]);
    expect(report.ran).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/abc");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    const body = JSON.parse(String(init.body)) as { event: string; item: { name: string }; cells: Record<string, string>; board: { name: string } };
    expect(body.event).toBe("manual");
    expect(body.item.name).toBe(item.name);
    expect(body.board.name).toBe("RMITinerary 2026");
    expect(Object.keys(body.cells)).toContain("Status");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const failed = await runOn(item, [{ kind: "send_webhook", url: "https://hooks.example.com/abc" }]);
    expect(failed.failed).toBe(1);
    expect((await repos.automations.listRuns(BOARD, 10)).some((r) => r.status === "failed" && /500/.test(r.detail ?? ""))).toBe(true);
  });

  // ---- keywords ---------------------------------------------------------------

  it("hears a name that contains one of its words, when a task is added or renamed", async () => {
    const item = await anItem();
    await addRule({ kind: "name_contains", text: "urgent, ASAP" }, [{ kind: "add_comment", body: "Flagged" }]);
    await services.items.createItem({ boardId: BOARD, groupId: item.groupId, name: "Calm and quiet" }, DANH);
    expect((await engine().drain(100)).ran).toBe(0);
    await services.items.createItem({ boardId: BOARD, groupId: item.groupId, name: "asap: campus banners" }, DANH);
    expect((await engine().drain(100)).ran).toBe(1);
    await services.items.renameItem(item.id, "Urgent reprint", DANH);
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears an update that mentions a word, through its markup", async () => {
    const item = await anItem();
    const users = await repos.users.list();
    await addRule({ kind: "comment_contains", text: "invoice" }, [{ kind: "add_comment", body: "Noted" }]);
    await services.comments.addComment(item.id, "All good here", DANH, users);
    expect((await engine().drain(100)).ran).toBe(0);
    await services.comments.addComment(item.id, "Please send the <b>Invoice</b> today", DANH, users);
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("hears a text column that comes to contain a word", async () => {
    const item = await anItem();
    const notes = await column("Notes");
    await addRule({ kind: "column_contains", columnId: notes.id, text: "printer" }, [{ kind: "add_comment", body: "Printer" }]);
    await setValue(item, notes, { type: "TEXT", text: "Waiting on copy" });
    expect((await engine().drain(100)).ran).toBe(0);
    await setValue(item, notes, { type: "TEXT", text: "Call the PRINTER about stock" });
    expect((await engine().drain(100)).ran).toBe(1);
  });

  it("refuses a keyword rule with no words, or on a column that holds none", async () => {
    await expect(addRule({ kind: "name_contains", text: " , " }, [{ kind: "add_comment", body: "x" }])).rejects.toThrow(/word/);
    const status = await column("Status");
    await expect(addRule({ kind: "column_contains", columnId: status.id, text: "done" }, [{ kind: "add_comment", body: "x" }])).rejects.toThrow(/words to search/);
  });

  it("lets a recurring rule call a webhook, and nothing else new", async () => {
    await expect(addRule({ kind: "recurring", recurrence: "daily", atHour: 9 }, [{ kind: "send_webhook", url: "https://hooks.example.com/abc" }])).resolves.toBeTruthy();
    await expect(addRule({ kind: "recurring", recurrence: "daily", atHour: 9 }, [{ kind: "set_name", name: "x" }])).rejects.toThrow(/schedule/);
  });
});
