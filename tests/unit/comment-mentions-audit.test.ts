import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import type { User } from "@/domain";
import { createServices } from "@/services";
import { extractMentions } from "@/services/comment-service";

/** Mentions, from the full audit of 22 Nov 2026. */

const person = (id: string, displayName: string) => ({ id, displayName }) as User;

describe("who an @name reaches", () => {
  it("matches whole names only, longest first", () => {
    const ann = person("ann", "Ann");
    const anna = person("anna", "Anna Lee");
    const annLee = person("annlee", "Ann Lee");
    expect(extractMentions("Thanks @Anna Lee", [ann, anna])).toEqual(["anna"]);
    expect(extractMentions("Over to @Ann Lee.", [ann, annLee])).toEqual(["annlee"]);
    expect(extractMentions("@Ann and @Ann Lee", [ann, annLee]).sort()).toEqual(["ann", "annlee"]);
  });

  it("tells somebody newly mentioned in an edit, once", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `mentions-${Date.now()}-${Math.random()}` }));
    await services.repos.admin.resetToSeed();
    const [item] = await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary);
    const users = await services.repos.users.list();
    const emily = users.find((u) => u.id === SEED_USER_IDS.emily)!;
    const comment = await services.comments.addComment(item!.id, "Draft is up", SEED_USER_IDS.danh, users);
    const mentionsOf = async () => (await services.repos.notifications.listByUser(emily.id)).filter((n) => n.type === "MENTION").length;
    const before = await mentionsOf();
    await services.comments.editComment(comment.id, `Draft is up, @${emily.displayName}`, users, { itemId: item!.id, actorId: SEED_USER_IDS.danh });
    expect(await mentionsOf()).toBe(before + 1);
    // Editing again with the same mention says nothing more.
    await services.comments.editComment(comment.id, `Draft is up, @${emily.displayName}!`, users, { itemId: item!.id, actorId: SEED_USER_IDS.danh });
    expect(await mentionsOf()).toBe(before + 1);
  });
});
