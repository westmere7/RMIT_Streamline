import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { groupReactions, withReaction } from "@/domain";
import { createServices } from "@/services";

let counter = 0;

async function setup() {
  counter += 1;
  const services = createServices(createLocalRepositories({ databaseName: `reactions-${Date.now()}-${counter}` }));
  await services.repos.admin.resetToSeed();
  const [item] = await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary);
  const users = await services.repos.users.list();
  const comment = await services.comments.addComment(item!.id, "Draft is up for review", SEED_USER_IDS.danh, users);
  return { services, item: item!, comment };
}

describe("comment reactions", () => {
  it("keeps one of each emoji per person, and takes it back again", async () => {
    const { services, item, comment } = await setup();
    const other = Object.values(SEED_USER_IDS).find((id) => id !== SEED_USER_IDS.danh)!;

    await services.comments.setReaction(comment, "👍", SEED_USER_IDS.danh, true);
    await services.comments.setReaction(comment, "👍", SEED_USER_IDS.danh, true);
    await services.comments.setReaction(comment, "👍", other, true);
    await services.comments.setReaction(comment, "🎉", other, true);

    let stored = (await services.comments.listByItem(item.id)).find((c) => c.id === comment.id)!;
    expect(groupReactions(stored.reactions)).toEqual([
      { emoji: "👍", userIds: [SEED_USER_IDS.danh, other] },
      { emoji: "🎉", userIds: [other] },
    ]);

    await services.comments.setReaction(comment, "👍", SEED_USER_IDS.danh, false);
    stored = (await services.comments.listByItem(item.id)).find((c) => c.id === comment.id)!;
    expect(groupReactions(stored.reactions)).toEqual([
      { emoji: "👍", userIds: [other] },
      { emoji: "🎉", userIds: [other] },
    ]);
    // Editing the update leaves its reactions where they are.
    await services.comments.editComment(comment.id, "Draft is up for review, v2", await services.repos.users.list());
    stored = (await services.comments.listByItem(item.id)).find((c) => c.id === comment.id)!;
    expect(stored.reactions).toHaveLength(2);
  });

  it("refuses an emoji that is not on offer", async () => {
    const { services, comment } = await setup();
    await expect(services.comments.setReaction(comment, "🦄", SEED_USER_IDS.danh, true)).rejects.toThrow("not one on offer");
  });

  it("groups in the order each emoji first appeared", () => {
    let reactions = withReaction(undefined, "a", "🎉", true, "2026-09-25T10:00:00Z");
    reactions = withReaction(reactions, "b", "👍", true, "2026-09-25T10:01:00Z");
    reactions = withReaction(reactions, "c", "🎉", true, "2026-09-25T10:02:00Z");
    expect(groupReactions(reactions).map((g) => [g.emoji, g.userIds.length])).toEqual([
      ["🎉", 2],
      ["👍", 1],
    ]);
  });
});
