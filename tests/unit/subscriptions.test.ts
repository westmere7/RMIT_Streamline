import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { columnLabels, resolveColumnRoles, subscriptionEventFor } from "@/domain";
import { createServices } from "@/services";

let counter = 0;
async function setup() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `subscriptions-db-${Date.now()}-${counter}` });
  const services = createServices(repos);
  const boardId = SEED_BOARD_IDS.rmitinerary;
  const board = (await repos.boards.getById(boardId))!;
  const [item, other] = (await repos.items.listByBoard(boardId)).filter((i) => i.parentItemId === null);
  const columns = await repos.boards.listColumns(boardId);
  const status = resolveColumnRoles(columns).status!;
  const users = await repos.users.list();
  const setStatus = async (target: typeof item, labelIndex: number, actor: string) =>
    services.items.setValue(target!.id, status.id, { type: "STATUS", labelId: columnLabels(status)[labelIndex]!.id }, { column: status, item: target!, board, users }, actor);
  const inbox = async (userId: string) => (await repos.notifications.listByUser(userId)).filter((n) => n.type === "SUBSCRIPTION");
  return { repos, services, boardId, item: item!, other: other!, setStatus, inbox };
}

/**
 * Following: someone who is not on a board or task still hears about the
 * changes they chose, and only those, and never about their own.
 */
describe("following boards and tasks", () => {
  it("tells a task's follower about the kinds of change they chose", async () => {
    const { services, boardId, item, other, setStatus, inbox } = await setup();
    const follower = SEED_USER_IDS.jun;
    await services.subscriptions.follow(follower, SEED_WORKSPACE_ID, { boardId, itemId: item.id }, ["status"]);

    await setStatus(item, 1, SEED_USER_IDS.danh);
    await services.comments.addComment(item.id, "Draft attached", SEED_USER_IDS.danh, []);
    await setStatus(other, 1, SEED_USER_IDS.danh);
    await services.subscriptions.settled();

    const got = await inbox(follower);
    // The status change on the task they follow, and nothing else: no update (not chosen), nothing from the other task.
    expect(got).toHaveLength(1);
    expect(got[0]!.entityId).toBe(item.id);
    expect(got[0]!.title).toContain(item.name);
    expect(got[0]!.delivery).toBe("UPDATE");
  });

  it("tells a board's follower about every task on it, but never about their own changes", async () => {
    const { services, boardId, item, other, setStatus, inbox } = await setup();
    const follower = SEED_USER_IDS.jun;
    await services.subscriptions.follow(follower, SEED_WORKSPACE_ID, { boardId, itemId: null }, ["status"]);

    await setStatus(item, 1, SEED_USER_IDS.danh);
    await setStatus(other, 2, follower);
    await services.subscriptions.settled();

    const got = await inbox(follower);
    expect(got.map((n) => n.entityId)).toEqual([item.id]);
  });

  it("stops when the follow goes, and maps the feed onto the kinds of change", async () => {
    const { services, boardId, item, setStatus, inbox } = await setup();
    const follower = SEED_USER_IDS.jun;
    const follow = await services.subscriptions.follow(follower, SEED_WORKSPACE_ID, { boardId, itemId: item.id }, ["status", "updates"]);
    expect(follow?.events).toEqual(["status", "updates"]);
    // Choosing nothing is unfollowing.
    expect(await services.subscriptions.follow(follower, SEED_WORKSPACE_ID, { boardId, itemId: item.id }, [])).toBeNull();
    expect(await services.subscriptions.listMine(follower, SEED_WORKSPACE_ID)).toEqual([]);

    await setStatus(item, 1, SEED_USER_IDS.danh);
    await services.subscriptions.settled();
    expect(await inbox(follower)).toEqual([]);

    expect(subscriptionEventFor({ eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnType: "STATUS" } })).toBe("status");
    expect(subscriptionEventFor({ eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnType: "DATE" } })).toBe("fields");
    expect(subscriptionEventFor({ eventType: "ASSET_COMPLETED", metadata: {} })).toBe("assets");
    expect(subscriptionEventFor({ eventType: "ITEM_MOVED", metadata: {} })).toBe("tasks");
    expect(subscriptionEventFor({ eventType: "BOARD_RENAMED", metadata: {} })).toBeNull();
  });
});

describe("starred tasks", () => {
  it("lists what was starred like My Work, marks done ones, and unstars in one go", async () => {
    const { repos, services, item, other, setStatus } = await setup();
    const me = SEED_USER_IDS.jun;
    await services.myWork.star(me, item);
    await services.myWork.star(me, other);
    await services.myWork.star(me, item);
    let starred = await services.myWork.listStarred(SEED_WORKSPACE_ID, me);
    expect(starred.map((e) => e.item.id).sort()).toEqual([item.id, other.id].sort());
    expect((await services.myWork.starredIds(me)).get(item.id)).toBe(item.boardId);

    // Done by the board's own status: it is still starred, and says it is done.
    const status = (await repos.boards.listColumns(item.boardId)).find((c) => c.type === "STATUS")!;
    const doneIndex = status.settings.kind === "status" ? columnLabels(status).findIndex((l) => status.settings.kind === "status" && status.settings.doneLabelIds.includes(l.id)) : -1;
    await setStatus(item, doneIndex, SEED_USER_IDS.danh);
    starred = await services.myWork.listStarred(SEED_WORKSPACE_ID, me);
    expect(starred.find((e) => e.item.id === item.id)?.isDone).toBe(true);

    await services.myWork.unstar(me, [item.id, other.id]);
    expect(await services.myWork.listStarred(SEED_WORKSPACE_ID, me)).toEqual([]);
  });
});
