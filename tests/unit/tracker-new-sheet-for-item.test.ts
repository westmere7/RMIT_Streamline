import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Item, Tracker } from "@/domain";
import { createServices } from "@/services";

/**
 * "New sheet" in Use a tracker sheet (v0.164.0): a sheet laid out for assets,
 * added to a tracker that is already there and linked to the task in one go,
 * as "New tracker for this task" does without making a tracker.
 */
describe("a new sheet in an existing tracker for a task", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let item: Item;
  let tracker: Tracker;
  const actor = SEED_USER_IDS.jun;

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `new-sheet-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const board = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system)!;
    item = (await repos.items.listByBoard(board.id)).find((i) => !i.parentItemId && !i.archivedAt)!;
    const existing = await repos.itemAssets.listByItem(item.id);
    if (existing.length) await repos.itemAssets.deleteMany(existing.map((a) => a.id));
    tracker = (await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Campaign assets", layout: "blank" }, actor)).tracker;
  });

  const add = (moveAssets = false, name = "Open Day kit") => services.trackers.addSheetForItem({ trackerId: tracker.id, itemId: item.id, name, assetTypes: ["Print"], moveAssets }, actor);

  it("adds an asset sheet at the end of the tracker and links it to the task", async () => {
    const before = await services.trackers.listSheets(tracker.id);
    const { sheet, tracker: into } = await add();
    expect(into.id).toBe(tracker.id);
    expect(sheet.trackerId).toBe(tracker.id);
    expect(sheet.name).toBe("Open Day kit");
    expect(sheet.itemId).toBe(item.id);
    expect(sheet.columns.map((c) => c.name)).toEqual(expect.arrayContaining(["Asset", "Type", "Quantity", "PIC", "Due date", "Done"]));
    const after = await services.trackers.listSheets(tracker.id);
    expect(after.map((s) => s.id)).toEqual([...before.map((s) => s.id), sheet.id]);
    expect((await repos.trackers.getSheetByItem(item.id))?.id).toBe(sheet.id);
  });

  it("works when every other sheet in the tracker already holds a task", async () => {
    // A tracker made for another task: its one sheet already holds that task's assets.
    const other = (await repos.items.listByBoard(item.boardId)).find((i) => i.id !== item.id && !i.parentItemId && !i.archivedAt)!;
    const full = await services.trackers.createForItem({ workspaceId: SEED_WORKSPACE_ID, teamId: null, itemId: other.id, name: "Other task", moveAssets: false }, actor);
    expect((await services.trackers.listSheets(full.tracker.id)).every((s) => s.itemId)).toBe(true);
    const { sheet } = await services.trackers.addSheetForItem({ trackerId: full.tracker.id, itemId: item.id, name: "Ours", moveAssets: false }, actor);
    expect(sheet.itemId).toBe(item.id);
    expect((await services.trackers.listSheets(full.tracker.id)).map((s) => s.itemId)).toEqual([other.id, item.id]);
  });

  it("moves the task's own lines in when asked", async () => {
    await repos.itemAssets.createMany([{ itemId: item.id, boardId: item.boardId, name: "A1 poster", assetType: "Print", quantity: 6, position: 0, createdBy: actor }]);
    const { sheet, moved } = await add(true);
    expect(moved).toBe(1);
    expect((await repos.itemAssets.listByItem(item.id)).every((l) => l.trackerSheetId === sheet.id)).toBe(true);
  });

  it("refuses a task that already takes its assets from a sheet, and adds nothing", async () => {
    await add();
    const count = (await services.trackers.listSheets(tracker.id)).length;
    await expect(add(false, "Second")).rejects.toThrow(/already takes its assets/);
    expect(await services.trackers.listSheets(tracker.id)).toHaveLength(count);
  });

  it("names an unnamed sheet Assets", async () => {
    const { sheet } = await add(false, "   ");
    expect(sheet.name).toBe("Assets");
  });
});
