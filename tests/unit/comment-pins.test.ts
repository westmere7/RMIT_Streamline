import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { orderUpdates, overviewPinOf, RefusedError, type Comment } from "@/domain";
import { createServices } from "@/services";

/** Pinned updates, and the one pinned to a task's overview (v0.151.0). */

async function setup() {
  const services = createServices(createLocalRepositories({ databaseName: `pins-${Date.now()}-${Math.random()}` }));
  await services.repos.admin.resetToSeed();
  const [item] = await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary);
  const users = await services.repos.users.list();
  const post = (body: string) => services.comments.addComment(item!.id, body, SEED_USER_IDS.danh, users);
  const list = () => services.comments.listByItem(item!.id);
  return { services, item: item!, users, post, list };
}

describe("pinned updates", () => {
  it("keeps one overview pin per task: pinning another moves it, the first stays pinned", async () => {
    const { services, post, list } = await setup();
    const first = await post("First");
    const second = await post("Second");
    await services.comments.setPin(first, SEED_USER_IDS.danh, "overview");
    expect(overviewPinOf(await list())?.id).toBe(first.id);
    await services.comments.setPin(second, SEED_USER_IDS.danh, "overview");
    const now = await list();
    expect(overviewPinOf(now)?.id).toBe(second.id);
    expect(now.find((c) => c.id === first.id)!.pin).toMatchObject({ overview: false });
    await services.comments.setPin(second, SEED_USER_IDS.danh, "none");
    expect(overviewPinOf(await list())).toBeNull();
  });

  it("doesn't mark a pinned update as edited", async () => {
    const { services, post, list } = await setup();
    const update = await post("Pin me");
    await services.comments.setPin(update, SEED_USER_IDS.danh, "pinned");
    const after = (await list()).find((c) => c.id === update.id)!;
    expect(after.updatedAt).toBe(after.createdAt);
  });

  it("never pins a reply", async () => {
    const { services, item, users, post } = await setup();
    const update = await post("Question");
    const reply = await services.comments.replyToComment(item.id, update.id, "Answer", SEED_USER_IDS.danh, users);
    await expect(services.comments.setPin(reply, SEED_USER_IDS.danh, "overview")).rejects.toBeInstanceOf(RefusedError);
  });

  it("orders the overview pin, then pinned ones latest first, then the rest newest first", () => {
    const c = (id: string, createdAt: string, pin?: Comment["pin"]) => ({ id, createdAt, pin }) as Comment;
    const ordered = orderUpdates([
      c("old", "2026-01-01"),
      c("pinA", "2026-01-02", { overview: false, pinnedBy: null, pinnedAt: "2026-02-01" }),
      c("new", "2026-01-05"),
      c("over", "2026-01-03", { overview: true, pinnedBy: null, pinnedAt: "2026-01-10" }),
      c("pinB", "2026-01-04", { overview: false, pinnedBy: null, pinnedAt: "2026-03-01" }),
    ]);
    expect(ordered.map((u) => u.id)).toEqual(["over", "pinB", "pinA", "new", "old"]);
  });
});
