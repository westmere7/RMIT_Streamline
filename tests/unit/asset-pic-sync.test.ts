import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { resolveColumnRoles } from "@/domain";
import { createServices } from "@/services";

let counter = 0;
function freshServices() {
  counter += 1;
  const repos = createLocalRepositories({ databaseName: `asset-pic-db-${Date.now()}-${counter}` });
  return { repos, services: createServices(repos) };
}

/**
 * Board settings → Assets: putting someone in charge of a line adds them to
 * the task's PIC (on by default), and with removal turned on, somebody the
 * lines added leaves again once they have none. Nobody put on the PIC by hand
 * is ever taken off by it.
 */
describe("asset lines and the PIC", () => {
  let repos: ReturnType<typeof freshServices>["repos"];
  let services: ReturnType<typeof freshServices>["services"];
  const boardId = SEED_BOARD_IDS.rmitinerary;
  const actor = SEED_USER_IDS.danh;

  beforeEach(() => {
    ({ repos, services } = freshServices());
  });

  async function setup(startingPic: string[]) {
    const item = (await repos.items.listByBoard(boardId)).find((i) => i.parentItemId === null)!;
    const pic = resolveColumnRoles(await repos.boards.listColumns(boardId)).pic!;
    expect(pic.type).toBe("PERSON");
    await repos.items.setValue(item.id, pic.id, { type: "PERSON", userIds: startingPic });
    const picOf = async () => {
      const value = (await repos.items.listValuesByItem(item.id)).find((v) => v.columnId === pic.id)?.value;
      return value?.type === "PERSON" ? value.userIds : [];
    };
    return { item, picOf };
  }

  it("adds whoever is put in charge of a line, and by default takes nobody off", async () => {
    const { item, picOf } = await setup([SEED_USER_IDS.emily]);
    const line = await services.assets.add({ itemId: item.id, boardId, name: "A1 poster", assigneeIds: [SEED_USER_IDS.tuyet] }, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.tuyet]);

    await services.assets.update(line.id, { assigneeIds: [SEED_USER_IDS.jun] }, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.tuyet, SEED_USER_IDS.jun]);

    await services.assets.remove(line.id, item.id, boardId, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.tuyet, SEED_USER_IDS.jun]);
  });

  it("with removal on, takes off only the people it added", async () => {
    await services.boards.updateBoard(boardId, { assetsClearPic: true }, actor);
    // Emily is on the PIC by hand before any line names her.
    const { item, picOf } = await setup([SEED_USER_IDS.emily]);
    const poster = await services.assets.add({ itemId: item.id, boardId, name: "A1 poster", assigneeIds: [SEED_USER_IDS.emily, SEED_USER_IDS.tuyet] }, actor);
    const tile = await services.assets.add({ itemId: item.id, boardId, name: "Tile", assigneeIds: [SEED_USER_IDS.tuyet] }, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.tuyet]);

    // Tuyet still has the tile, so the poster going leaves her where she is.
    await services.assets.remove(poster.id, item.id, boardId, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily, SEED_USER_IDS.tuyet]);

    // Her last line goes, and so does she. Emily, added by hand, stays.
    await services.assets.remove(tile.id, item.id, boardId, actor);
    expect(await picOf()).toEqual([SEED_USER_IDS.emily]);
  });

  it("leaves the PIC alone when adding is turned off", async () => {
    await services.boards.updateBoard(boardId, { assetsFillPic: false }, actor);
    const { item, picOf } = await setup([]);
    await services.assets.add({ itemId: item.id, boardId, name: "A1 poster", assigneeIds: [SEED_USER_IDS.tuyet] }, actor);
    expect(await picOf()).toEqual([]);
  });
});
