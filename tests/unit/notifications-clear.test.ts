import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import type { Repositories } from "@/data/repositories";
import type { StoredDelivery } from "@/domain";
import { tabCountPrefix } from "@/features/notifications/use-tab-badge";

let counter = 0;
let repos: Repositories;

// Ids the seed does not use: `createLocalRepositories` seeds the demo
// workspace, and a seeded person already has an inbox to count.
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const notify = (userId: string, delivery: StoredDelivery, title: string) =>
  repos.notifications.create({
    userId,
    type: "MENTION",
    title,
    body: null,
    entityType: "ITEM",
    entityId: "00000002-0000-4000-8000-000000000001",
    boardId: null,
    actorId: OTHER,
    delivery,
  } as never);

beforeEach(async () => {
  counter += 1;
  repos = createLocalRepositories({ databaseName: `notifications-clear-${Date.now()}-${counter}` });
});

/**
 * Clearing the inbox.
 *
 * A notification is a record that somebody was told, not the thing they were
 * told about — so clearing throws the records away and touches nothing they
 * point at. The two things worth pinning are that it is scoped to one person
 * and, when asked, to one tab.
 */
describe("clearing notifications", () => {
  it("removes everything for that person", async () => {
    await notify(USER, "NOTIFICATION", "one");
    await notify(USER, "UPDATE", "two");
    expect(await repos.notifications.listByUser(USER)).toHaveLength(2);

    await repos.notifications.deleteAll(USER);
    expect(await repos.notifications.listByUser(USER)).toHaveLength(0);
  });

  it("clears one tab and leaves the other alone", async () => {
    await notify(USER, "NOTIFICATION", "loud");
    await notify(USER, "UPDATE", "quiet");

    await repos.notifications.deleteAll(USER, "NOTIFICATION");
    const left = await repos.notifications.listByUser(USER);
    // Clearing the loud list must not take the quiet updates with it.
    expect(left.map((n) => n.delivery)).toEqual(["UPDATE"]);
  });

  it("never reaches another person's inbox", async () => {
    await notify(USER, "NOTIFICATION", "mine");
    await notify(OTHER, "NOTIFICATION", "theirs");

    await repos.notifications.deleteAll(USER);
    expect(await repos.notifications.listByUser(USER)).toHaveLength(0);
    expect(await repos.notifications.listByUser(OTHER)).toHaveLength(1);
  });

  it("is happy to clear an inbox that is already empty", async () => {
    await expect(repos.notifications.deleteAll(USER)).resolves.toBeUndefined();
  });
});

/**
 * What the browser tab says.
 *
 * The count goes in front of the title the shell already keeps honest, so this
 * is only about how it reads — and about never showing a count of nothing.
 */
describe("the tab count", () => {
  it("says nothing when nothing is waiting", () => {
    expect(tabCountPrefix(0)).toBe("");
    expect(tabCountPrefix(-1)).toBe("");
  });

  it("goes in front of the title, the way other apps do it", () => {
    expect(tabCountPrefix(1)).toBe("(1) ");
    expect(tabCountPrefix(12)).toBe("(12) ");
  });

  it("stops counting past ninety-nine, where the exact number stops mattering", () => {
    expect(tabCountPrefix(99)).toBe("(99) ");
    expect(tabCountPrefix(100)).toBe("(99+) ");
  });
});
