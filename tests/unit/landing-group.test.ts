import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BoardGroup } from "@/domain";
import { intakeGroupOf, landingGroupOf } from "@/domain";
import { createServices } from "@/services";

/**
 * A board's landing group (v0.156): where tasks from other boards land when
 * allocated, moved or booked straight onto it (a move may pick another group;
 * allocating may not). Always one per board, the chosen group else the first;
 * none on a built-in board.
 */
describe("the landing group", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let queue: Board;
  let target: Board;
  let groups: BoardGroup[];
  const danh = SEED_USER_IDS.danh;

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `landing-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const all = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    queue = all.find((b) => b.system === "TASK_ALLOCATION")!;
    target = all.find((b) => !b.system && !b.archivedAt && b.teamId)!;
    groups = (await repos.boards.listGroups(target.id)).sort((a, b) => a.position - b.position);
    if (groups.length < 2) groups.push(await repos.boards.createGroup({ boardId: target.id, name: "Second", color: "blue", position: 99, collapsed: false }));
  });

  const bookOnQueue = async (name: string) => {
    const intake = intakeGroupOf(await repos.boards.listGroups(queue.id))!;
    return services.items.createItem({ boardId: queue.id, groupId: intake.id, name, activity: { via: "booking" } }, danh);
  };

  it("is the chosen group while it exists, else the top group; built-in boards have none", () => {
    const [top, second] = groups as [BoardGroup, BoardGroup];
    expect(landingGroupOf({ landingGroupId: null }, groups)?.id).toBe(top.id);
    expect(landingGroupOf({ landingGroupId: second.id }, groups)?.id).toBe(second.id);
    expect(landingGroupOf({ landingGroupId: "gone" }, groups)?.id).toBe(top.id);
    expect(landingGroupOf({ landingGroupId: second.id, system: "TASK_ALLOCATION" }, groups)?.id).toBe(top.id);
  });

  it("is one of the board's own groups, and never set on a built-in board", async () => {
    const queueGroup = (await repos.boards.listGroups(queue.id))[0]!;
    await expect(services.boards.updateBoard(target.id, { landingGroupId: queueGroup.id }, danh)).rejects.toThrow(/this board's groups/);
    await expect(services.boards.updateBoard(queue.id, { landingGroupId: queueGroup.id }, danh)).rejects.toThrow(/no landing group/);
    const updated = await services.boards.updateBoard(target.id, { landingGroupId: groups[1]!.id }, danh);
    expect(updated.landingGroupId).toBe(groups[1]!.id);
  });

  it("always takes an allocated request: the chosen group, else the first", async () => {
    const first = await bookOnQueue("Lands in the first group");
    expect((await services.booking.allocate(first.id, target.id, danh)).item.groupId).toBe(groups[0]!.id);
    await services.boards.updateBoard(target.id, { landingGroupId: groups[1]!.id }, danh);
    const second = await bookOnQueue("Lands in the chosen group");
    expect((await services.booking.allocate(second.id, target.id, danh)).item.groupId).toBe(groups[1]!.id);
  });

  it("takes a task moved from another board, and the choice goes when the group does", async () => {
    await services.boards.updateBoard(target.id, { landingGroupId: groups[1]!.id }, danh);
    const all = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const source = all.find((b) => !b.system && !b.archivedAt && b.id !== target.id)!;
    const sourceGroup = (await repos.boards.listGroups(source.id))[0]!;
    const task = await services.items.createItem({ boardId: source.id, groupId: sourceGroup.id, name: "Moving across" }, danh);
    const { item } = await services.itemMoves.moveToBoard(task.id, target.id, danh);
    expect(item.groupId).toBe(groups[1]!.id);

    await services.boards.deleteGroup(groups[1]!.id, danh).catch(() => repos.boards.deleteGroup(groups[1]!.id));
    expect((await repos.boards.getById(target.id))!.landingGroupId ?? null).toBeNull();
  });
});
