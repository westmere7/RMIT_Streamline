import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { groupMentionsIn } from "@/domain";
import { createServices } from "@/services";

/** "@all", "@task" and "@board" in updates and in a task's description (v0.171.0). */

describe("group mentions", () => {
  it("reads the words, whole, and leaves a person's own name alone", () => {
    expect(groupMentionsIn("@all please check")).toEqual(["all"]);
    expect(groupMentionsIn("Over to @task and @Board.").sort()).toEqual(["board", "task"]);
    expect(groupMentionsIn("Hi @allison, mail me at me@all.com")).toEqual([]);
    expect(groupMentionsIn("Thanks @Task Force", ["Task Force"])).toEqual([]);
  });

  const setup = async () => {
    const services = createServices(createLocalRepositories({ databaseName: `group-mentions-${Date.now()}-${Math.random()}` }));
    await services.repos.admin.resetToSeed();
    const board = (await services.repos.boards.getById(SEED_BOARD_IDS.rmitinerary))!;
    const [item] = await services.repos.items.listByBoard(board.id);
    const users = await services.repos.users.list();
    const active = new Set((await services.repos.workspaces.listMembers(board.workspaceId)).filter((m) => m.status === "ACTIVE").map((m) => m.userId));
    return { services, board, item: item!, users, active };
  };

  it("@all reaches everyone active in the workspace, @board the board's members", async () => {
    const { services, board, item, users, active } = await setup();
    const all = await services.comments.addComment(item.id, "Heads up @all", SEED_USER_IDS.danh, users);
    expect(new Set(all.mentionUserIds)).toEqual(active);
    const members = (await services.repos.boards.listMembers(board.id)).map((m) => m.userId).filter((id) => active.has(id));
    const onBoard = await services.comments.addComment(item.id, "Board review at 3, @board", SEED_USER_IDS.danh, users);
    expect(onBoard.mentionUserIds.sort()).toEqual([...new Set(members)].sort());
  });

  it("@task reaches the people in the task's person columns and in charge of its deliverables", async () => {
    const { services, board, item, users, active } = await setup();
    const columns = await services.repos.boards.listColumns(board.id);
    const person = columns.find((c) => c.type === "PERSON" || c.type === "PEOPLE")!;
    const emily = SEED_USER_IDS.emily;
    await services.items.setValue(item.id, person.id, { type: person.type as "PERSON", userIds: [emily] }, { column: person, item, board, users }, SEED_USER_IDS.danh);
    const reply = await services.comments.addComment(item.id, "@task can you look?", SEED_USER_IDS.danh, users);
    expect(reply.mentionUserIds).toContain(emily);
    for (const id of reply.mentionUserIds) expect(active.has(id)).toBe(true);
  });

  it("a mention in the description tells the person once", async () => {
    const { services, item, users } = await setup();
    const emily = users.find((u) => u.id === SEED_USER_IDS.emily)!;
    const count = async () => (await services.repos.notifications.listByUser(emily.id)).filter((n) => n.type === "MENTION" && n.title.includes("description")).length;
    const before = await count();
    await services.items.updateDescription(item.id, `Brief below. @${emily.displayName} owns the copy.`, SEED_USER_IDS.danh);
    expect(await count()).toBe(before + 1);
    // Edited again, still naming her: nothing new to say.
    await services.items.updateDescription(item.id, `Brief below (v2). @${emily.displayName} owns the copy.`, SEED_USER_IDS.danh);
    expect(await count()).toBe(before + 1);
    // @all in the description reaches her too, but she was already told.
    await services.items.updateDescription(item.id, `Brief below (v3). @${emily.displayName} owns the copy. @all`, SEED_USER_IDS.danh);
    expect(await count()).toBe(before + 1);
  });
});
