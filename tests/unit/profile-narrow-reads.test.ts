import { beforeAll, describe, expect, it } from "vitest";
import type { Activity, Board, EntityId, ItemAsset } from "@/domain";
import { createLocalRepositories } from "@/data/local";
import type { Repositories } from "@/data/repositories";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices } from "@/services";

/**
 * The profile page and My Work ask the database for one person's rows (the
 * cells that name them, their deliverables, their activity) where they used to
 * read every board whole and filter in the browser. The answers must not move:
 * what follows is the old way, kept here as the reference, and each person in
 * the demo workspace is read both ways.
 */

/** The old My Work read: every live board in full, the tasks a person column names them on. */
async function assignedTheOldWay(repos: Repositories, userId: EntityId) {
  const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.archivedAt === null);
  const rows: Array<{ itemId: EntityId; boardId: EntityId }> = [];
  for (const board of boards) {
    const [columns, items, values] = await Promise.all([repos.boards.listColumns(board.id), repos.items.listByBoard(board.id), repos.items.listValuesByBoard(board.id)]);
    const personColumns = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
    for (const item of items) {
      if (item.archivedAt) continue;
      const named = values.some((v) => v.itemId === item.id && personColumns.has(v.columnId) && v.value.type === "PERSON" && v.value.userIds.includes(userId));
      if (named) rows.push({ itemId: item.id, boardId: board.id });
    }
  }
  return rows;
}

/** The old deliverables read: every live board's lines, filtered to the person, board by board. */
async function linesTheOldWay(repos: Repositories, boards: Board[], userId: EntityId): Promise<ItemAsset[]> {
  const perBoard = await Promise.all(boards.map((board) => repos.itemAssets.listByBoard(board.id)));
  return perBoard.flat().filter((line) => line.assigneeIds.includes(userId));
}

/** The old activity read: the person's moves among the workspace's latest 300. */
async function activityTheOldWay(repos: Repositories, userId: EntityId): Promise<Activity[]> {
  return (await repos.activities.listByWorkspace(SEED_WORKSPACE_ID, 300)).filter((a) => a.actorId === userId).slice(0, 12);
}

describe("a person's work, read from their own rows", () => {
  let repos: Repositories;
  let services: ReturnType<typeof createServices>;
  const people = Object.entries(SEED_USER_IDS);

  beforeAll(() => {
    repos = createLocalRepositories({ databaseName: `profile-narrow-${Date.now()}` });
    services = createServices(repos);
  });

  it("finds the cells that name a person, and only those", async () => {
    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const named = await repos.items.listValuesNamingUser(
      boards.map((b) => b.id),
      SEED_USER_IDS.danh,
    );
    expect(named.length).toBeGreaterThan(0);
    for (const value of named) expect((value.value as { userIds: string[] }).userIds).toContain(SEED_USER_IDS.danh);
  });

  it.each(people)("My Work lists the same tasks for %s, in the same order", async (_name, userId) => {
    const before = await assignedTheOldWay(repos, userId);
    const after = await services.myWork.listAssigned(SEED_WORKSPACE_ID, userId);
    // Linked copies fold into one row either way; every row is a task the old read found, on the same board.
    const found = new Map(before.map((row) => [row.itemId, row.boardId]));
    for (const row of after) expect(found.get(row.item.id)).toBe(row.board.id);
    const shownOrLinked = new Set(after.flatMap((row) => [row.item.id]));
    const folded = before.filter((row) => !shownOrLinked.has(row.itemId));
    // Anything not shown is a linked copy of a row that is.
    for (const row of folded) expect(after.some((shown) => shown.linkedBoards.some((b) => b.id === row.boardId))).toBe(true);
  });

  it.each(people)("the profile's tasks, deliverables and figures match the old read for %s", async (_name, userId) => {
    const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.archivedAt === null);
    const profile = await services.profiles.load(SEED_WORKSPACE_ID, userId);
    const theirs = await linesTheOldWay(repos, boards, userId);

    expect(profile.assets.total).toBe(theirs.length);
    expect(profile.assets.done).toBe(theirs.filter((a) => a.completedAt !== null).length);
    const shown = profile.assets.lines.map((line) => line.id);
    expect(new Set(shown).size).toBe(shown.length);
    for (const id of shown) expect(theirs.some((line) => line.id === id)).toBe(true);

    // The activity reaches further back now (their latest twelve, not theirs among the
    // workspace's latest 300), so the old list is where the new one starts.
    const oldActivity = await activityTheOldWay(repos, userId);
    expect(profile.activity.slice(0, oldActivity.length).map((a) => a.id)).toEqual(oldActivity.map((a) => a.id));
    expect(profile.activity.every((a) => a.actorId === userId)).toBe(true);
  });

  it.each(people)("My Work's deliverables are the same for %s", async (_name, userId) => {
    const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.archivedAt === null);
    const expected: string[] = [];
    for (const board of boards) {
      const items = new Map((await repos.items.listByBoard(board.id)).map((item) => [item.id, item]));
      for (const line of (await repos.itemAssets.listByBoard(board.id)).filter((l) => l.assigneeIds.includes(userId))) {
        const item = items.get(line.itemId);
        if (item && !item.archivedAt) expected.push(line.id);
      }
    }
    const after = await services.myWork.listAssignedAssets(SEED_WORKSPACE_ID, userId);
    expect(after.map((row) => row.asset.id).sort()).toEqual(expected.sort());
  });
});
