import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationCondition, AutomationRuleInput, AutomationTrigger, BoardColumn, Item } from "@/domain";
import { MAX_EVENT_DEPTH } from "@/domain";
import { AutomationEngine } from "@/services/automation-engine";
import { createServices, type Services } from "@/services";

/**
 * Subitems, and what a rule may and may not do with them.
 *
 * A subitem is a task with a parent, and most of the feature treats it as
 * exactly that: it has its own cells, its own updates, its own dates. Where
 * the two differ is in the things a subitem cannot do on its own — move to a
 * group, hold subitems, go to the archive without its parent noticing — and
 * in the ways a parent and its children can wake each other. These pin the
 * constraints down one at a time.
 */

const BOARD = SEED_BOARD_IDS.rmitinerary;
const OTHER_BOARD = SEED_BOARD_IDS.sem1;
const DANH = SEED_USER_IDS.danh;
let counter = 0;

describe("automations and subitems", () => {
  let repos: LocalRepositories;
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `subitems-${Date.now()}-${counter}` });
    services = createServices(repos);
    for (const event of await repos.automations.claimEvents(5000)) await repos.automations.finishEvent(event.id, {});
  });

  const engine = () => new AutomationEngine(repos, services.items, services.comments, services.notifications, { timezone: "Australia/Melbourne", now: () => new Date("2026-09-20T23:00:00Z") });

  async function column(name: string): Promise<BoardColumn> {
    const found = (await repos.boards.listColumns(BOARD)).find((c) => c.name === name);
    if (!found) throw new Error(`No column ${name}`);
    return found;
  }
  const labelIdFor = (col: BoardColumn, name: string): string => {
    const label = (col.settings as { labels?: Array<{ id: string; name: string }> }).labels?.find((l) => l.name === name);
    if (!label) throw new Error(`No label ${name}`);
    return label.id;
  };
  async function addRule(trigger: AutomationTrigger, actions: AutomationAction[], conditions: AutomationCondition[] = []) {
    const input: AutomationRuleInput = { workspaceId: SEED_WORKSPACE_ID, boardId: BOARD, name: "", enabled: true, trigger, conditionMatch: "all", conditions, actions, createdBy: DANH };
    return services.automations.create(input, { columns: await repos.boards.listColumns(BOARD), groups: await repos.boards.listGroups(BOARD), users: await repos.users.list() });
  }
  async function runOn(item: Item, actions: AutomationAction[]) {
    const rule = await addRule({ kind: "manual" }, actions);
    return services.automationEngine.runNow(rule.id, [item.id], DANH);
  }
  async function setValue(item: Item, col: BoardColumn, value: Parameters<Services["items"]["setValue"]>[2]) {
    const board = (await repos.boards.getById(BOARD))!;
    const fresh = (await repos.items.getById(item.id))!;
    return services.items.setValue(item.id, col.id, value, { column: col, item: fresh, board, users: await repos.users.list() }, DANH);
  }
  const all = () => repos.items.listByBoard(BOARD, { includeArchived: true });
  const childrenOf = async (parent: Item) => (await all()).filter((i) => i.parentItemId === parent.id);
  const withSubitems = async () => {
    const items = await all();
    return items.find((i) => i.parentItemId === null && i.archivedAt === null && items.some((c) => c.parentItemId === i.id))!;
  };
  const summaries = async () => (await repos.automations.listRuns(BOARD, 200)).map((r) => r.summary);
  const drainAll = async () => {
    for (let pass = 0; pass < 12; pass += 1) if ((await engine().drain(100)).events === 0) break;
  };

  // ---- moves -----------------------------------------------------------------

  it("hears a parent's move once, not once more per subitem that went with it", async () => {
    const parent = await withSubitems();
    const kids = await childrenOf(parent);
    expect(kids.length).toBeGreaterThan(1);
    const elsewhere = (await repos.boards.listGroups(BOARD)).find((g) => g.id !== parent.groupId)!;
    await addRule({ kind: "item_moved_to_group", groupId: elsewhere.id }, [{ kind: "add_comment", body: "Moved" }]);
    await addRule({ kind: "item_moved_from_group", groupId: parent.groupId }, [{ kind: "add_comment", body: "Left" }]);

    await services.items.moveItemsToGroup(BOARD, [parent.id], elsewhere.id, DANH);
    // Every subitem raised a move of its own; only the parent's counts.
    const report = await engine().drain(100);
    expect(report.events).toBe(1 + kids.length);
    expect(report.ran).toBe(2);
    for (const kid of await childrenOf(parent)) expect(kid.groupId).toBe(elsewhere.id);
  });

  it("will not move a subitem away from its parent", async () => {
    const parent = await withSubitems();
    const [kid] = await childrenOf(parent);
    const elsewhere = (await repos.boards.listGroups(BOARD)).find((g) => g.id !== parent.groupId)!;
    const report = await runOn(kid!, [{ kind: "move_to_group", groupId: elsewhere.id }]);
    expect(report.ran).toBe(1);
    expect(await summaries()).toContain("Subitems stay with their parent");
    expect((await repos.items.getById(kid!.id))!.groupId).toBe(parent.groupId);
  });

  // ---- nesting -----------------------------------------------------------------

  it("will not give a subitem subitems of its own", async () => {
    const parent = await withSubitems();
    const [kid] = await childrenOf(parent);
    const before = (await all()).length;
    await runOn(kid!, [{ kind: "create_subitem", name: "Nested" }]);
    expect(await summaries()).toContain("A subitem cannot have subitems of its own");
    expect((await all()).length).toBe(before);
  });

  it("refuses a rule that would add tasks to the board it is woken by", async () => {
    await expect(addRule({ kind: "item_created" }, [{ kind: "create_subitem", name: "Check {item}" }])).rejects.toThrow(/set it off again/);
    await expect(addRule({ kind: "subitem_created" }, [{ kind: "duplicate_item" }])).rejects.toThrow(/set it off again/);
    await expect(addRule({ kind: "name_contains", text: "urgent" }, [{ kind: "create_item", name: "Follow up" }])).rejects.toThrow(/set it off again/);
    // Another board is fine: nothing it adds there can wake this rule.
    const groups = await repos.boards.listGroups(OTHER_BOARD);
    await expect(addRule({ kind: "item_created" }, [{ kind: "create_item", boardId: OTHER_BOARD, groupId: groups[0]!.id, name: "Mirror {item}" }])).resolves.toBeTruthy();
    // And a rule woken by something else may add here.
    const status = await column("Status");
    await expect(addRule({ kind: "column_set_to", columnId: status.id, labelId: labelIdFor(status, "Done") }, [{ kind: "create_subitem", name: "Wrap up" }])).resolves.toBeTruthy();
  });

  // ---- the archive ---------------------------------------------------------------

  it("archives a task with its live subitems, and restores the ones that went with it", async () => {
    const parent = await withSubitems();
    const kids = await childrenOf(parent);
    // One subitem was put away earlier, on its own; it must stay put.
    await services.items.archiveItems(BOARD, [kids[0]!.id], DANH);
    const earlier = (await repos.items.getById(kids[0]!.id))!.archivedAt;

    await runOn(parent, [{ kind: "archive_item" }]);
    const archived = await childrenOf(parent);
    expect(archived.every((k) => k.archivedAt !== null)).toBe(true);
    expect(await summaries()).toContain(`Archived the task and ${kids.length - 1} subitems`);

    await runOn(parent, [{ kind: "restore_item" }]);
    const after = await childrenOf(parent);
    expect((await repos.items.getById(parent.id))!.archivedAt).toBeNull();
    expect(after.filter((k) => k.id !== kids[0]!.id).every((k) => k.archivedAt === null)).toBe(true);
    expect(after.find((k) => k.id === kids[0]!.id)!.archivedAt).toBe(earlier);
  });

  // ---- parents and children waking each other ---------------------------------------------

  it("counts a write to the subitems as one more link of the chain", async () => {
    const parent = await withSubitems();
    const status = await column("Status");
    const stuck = labelIdFor(status, "Stuck");
    await addRule({ kind: "column_set_to", columnId: status.id, labelId: stuck }, [{ kind: "set_subitems_value", columnId: status.id, value: { type: "STATUS", labelId: stuck } }], [{ kind: "item_kind", is: "item" }]);

    await setValue(parent, status, { type: "STATUS", labelId: stuck });
    await engine().drain(100);
    // The children's changes are on the queue one level deeper than the parent's.
    const raised = await repos.automations.claimEvents(100);
    const kids = await childrenOf(parent);
    expect(raised.filter((e) => kids.some((k) => k.id === e.itemId)).every((e) => e.depth === 1)).toBe(true);
    expect(raised.length).toBeGreaterThan(0);
  });

  it("cuts a parent and its subitems answering each other at the usual depth", async () => {
    const parent = await withSubitems();
    const status = await column("Status");
    const priority = await column("Priority");
    const stuck = labelIdFor(status, "Stuck");
    const critical = labelIdFor(priority, "Critical");
    const low = labelIdFor(priority, "Low");
    // Down: a stuck parent marks its subitems stuck. Up: a stuck subitem
    // flips the parent's priority; the parent's priority change re-marks the
    // subitems' priority… and so on, until the chain is cut.
    await addRule({ kind: "column_set_to", columnId: status.id, labelId: stuck }, [{ kind: "set_subitems_value", columnId: status.id, value: { type: "STATUS", labelId: stuck } }], [{ kind: "item_kind", is: "item" }]);
    await addRule({ kind: "column_set_to", columnId: status.id, labelId: stuck }, [{ kind: "set_parent_value", columnId: priority.id, value: { type: "PRIORITY", labelId: critical } }], [{ kind: "item_kind", is: "subitem" }]);
    await addRule({ kind: "column_changed", columnId: priority.id }, [{ kind: "set_subitems_value", columnId: priority.id, value: { type: "PRIORITY", labelId: low } }], [{ kind: "item_kind", is: "item" }]);
    await addRule({ kind: "column_changed", columnId: priority.id }, [{ kind: "set_parent_value", columnId: priority.id, value: { type: "PRIORITY", labelId: critical } }], [{ kind: "item_kind", is: "subitem" }]);

    await setValue(parent, status, { type: "STATUS", labelId: stuck });
    await drainAll();

    const runs = await repos.automations.listRuns(BOARD, 500);
    expect(runs.some((r) => r.summary.includes("too many automations"))).toBe(true);
    expect(runs.length).toBeLessThan(200);
    expect((await repos.automations.claimEvents(10)).length).toBe(0);
    expect(MAX_EVENT_DEPTH).toBe(3);
  });

  // ---- which tasks a trigger means ----------------------------------------------------

  it("lets 'a task is added' be narrowed to top-level tasks with the item-kind condition", async () => {
    const parent = await withSubitems();
    await addRule({ kind: "item_created" }, [{ kind: "add_comment", body: "Welcome" }], [{ kind: "item_kind", is: "item" }]);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, parentItemId: parent.id, name: "A subitem" }, DANH);
    let report = await engine().drain(100);
    expect(report.ran).toBe(0);
    expect(report.skipped).toBe(1);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, name: "A task" }, DANH);
    report = await engine().drain(100);
    expect(report.ran).toBe(1);
  });

  it("lets a subitem finish its parent, and only a subitem", async () => {
    const parent = await withSubitems();
    const status = await column("Status");
    const done = labelIdFor(status, "Done");
    await addRule({ kind: "subitem_created" }, [{ kind: "set_parent_value", columnId: status.id, value: { type: "STATUS", labelId: done } }]);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, name: "Top level" }, DANH);
    expect((await engine().drain(100)).ran).toBe(0);
    await services.items.createItem({ boardId: BOARD, groupId: parent.groupId, parentItemId: parent.id, name: "Under it" }, DANH);
    expect((await engine().drain(100)).ran).toBe(1);
    const value = (await repos.items.listValuesByItem(parent.id)).find((v) => v.columnId === status.id)?.value;
    expect(value).toEqual({ type: "STATUS", labelId: done });
  });

  it("reminds about a subitem's own date, since a subitem's deadline is a deadline", async () => {
    const parent = await withSubitems();
    const [kid] = await childrenOf(parent);
    const due = await column("Due Date");
    await setValue(kid!, due, { type: "DATE", date: "2026-09-23" });
    await addRule({ kind: "date_arrives", columnId: due.id, offsetDays: -2, atHour: 9 }, [{ kind: "notify", audience: "board_owners", message: "{item} is due soon" }]);
    for (const event of await repos.automations.claimEvents(100)) await repos.automations.finishEvent(event.id, {});
    const report = await engine().drain(100);
    expect(report.scheduled).toBeGreaterThanOrEqual(1);
    const runs = await repos.automations.listRuns(BOARD, 50);
    expect(runs.some((r) => r.itemId === kid!.id)).toBe(true);
  });

  it("duplicates a subitem beside itself, under the same parent", async () => {
    const parent = await withSubitems();
    const [kid] = await childrenOf(parent);
    await runOn(kid!, [{ kind: "duplicate_item" }]);
    const copies = (await childrenOf(parent)).filter((k) => k.name === `${kid!.name} (copy)`);
    expect(copies).toHaveLength(1);
    expect(copies[0]!.parentItemId).toBe(parent.id);
  });
});
