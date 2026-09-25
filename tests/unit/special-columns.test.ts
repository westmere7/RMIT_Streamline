import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { SPECIAL_BOARD_COLUMN_TYPES } from "@/domain";
import { buildBoardModel } from "@/features/boards/board-model";
import { createServices, type Services } from "@/services";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";

let counter = 0;
const BOARD = SEED_BOARD_IDS.rmitinerary;

describe("special columns: on every board, and only ever taken off it", () => {
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `special-columns-${Date.now()}-${counter}` }));
    await services.repos.admin.resetToSeed();
  });

  const modelOf = async (boardId: string) =>
    buildBoardModel(await services.items.loadBoardSnapshot(boardId), { search: "", filters: EMPTY_FILTERS, sort: null, now: new Date() });

  it("puts one of each on every seeded board", async () => {
    for (const board of await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)) {
      const columns = await services.repos.boards.listColumns(board.id);
      // At least the one: a board from before the rule may keep a second people column.
      for (const type of SPECIAL_BOARD_COLUMN_TYPES) expect(columns.some((c) => c.type === type), `${board.name} ${type}`).toBe(true);
    }
  });

  it("takes a special column off the board, keeps what it held, and puts the same one back", async () => {
    const columns = await services.repos.boards.listColumns(BOARD);
    const timeline = columns.find((c) => c.type === "TIMELINE")!;
    const item = (await services.repos.items.listByBoard(BOARD)).find((i) => i.parentItemId === null)!;
    await services.repos.items.setValue(item.id, timeline.id, { type: "TIMELINE", start: "2026-10-01", end: "2026-10-09" });

    await services.boards.deleteColumn(timeline.id);
    const off = await services.repos.boards.getColumn(timeline.id);
    expect(off?.removed).toBe(true);
    // Out of sight on the board, not out of the data.
    const model = await modelOf(BOARD);
    expect(model.columns.some((c) => c.id === timeline.id)).toBe(false);
    expect(model.removedColumns.map((c) => c.id)).toEqual([timeline.id]);
    expect(model.timelineColumn).toBeNull();
    expect((await services.repos.items.listValuesByItem(item.id)).find((v) => v.columnId === timeline.id)?.value).toMatchObject({ start: "2026-10-01" });

    // Added again: the same column, and what it held.
    const back = await services.boards.addColumn({ boardId: BOARD, name: "Timeline", type: "TIMELINE" });
    expect(back.id).toBe(timeline.id);
    expect(back.removed).toBe(false);
    expect((await modelOf(BOARD)).timelineColumn?.id).toBe(timeline.id);
    expect((await services.repos.boards.listColumns(BOARD)).filter((c) => c.type === "TIMELINE")).toHaveLength(1);
  });

  it("still deletes a plain column outright", async () => {
    const plain = await services.boards.addColumn({ boardId: BOARD, name: "Notes", type: "TEXT" });
    await services.boards.deleteColumn(plain.id);
    expect(await services.repos.boards.getColumn(plain.id)).toBeNull();
  });

  it("gives an older board what it lacks once, naming around a plain column that has the name", async () => {
    for (const c of await services.repos.boards.listColumns(BOARD)) if (c.type === "BRIEF" || c.type === "SIZE") await services.repos.boards.deleteColumn(c.id);
    await services.boards.addColumn({ boardId: BOARD, name: "Brief", type: "LINK" });

    const added = await services.boards.ensureSpecialColumns(BOARD);
    expect(added.map((c) => [c.type, c.name, c.removed])).toEqual([
      ["SIZE", "Size", false],
      ["BRIEF", "Brief (special)", false],
    ]);
    expect(await services.boards.ensureSpecialColumns(BOARD)).toEqual([]);
  });

  it("leaves one the board took off where it is", async () => {
    const size = (await services.repos.boards.listColumns(BOARD)).find((c) => c.type === "SIZE")!;
    await services.boards.deleteColumn(size.id);
    expect(await services.boards.ensureSpecialColumns(BOARD)).toEqual([]);
    expect((await services.repos.boards.getColumn(size.id))?.removed).toBe(true);
  });

  it("carries a booking's brief into the team board's Brief column, even one the board took off", async () => {
    await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, SEED_USER_IDS.danh);
    const brief = (await services.repos.boards.listColumns(BOARD)).find((c) => c.type === "BRIEF")!;
    await services.boards.deleteColumn(brief.id);
    const receipt = await services.booking.submit({
      workspaceSlug: "rmit",
      key: null,
      request: {
        requesterName: "Priya Nair",
        requesterEmail: "priya@rmit.edu.au",
        department: "Comm.",
        title: "Open Day wayfinding posters",
        brief: "",
        assetTypes: [],
        assets: [],
        serviceTypeId: "svc-design",
        subServices: ["Print"],
        answers: {
          "design-what": { kind: "text", text: "Six A1 posters for the Brunswick campus." },
          "design-specs": { kind: "text", text: "A1 portrait, CMYK." },
          "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
        },
        teamId: null,
        dueDate: "2026-10-01",
        priority: "High",
        referenceUrl: null,
      },
    });
    const { item } = await services.booking.allocate(receipt.itemId, BOARD, SEED_USER_IDS.danh);
    const carried = (await services.repos.items.listValuesByItem(item.id)).find((v) => v.columnId === brief.id)?.value;
    expect(carried && "text" in carried ? carried.text : "").toContain("Six A1 posters");
    // Nothing copied into the description for want of a column.
    expect((await services.repos.items.getById(item.id))?.description ?? "").not.toContain("Six A1 posters");
  });
});
