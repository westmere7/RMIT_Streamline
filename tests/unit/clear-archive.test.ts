import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { createServices } from "@/services";

/** Clear archive (v0.141.3): every archived task on the board goes, whatever the page shows; nothing on the board does. */
describe("clearing a board's archive", () => {
  it("deletes every archived task with its subitems, leaves live tasks and other boards alone", async () => {
    const repos = createLocalRepositories({ databaseName: `clear-archive-${Date.now()}-${Math.random()}` });
    const services = createServices(repos);
    const actor = SEED_USER_IDS.danh;
    const [board, other] = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.system && !b.archivedAt);
    const live = (await repos.items.listByBoard(board!.id)).filter((i) => !i.parentItemId);
    const [a, b] = live;
    await services.items.createItem({ boardId: board!.id, groupId: a!.groupId, parentItemId: a!.id, name: "Step" }, actor);
    await services.items.archiveItems(board!.id, [a!.id, b!.id], actor);
    const otherBefore = (await repos.items.listByBoard(other!.id, { includeArchived: true })).length;

    expect(await services.items.clearArchive(board!.id, actor)).toBe(2);
    const left = await repos.items.listByBoard(board!.id, { includeArchived: true });
    expect(left.some((i) => i.id === a!.id || i.id === b!.id || i.parentItemId === a!.id)).toBe(false);
    expect(left.filter((i) => !i.parentItemId).length).toBe(live.length - 2);
    expect((await repos.items.listByBoard(other!.id, { includeArchived: true })).length).toBe(otherBefore);
    expect(await services.items.clearArchive(board!.id, actor)).toBe(0);
  });
});
