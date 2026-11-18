import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { createServices } from "@/services";

describe("a board's item count", () => {
  it("counts the tasks on the board now: top-level, not archived", async () => {
    const repos = createLocalRepositories({ databaseName: `item-count-${Date.now()}` });
    const services = createServices(repos);
    const board = SEED_BOARD_IDS.rmitinerary;
    const live = (await repos.items.listByBoard(board)).filter((i) => i.archivedAt === null && i.parentItemId === null);
    expect(await services.items.countLive(board)).toBe(live.length);

    // A new task counts; a subitem under it does not.
    const group = (await repos.boards.listGroups(board))[0]!;
    const task = await services.items.createItem({ boardId: board, groupId: group.id, name: "Counted" }, SEED_USER_IDS.danh);
    await services.items.createItem({ boardId: board, groupId: group.id, name: "Not counted", parentItemId: task.id }, SEED_USER_IDS.danh);
    expect(await services.items.countLive(board)).toBe(live.length + 1);
  });
});
