import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { RefusedError } from "@/domain";
import { createServices } from "@/services";
import type { SkippedSync } from "@/services/item-link-service";

/**
 * A change by someone who may edit one side of a link and only view the other
 * (22 Nov 2026): their change stands, the other side is left as it was, and the
 * page is told which board was not updated.
 */
describe("linked tasks someone can't edit", () => {
  it("keeps the change, skips the linked task, says where, and refuses an unlink with a reason", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `link-skips-${Date.now()}-${Math.random()}` }));
    await services.repos.admin.resetToSeed();
    const [a] = (await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary)).filter((i) => !i.parentItemId);
    const [b] = (await services.repos.items.listByBoard(SEED_BOARD_IDS.masterclass)).filter((i) => !i.parentItemId);
    const link = await services.links.link(a!.id, b!.id, SEED_USER_IDS.danh);
    // Linking filled B from A: this is the name B keeps.
    const bName = (await services.repos.items.getById(b!.id))!.name;

    // The database refuses writes to B's board for this person.
    const update = services.repos.items.update.bind(services.repos.items);
    services.repos.items.update = async (id, patch) => {
      if (id === b!.id) throw new Error("new row violates row-level security policy");
      return update(id, patch);
    };
    const heard: SkippedSync[] = [];
    const stop = services.links.onSyncSkipped((s) => heard.push(s));

    await services.items.renameItem(a!.id, "Renamed here", SEED_USER_IDS.danh);
    expect((await services.repos.items.getById(a!.id))!.name).toBe("Renamed here");
    expect((await services.repos.items.getById(b!.id))!.name).toBe(bName);
    const masterclass = (await services.repos.boards.getById(SEED_BOARD_IDS.masterclass))!;
    expect(heard).toEqual([{ boardNames: [masterclass.name], what: "change" }]);
    stop();

    // An unlink the database refuses deletes nothing and says why.
    services.repos.links.delete = async () => undefined;
    await expect(services.links.unlink(link.id, SEED_USER_IDS.danh)).rejects.toBeInstanceOf(RefusedError);
  });
});
