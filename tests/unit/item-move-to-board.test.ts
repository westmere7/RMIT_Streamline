import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BoardColumn, Item, ItemColumnValue } from "@/domain";
import { createServices } from "@/services";
import { planMove } from "@/services/item-move-service";

const col = (id: string, name: string, type: BoardColumn["type"], settings: BoardColumn["settings"] = { kind: "none" } as BoardColumn["settings"], position = 0): BoardColumn =>
  ({ id, boardId: "b", name, type, settings, position, width: 140, hidden: false, createdAt: "" }) as BoardColumn;
const status = (id: string, labels: string[]) =>
  col(id, "Status", "STATUS", { kind: "status", labels: labels.map((name, i) => ({ id: `${id}-${i}`, name, color: "gray" })) } as unknown as BoardColumn["settings"]);
const value = (itemId: string, columnId: string, v: ItemColumnValue["value"]): ItemColumnValue => ({ id: `${itemId}-${columnId}`, itemId, columnId, value: v, updatedAt: "" }) as ItemColumnValue;

describe("planning a move to another board", () => {
  it("carries what has a column, by type and name, and lists what cannot land and why", () => {
    const source = [status("s1", ["Working", "Stuck"]), col("t1", "Notes", "TEXT"), col("x1", "Budget code", "TEXT")];
    const target = [status("s2", ["Working", "Done"]), col("t2", "notes", "LONG_TEXT")];
    const items = [{ id: "i", name: "Poster", description: null }, { id: "sub", name: "Print proof", description: null }];
    const plan = planMove({
      items,
      sourceColumns: source,
      targetColumns: target,
      values: [
        value("i", "s1", { type: "STATUS", labelId: "s1-0" }),
        value("i", "t1", { type: "TEXT", text: "Two sizes" }),
        value("i", "x1", { type: "TEXT", text: "RMIT-42" }),
        value("sub", "s1", { type: "STATUS", labelId: "s1-1" }),
      ],
    });
    expect(plan.subitems).toBe(1);
    expect(plan.carried).toEqual([
      { itemId: "i", columnId: "s2", value: { type: "STATUS", labelId: "s2-0" } },
      { itemId: "i", columnId: "t2", value: { type: "LONG_TEXT", text: "Two sizes" } },
    ]);
    expect(plan.lost.map((l) => [l.itemName, l.columnName])).toEqual([
      ["Poster", "Budget code"],
      ["Print proof", "Status"],
    ]);
    expect(plan.lost[1]!.reason).toContain("Stuck");
    expect(plan.kept).toEqual([
      { from: "Status", to: "Status" },
      { from: "Notes", to: "notes" },
    ]);
  });

  it("keeps a brief with nowhere to go in the description instead", () => {
    const plan = planMove({
      items: [{ id: "i", name: "Poster", description: "Existing" }],
      sourceColumns: [col("b1", "Brief", "BRIEF")],
      targetColumns: [],
      values: [value("i", "b1", { type: "RICH_TEXT", text: "A3 poster for Open Day" })],
    });
    expect(plan.lost).toEqual([]);
    expect(plan.briefToDescription).toBe("A3 poster for Open Day");
  });
});

describe("moving a task to another board", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let from: Board;
  let to: Board;
  let item: Item;
  const actor = SEED_USER_IDS.danh;

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `move-board-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.system && !b.archivedAt);
    // Two boards that both have a status column, and a task with a subitem on the first.
    const withStatus: Board[] = [];
    for (const b of boards) if ((await repos.boards.listColumns(b.id)).some((c) => c.type === "STATUS")) withStatus.push(b);
    from = withStatus[0]!;
    to = withStatus[1]!;
    item = (await repos.items.listByBoard(from.id)).find((i) => !i.parentItemId)!;
    await services.items.createItem({ boardId: from.id, groupId: item.groupId, parentItemId: item.id, name: "Proof" }, actor);
  });

  it("moves the task and its subitems to the end of the chosen group, with its values rewritten and its deliverables following", async () => {
    await repos.itemAssets.createMany([{ itemId: item.id, boardId: from.id, position: 0, createdBy: actor, name: "Poster" }]);
    const groups = (await repos.boards.listGroups(to.id)).sort((a, b) => a.position - b.position);
    const group = groups[groups.length - 1]!;
    const before = (await repos.items.listByBoard(to.id)).filter((i) => i.groupId === group.id && !i.parentItemId).length;
    const preview = await services.itemMoves.preview(item.id, to.id);

    const { item: moved, plan } = await services.itemMoves.moveToBoard(item.id, to.id, actor, { groupId: group.id });
    expect(moved).toMatchObject({ boardId: to.id, groupId: group.id, position: before });
    expect(plan.carried).toEqual(preview.carried);
    const subs = (await repos.items.listByBoard(to.id)).filter((i) => i.parentItemId === item.id);
    expect(subs.map((s) => s.name)).toEqual(["Proof"]);
    expect((await repos.items.listByBoard(from.id)).some((i) => i.id === item.id || i.parentItemId === item.id)).toBe(false);

    const targetColumns = new Set((await repos.boards.listColumns(to.id)).map((c) => c.id));
    const values = await repos.items.listValuesByItems([item.id, ...subs.map((s) => s.id)]);
    for (const v of values) expect(targetColumns.has(v.columnId)).toBe(true);
    for (const c of plan.carried) expect(values.find((v) => v.itemId === c.itemId && v.columnId === c.columnId)?.value).toEqual(c.value);
    expect((await repos.itemAssets.listByItem(item.id)).map((a) => a.boardId)).toEqual([to.id]);
    const activity = (await repos.activities.listByBoard(to.id, 20)).find((a) => a.itemId === item.id && a.eventType === "ITEM_MOVED");
    expect(activity?.metadata).toMatchObject({ from: from.name, to: to.name });
  });

  it("refuses the same board, a built-in board, a subitem, and an archived board", async () => {
    await expect(services.itemMoves.moveToBoard(item.id, from.id, actor)).rejects.toThrow("already on that board");
    const system = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => b.system === "TASK_ALLOCATION")!;
    await expect(services.itemMoves.moveToBoard(item.id, system.id, actor)).rejects.toThrow("built-in board");
    const sub = (await repos.items.listByBoard(from.id)).find((i) => i.parentItemId === item.id)!;
    await expect(services.itemMoves.moveToBoard(sub.id, to.id, actor)).rejects.toThrow("Move the task instead");
    await repos.boards.update(to.id, { archivedAt: new Date().toISOString() });
    await expect(services.itemMoves.moveToBoard(item.id, to.id, actor)).rejects.toThrow("archived");
    expect((await repos.items.getById(item.id))?.boardId).toBe(from.id);
  });
});
