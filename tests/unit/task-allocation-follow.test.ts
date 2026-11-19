import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { SUBSCRIPTION_EVENTS } from "@/domain";
import { createServices } from "@/services";

const { danh, jun } = SEED_USER_IDS;

function fresh() {
  const repos = createLocalRepositories({ databaseName: `ta-follow-${Date.now()}-${Math.random()}` });
  return { repos, services: createServices(repos) };
}

/**
 * Someone added to Task Allocation as an editor follows all of it from the
 * start (migration 0126; the local store mirrors the database's trigger).
 */
describe("Task Allocation editors follow the board", () => {
  it("follows fully when added as an editor, not as a viewer, and stops when taken off", async () => {
    const { repos, services } = fresh();
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, danh);
    const ta = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => b.system === "TASK_ALLOCATION")!;
    const follow = async () => (await repos.subscriptions.listByUser(jun, SEED_WORKSPACE_ID)).find((s) => s.boardId === ta.id && s.itemId === null) ?? null;

    await services.boards.setMember(ta.id, jun, "VIEWER", danh, "Jun");
    expect(await follow()).toBeNull();

    await services.boards.setMember(ta.id, jun, "EDITOR", danh, "Jun");
    expect((await follow())?.events).toEqual([...SUBSCRIPTION_EVENTS]);

    // Narrowed by them afterwards, it stays narrowed while the seat stands.
    const mine = (await follow())!;
    await repos.subscriptions.upsert({ workspaceId: mine.workspaceId, userId: jun, boardId: ta.id, itemId: null, events: ["updates"] });
    await services.boards.setMember(ta.id, jun, "EDITOR", danh, "Jun");
    expect((await follow())?.events).toEqual(["updates"]);

    await services.boards.removeMember(ta.id, jun, danh, "Jun");
    expect(await follow()).toBeNull();
  });

  it("leaves ordinary boards alone", async () => {
    const { repos, services } = fresh();
    const board = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).find((b) => !b.system && !b.archivedAt)!;
    await services.boards.setMember(board.id, jun, "EDITOR", danh, "Jun");
    expect((await repos.subscriptions.listByUser(jun, SEED_WORKSPACE_ID)).some((s) => s.boardId === board.id && s.itemId === null)).toBe(false);
  });
});
