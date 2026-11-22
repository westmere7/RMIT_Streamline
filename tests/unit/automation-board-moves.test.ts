import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories, type LocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { AutomationAction, AutomationTrigger, Board, BoardColumn, BoardGroup } from "@/domain";
import { intakeGroupOf } from "@/domain";
import { AutomationEngine } from "@/services/automation-engine";
import { AutomationError, createServices, type Services } from "@/services";

/**
 * Automations and tasks that change boards (allocating, re-allocating, Move to
 * board), and rules on Task Allocation (v0.149.0).
 *
 *  - A task that changes boards arrives on the new one as if created there,
 *    once (not once per subitem), and leaves the old one from its group.
 *  - A rule on the board it left may still tell people, but writes nothing
 *    into a task that is no longer there.
 *  - A rule queued before the task moved on is skipped, as "run now" skips it.
 *  - "Create a task" never lands in Booked by Form.
 */

const A = SEED_BOARD_IDS.rmitinerary;
let counter = 0;

describe("automations and tasks that change boards", () => {
  let repos: LocalRepositories;
  let services: Services;
  let B: Board;

  const engine = () => new AutomationEngine(repos, services.items, services.comments, services.notifications, { timezone: "Australia/Melbourne", now: () => new Date("2026-11-22T03:00:00Z") });
  const drainQuietly = async () => {
    for (const e of await repos.automations.claimEvents(1000)) await repos.automations.finishEvent(e.id, {});
  };
  const textColumn = async (boardId: string): Promise<BoardColumn> => (await repos.boards.listColumns(boardId)).find((c) => c.type === "TEXT")!;
  const groups = async (boardId: string): Promise<BoardGroup[]> => (await repos.boards.listGroups(boardId)).slice().sort((a, b) => a.position - b.position);
  const addRule = async (boardId: string, trigger: AutomationTrigger, actions: AutomationAction[]) =>
    services.automations.create(
      { workspaceId: SEED_WORKSPACE_ID, boardId, name: "", enabled: true, trigger, conditionMatch: "all", conditions: [], actions, createdBy: SEED_USER_IDS.danh },
      { columns: await repos.boards.listColumns(boardId), groups: await repos.boards.listGroups(boardId), users: await repos.users.list() },
    );
  const newTask = async (boardId: string, name = "Moving task") => services.items.createItem({ boardId, groupId: (await groups(boardId))[0]!.id, name }, SEED_USER_IDS.danh);
  const move = (itemId: string, boardId: string) => services.itemMoves.moveToBoard(itemId, boardId, SEED_USER_IDS.danh, {});
  const runs = async (boardId: string) => repos.automations.listRuns(boardId, 50);

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `automation-board-moves-${Date.now()}-${counter}` });
    services = createServices(repos);
    B = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && !b.archivedAt && b.id !== A && b.workspaceId === SEED_WORKSPACE_ID)!;
    await drainQuietly();
  });

  it("skips a rule queued before its task moved to another board, writing nothing into it", async () => {
    const text = await textColumn(A);
    await addRule(A, { kind: "item_created" }, [{ kind: "set_name", name: "{item} (touched)" }, { kind: "set_value", columnId: text.id, value: { type: "TEXT", text: "from A" } }]);
    const task = await newTask(A, "Probe");
    await move(task.id, B.id);
    await engine().drain(100);

    const after = (await repos.items.getById(task.id))!;
    expect(after.name).toBe("Probe");
    expect((await repos.items.listValuesByItem(task.id)).some((v) => v.columnId === text.id)).toBe(false);
    expect((await runs(A)).some((r) => r.status === "skipped" && r.summary === "Skipped: that task is on another board")).toBe(true);
  });

  it("treats arriving on a board as being created there, once for a task with subitems", async () => {
    const landing = (await groups(B.id))[0]!;
    await addRule(B.id, { kind: "item_created", groupId: landing.id }, [{ kind: "set_name", name: "{item} arrived" }]);
    const task = await newTask(A);
    await services.items.createItem({ boardId: A, groupId: task.groupId, parentItemId: task.id, name: "Sub one" }, SEED_USER_IDS.danh);
    await services.items.createItem({ boardId: A, groupId: task.groupId, parentItemId: task.id, name: "Sub two" }, SEED_USER_IDS.danh);
    await drainQuietly();

    await move(task.id, B.id);
    const report = await engine().drain(100);
    expect((await repos.items.getById(task.id))!.name).toBe("Moving task arrived");
    // The task's arrival ran the rule; its two subitems' did not.
    expect(report.ran).toBe(1);
  });

  it("lets a rule on the board a task left tell people, but not write into the task", async () => {
    const from = (await groups(A))[0]!;
    const text = await textColumn(A);
    await addRule(A, { kind: "item_moved_from_group", groupId: from.id }, [
      { kind: "notify", audience: "specific", userIds: [SEED_USER_IDS.danh], message: "{item} left" },
      { kind: "set_value", columnId: text.id, value: { type: "TEXT", text: "should not land" } },
    ]);
    const task = await newTask(A, "Leaver");
    await drainQuietly();

    await move(task.id, B.id);
    await engine().drain(100);
    const log = await runs(A);
    expect(log.some((r) => r.status === "ran" && r.summary.startsWith("Told"))).toBe(true);
    expect(log.some((r) => r.status === "skipped" && r.detail === "The task has left this board")).toBe(true);
    expect((await repos.items.listValuesByItem(task.id)).some((v) => v.columnId === text.id)).toBe(false);
  });

  it("still raises an ordinary move for a group change on one board", async () => {
    const [first, second] = await groups(A);
    await addRule(A, { kind: "item_moved_to_group", groupId: second!.id }, [{ kind: "set_name", name: "{item} moved" }]);
    const task = await newTask(A, "Mover");
    expect(task.groupId).toBe(first!.id);
    await drainQuietly();
    await services.items.moveItemsToGroup(A, [task.id], second!.id, SEED_USER_IDS.danh);
    await engine().drain(100);
    expect((await repos.items.getById(task.id))!.name).toBe("Mover moved");
  });

  it("never creates a task in Booked by Form: the rule falls back past it, and the builder refuses it", async () => {
    const system = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, SEED_USER_IDS.danh);
    const queue = system.board;
    const queueGroups = await repos.boards.listGroups(queue.id);
    const intake = intakeGroupOf(queueGroups)!;
    // A rule saved before this change, naming no group: it used to pick the first group, Booked by Form.
    const rule = await addRule(queue.id, { kind: "manual" }, [{ kind: "create_item", name: "Weekly sweep" }]);
    await engine().runNow(rule.id, [], SEED_USER_IDS.danh);
    const made = (await repos.items.listByBoard(queue.id)).find((i) => i.name === "Weekly sweep");
    expect(made).toBeDefined();
    expect(made!.groupId).not.toBe(intake.id);

    await expect(addRule(queue.id, { kind: "manual" }, [{ kind: "create_item", groupId: intake.id, name: "Into the intake" }])).rejects.toBeInstanceOf(AutomationError);
  });
});
