import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { intakeGroupOf, type Board } from "@/domain";
import { createServices } from "@/services";

/**
 * The new-tasks dot on a board's count (v0.163.0): tasks that arrived on the
 * board, made there, moved or allocated there, by someone else since this
 * person last opened it, and still there. The local store's answer; the
 * database's (boards_with_new_items, 0155) is checked on the Supabase stack.
 */

const me = SEED_USER_IDS.emily;
const other = SEED_USER_IDS.danh;
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("new tasks since the last visit", { timeout: 30_000 }, () => {
  let services: ReturnType<typeof createServices>;
  let board: Board;
  let elsewhere: Board;
  let queue: Board;

  const flagged = () => services.repos.admin.listBoardsWithNewItems(me, SEED_WORKSPACE_ID);
  const visit = async (boardId: string) => {
    await services.repos.admin.recordBoardVisit(me, boardId);
    await tick();
  };
  const firstGroup = async (boardId: string) => (await services.repos.boards.listGroups(boardId))[0]!;
  const add = async (boardId: string, actorId: string, name = "New task") =>
    services.items.createItem({ boardId, groupId: (await firstGroup(boardId)).id, name }, actorId);

  beforeEach(async () => {
    services = createServices(createLocalRepositories({ databaseName: `new-items-${Date.now()}-${Math.random()}` }));
    queue = (await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, other)).board;
    const boards = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.archivedAt && !b.system);
    [board, elsewhere] = [boards[0]!, boards[1]!];
  });

  it("a task someone else makes after my visit flags the board, and opening it again clears it", async () => {
    await visit(board.id);
    expect(await flagged()).not.toContain(board.id);
    await add(board.id, other);
    expect(await flagged()).toContain(board.id);
    await visit(board.id);
    expect(await flagged()).not.toContain(board.id);
  });

  it("my own tasks do not count", async () => {
    await visit(board.id);
    await add(board.id, me);
    expect(await flagged()).not.toContain(board.id);
  });

  it("a board I never opened has nothing to compare with", async () => {
    const never = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && !b.archivedAt && b.id !== board.id && b.id !== elsewhere.id)!;
    await add(never.id, other);
    expect(await flagged()).not.toContain(never.id);
  });

  it("a task moved in from another board counts; a move between groups does not", async () => {
    const task = await add(elsewhere.id, me);
    await visit(board.id);
    await services.itemMoves.moveToBoard(task.id, board.id, other);
    expect(await flagged()).toContain(board.id);

    await visit(board.id);
    const groups = await services.repos.boards.listGroups(board.id);
    const moved = (await services.repos.items.getById(task.id))!;
    const to = groups.find((g) => g.id !== moved.groupId)!;
    await services.items.moveItem({ boardId: board.id, itemId: task.id, toGroupId: to.id, orderedIdsInTargetGroup: [task.id] }, other);
    expect(await flagged()).not.toContain(board.id);
  });

  it("a task allocated off Task Allocation counts on the board it reached", async () => {
    const groups = await services.repos.boards.listGroups(queue.id);
    const open = groups.find((g) => g.id !== intakeGroupOf(groups)?.id)!;
    const waiting = await services.items.createItem({ boardId: queue.id, groupId: open.id, name: "Booked task" }, me);
    await visit(board.id);
    await services.booking.allocate(waiting.id, board.id, other);
    expect(await flagged()).toContain(board.id);
  });

  it("a task that has since left or been archived does not count", async () => {
    await visit(board.id);
    const task = await add(board.id, other);
    await services.items.archiveItems(board.id, [task.id], other);
    expect(await flagged()).not.toContain(board.id);

    const passing = await add(board.id, other);
    await services.itemMoves.moveToBoard(passing.id, elsewhere.id, other);
    expect(await flagged()).not.toContain(board.id);
  });
});
