import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices } from "@/services";

let counter = 0;

function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `test-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

describe("local repositories (IndexedDB)", () => {
  let repos: ReturnType<typeof freshServices>["repos"];
  let services: ReturnType<typeof freshServices>["services"];

  beforeEach(() => {
    ({ repos, services } = freshServices());
  });

  it("seeds the database on first open", async () => {
    const workspace = await repos.workspaces.getBySlug("rmit");
    expect(workspace?.id).toBe(SEED_WORKSPACE_ID);
    const users = await repos.users.list();
    expect(users).toHaveLength(9);
    const boards = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    expect(boards.map((b) => b.name)).toContain("RMITinerary 2026");
    const items = await repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary);
    expect(items.length).toBeGreaterThan(10);
  });

  it("stores and reads back column values by board", async () => {
    const boardId = SEED_BOARD_IDS.rmitinerary;
    const [item] = await repos.items.listByBoard(boardId);
    const columns = await repos.boards.listColumns(boardId);
    const status = columns.find((c) => c.type === "STATUS")!;
    await repos.items.setValue(item!.id, status.id, { type: "STATUS", labelId: "stuck" });
    const values = await repos.items.listValuesByBoard(boardId);
    const stored = values.find((v) => v.itemId === item!.id && v.columnId === status.id);
    expect(stored?.value).toEqual({ type: "STATUS", labelId: "stuck" });
    // Setting again updates in place rather than duplicating.
    await repos.items.setValue(item!.id, status.id, { type: "STATUS", labelId: "done" });
    const again = (await repos.items.listValuesByItem(item!.id)).filter((v) => v.columnId === status.id);
    expect(again).toHaveLength(1);
  });

  it("cascades deletes from group to items, subitems, values and comments", async () => {
    const boardId = SEED_BOARD_IDS.rmitinerary;
    const groups = await repos.boards.listGroups(boardId);
    const design = groups.find((g) => g.name === "Design")!;
    const before = await repos.items.listByBoard(boardId);
    const inGroup = before.filter((i) => i.groupId === design.id);
    expect(inGroup.some((i) => i.parentItemId !== null)).toBe(true);
    await repos.boards.deleteGroup(design.id);
    const after = await repos.items.listByBoard(boardId);
    expect(after.some((i) => i.groupId === design.id)).toBe(false);
    for (const item of inGroup) {
      expect(await repos.items.listValuesByItem(item.id)).toHaveLength(0);
      expect(await repos.comments.listByItem(item.id)).toHaveLength(0);
    }
  });

  it("reorders groups by the provided id order", async () => {
    const boardId = SEED_BOARD_IDS.sem1;
    const groups = await repos.boards.listGroups(boardId);
    const reversed = [...groups].reverse().map((g) => g.id);
    const result = await repos.boards.reorderGroups(boardId, reversed);
    expect(result.map((g) => g.id)).toEqual(reversed);
    expect((await repos.boards.listGroups(boardId)).map((g) => g.id)).toEqual(reversed);
  });

  it("resets to seed data", async () => {
    await repos.boards.update(SEED_BOARD_IDS.sem1, { name: "Changed" });
    expect((await repos.boards.getById(SEED_BOARD_IDS.sem1))?.name).toBe("Changed");
    await repos.admin.resetToSeed();
    expect((await repos.boards.getById(SEED_BOARD_IDS.sem1))?.name).toBe("Semester 1 Campaign");
  });

  it("records activity and notifications when a status changes", async () => {
    const boardId = SEED_BOARD_IDS.rmitinerary;
    const snapshot = await services.items.loadBoardSnapshot(boardId);
    const status = snapshot.columns.find((c) => c.type === "STATUS")!;
    const owner = snapshot.columns.find((c) => c.type === "PERSON")!;
    // Item owned by Tuyet: "RMITinerary Pragmatist".
    const item = snapshot.items.find((i) => i.name === "RMITinerary Pragmatist")!;
    const ownerValue = snapshot.values.find((v) => v.itemId === item.id && v.columnId === owner.id)?.value;
    expect(ownerValue).toEqual({ type: "PERSON", userIds: [SEED_USER_IDS.tuyet] });
    const users = await repos.users.list();

    await services.items.setValue(item.id, status.id, { type: "STATUS", labelId: "done" }, { column: status, item, board: snapshot.board, users }, SEED_USER_IDS.danh);

    const activity = await repos.activities.listByItem(item.id);
    expect(activity[0]?.eventType).toBe("ITEM_COLUMN_VALUE_UPDATED");
    expect(activity[0]?.metadata).toMatchObject({ columnName: "Status", from: "Working On It", to: "Done" });
    const notifications = await repos.notifications.listByUser(SEED_USER_IDS.tuyet);
    expect(notifications.some((n) => n.type === "STATUS_CHANGED" && n.entityId === item.id)).toBe(true);
    // The actor is never notified about their own change.
    const own = await repos.notifications.listByUser(SEED_USER_IDS.danh);
    expect(own.some((n) => n.type === "STATUS_CHANGED" && n.entityId === item.id)).toBe(false);
  });

  it("notifies newly assigned users and creates a mention notification from comments", async () => {
    const boardId = SEED_BOARD_IDS.requests;
    const snapshot = await services.items.loadBoardSnapshot(boardId);
    const ownerColumn = snapshot.columns.find((c) => c.name === "Owner")!;
    const item = snapshot.items.find((i) => i.name === "Alumni newsletter banner")!;
    const users = await repos.users.list();
    await services.items.setValue(item.id, ownerColumn.id, { type: "PERSON", userIds: [SEED_USER_IDS.hil] }, { column: ownerColumn, item, board: snapshot.board, users }, SEED_USER_IDS.danh);
    const hil = await repos.notifications.listByUser(SEED_USER_IDS.hil);
    expect(hil.some((n) => n.type === "ASSIGNED" && n.entityId === item.id)).toBe(true);

    await services.comments.addComment(item.id, "Over to you @Grace Kim", SEED_USER_IDS.danh, users);
    const grace = await repos.notifications.listByUser(SEED_USER_IDS.grace);
    expect(grace.some((n) => n.type === "MENTION" && n.entityId === item.id)).toBe(true);
  });
});
