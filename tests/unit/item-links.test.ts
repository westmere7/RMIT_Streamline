import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { buildBoardModel } from "@/features/boards/board-model";
import { createServices } from "@/services";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";

let counter = 0;

describe("Task Linking", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(
      createLocalRepositories({
        databaseName: `links-${Date.now()}-${counter}`,
      }),
    );
  });

  async function itemNamed(boardId: string, name: string) {
    const item = (await services.repos.items.listByBoard(boardId)).find((i) => i.name === name);
    if (!item) throw new Error(`No item ${name}`);
    return item;
  }
  async function valueOf(itemId: string, boardId: string, columnName: string) {
    const column = (await services.repos.boards.listColumns(boardId)).find((c) => c.name === columnName)!;
    return (await services.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === column.id)?.value;
  }
  async function setValue(itemId: string, boardId: string, columnName: string, value: Parameters<typeof services.items.setValue>[2], actor = SEED_USER_IDS.danh) {
    const board = (await services.repos.boards.getById(boardId))!;
    const column = (await services.repos.boards.listColumns(boardId)).find((c) => c.name === columnName)!;
    const item = (await services.repos.items.getById(itemId))!;
    const users = await services.repos.users.list();
    return services.items.setValue(itemId, column.id, value, { column, item, board, users }, actor);
  }

  it("seeds cross-team links and exposes them on the board snapshot", async () => {
    const sem1 = await itemNamed(SEED_BOARD_IDS.sem1, "Sem 1 DOOH adaptation");
    const dooh = await itemNamed(SEED_BOARD_IDS.dooh, "Sem 1 DOOH adaptation");
    const links = await services.repos.links.listByItem(sem1.id);
    expect(links).toHaveLength(1);
    expect([links[0]!.itemAId, links[0]!.itemBId]).toContain(dooh.id);

    const snapshot = await services.items.loadBoardSnapshot(SEED_BOARD_IDS.sem1);
    expect(snapshot.links).toHaveLength(1);
    const model = buildBoardModel(snapshot, {
      search: "",
      filters: EMPTY_FILTERS,
      sort: null,
      now: new Date(),
    });
    expect(model.linksByItem.get(sem1.id)).toHaveLength(1);

    const views = await services.links.listForItem(sem1.id);
    expect(views[0]?.board.id).toBe(SEED_BOARD_IDS.dooh);
    expect(views[0]?.mapping.mapped.map((m) => m.source.name)).toEqual(["Owner", "Status", "Priority", "Due Date"]);
    expect(views[0]?.mapping.unmapped.map((c) => c.name)).toEqual(["Timeline", "Channel"]);
  });

  it("links items across teams, seeds the other side and mirrors later changes", async () => {
    const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix"); // Melbourne Creative
    const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Student spotlight – exchange to Barcelona"); // Content team

    await services.links.link(source.id, target.id, SEED_USER_IDS.danh, {
      seedFrom: "item",
    });

    const after = (await services.repos.items.getById(target.id))!;
    expect(after.name).toBe("Campus open day messaging matrix");
    // Status/priority travel by label name, the date by lone-type match ("Due Date" → "Publish Date"), tags by name.
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "not_started" });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Priority")).toEqual({ type: "PRIORITY", labelId: "medium" });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Publish Date")).toEqual(await valueOf(source.id, SEED_BOARD_IDS.sem1, "Due Date"));
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Channel")).toEqual({ type: "TAGS", tags: ["Copy"] });
    // The source side wins wherever it has a value: Grace replaces Jane as owner.
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Owner")).toEqual({
      type: "PERSON",
      userIds: [SEED_USER_IDS.grace],
    });

    const activity = await services.repos.activities.listByItem(target.id);
    expect(activity[0]?.eventType).toBe("ITEM_LINKED");
    expect(activity[0]?.metadata.linkedBoardName).toBe("Semester 1 Campaign");
    // Jane owned the target before the link and is told about it; the actor is not.
    const jane = await services.repos.notifications.listByUser(SEED_USER_IDS.jane);
    expect(jane.some((n) => n.type === "ITEM_LINKED" && n.entityId === target.id)).toBe(true);

    // Ongoing sync in both directions.
    await services.items.renameItem(target.id, "Open day messaging matrix", SEED_USER_IDS.grace);
    expect((await services.repos.items.getById(source.id))?.name).toBe("Open day messaging matrix");

    await setValue(source.id, SEED_BOARD_IDS.sem1, "Status", {
      type: "STATUS",
      labelId: "working",
    });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "working" });
    const mirrored = (await services.repos.activities.listByItem(target.id)).find((a) => a.eventType === "ITEM_COLUMN_VALUE_UPDATED");
    expect(mirrored?.metadata).toMatchObject({
      columnName: "Status",
      to: "Working On It",
      syncedFrom: "Open day messaging matrix",
    });

    // A column the other board lacks changes nothing there.
    const before = await services.repos.items.listValuesByItem(target.id);
    await setValue(source.id, SEED_BOARD_IDS.sem1, "Timeline", {
      type: "TIMELINE",
      start: "2026-09-01",
      end: "2026-09-10",
    });
    expect(await services.repos.items.listValuesByItem(target.id)).toEqual(before);

    await services.items.updateDescription(source.id, "Shared brief", SEED_USER_IDS.danh);
    expect((await services.repos.items.getById(target.id))?.description).toBe("Shared brief");
  });

  it("can seed from the selected item instead", async () => {
    const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Research news – renewable materials");
    await services.links.link(source.id, target.id, SEED_USER_IDS.danh, {
      seedFrom: "target",
    });
    expect((await services.repos.items.getById(source.id))?.name).toBe("Research news – renewable materials");
    expect(await valueOf(source.id, SEED_BOARD_IDS.sem1, "Status")).toEqual({
      type: "STATUS",
      labelId: "working",
    });
    expect(await valueOf(source.id, SEED_BOARD_IDS.sem1, "Owner")).toEqual({
      type: "PERSON",
      userIds: [SEED_USER_IDS.grace],
    });
  });

  it("skips status labels the other board does not define", async () => {
    const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Behind the scenes – Vietnam studio");
    await services.links.link(source.id, target.id, SEED_USER_IDS.danh);
    const status = (await services.repos.boards.listColumns(SEED_BOARD_IDS.sem1)).find((c) => c.type === "STATUS")!;
    const settings = status.settings.kind === "status" ? status.settings : null;
    await services.repos.boards.updateColumn(status.id, {
      settings: {
        ...settings!,
        labels: [...settings!.labels, { id: "qa", name: "In QA", color: "teal" }],
      },
    });
    await setValue(source.id, SEED_BOARD_IDS.sem1, "Status", {
      type: "STATUS",
      labelId: "qa",
    });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "not_started" });
  });

  it("rejects links to itself, the same board, a subitem of its own, or a pair already linked", async () => {
    const a = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary Explorer");
    const sameBoard = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary Independent");
    const parent = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary High Achiever");
    const sub = (await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary)).find((i) => i.parentItemId === parent.id)!;
    expect(await services.links.validate(a.id, a.id)).toMatchObject({
      ok: false,
    });
    expect(await services.links.validate(a.id, sameBoard.id)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("different boards"),
    });
    expect(await services.links.validate(parent.id, sub.id)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("subitem"),
    });

    const sem1 = await itemNamed(SEED_BOARD_IDS.sem1, "Sem 1 DOOH adaptation");
    const dooh = await itemNamed(SEED_BOARD_IDS.dooh, "Sem 1 DOOH adaptation");
    expect(await services.links.validate(dooh.id, sem1.id)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("already linked"),
    });
    await expect(services.links.link(dooh.id, sem1.id, SEED_USER_IDS.danh)).rejects.toThrow(/already linked/);
  });

  it("links a subitem to an item on another board and never touches subitems of linked parents", async () => {
    const parent = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary Pragmatist");
    const sub = (await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary)).find((i) => i.parentItemId === parent.id && i.name === "Copy proofread")!;
    const request = await itemNamed(SEED_BOARD_IDS.requests, "Library opening hours poster");

    // Cross-level: subitem ↔ top-level item.
    await services.links.link(sub.id, request.id, SEED_USER_IDS.danh);
    expect((await services.repos.items.getById(request.id))?.name).toBe("Copy proofread");
    await services.items.renameItem(request.id, "Copy proofread – final", SEED_USER_IDS.joanne);
    expect((await services.repos.items.getById(sub.id))?.name).toBe("Copy proofread – final");
    expect((await services.repos.items.getById(parent.id))?.name).toBe("RMITinerary Pragmatist");

    // Parent with subitems ↔ item elsewhere: the subitems stay where they are.
    const motion = await itemNamed(SEED_BOARD_IDS.dooh, "Motion test – logo reveal");
    await services.links.link(parent.id, motion.id, SEED_USER_IDS.danh);
    const doohItems = await services.repos.items.listByBoard(SEED_BOARD_IDS.dooh);
    expect(doohItems.some((i) => i.parentItemId === motion.id)).toBe(false);
    expect((await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary)).filter((i) => i.parentItemId === parent.id)).toHaveLength(2);
  });

  it("keeps a chain of links in sync and stops after unlinking or deleting", async () => {
    const a = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary Explorer");
    const b = await itemNamed(SEED_BOARD_IDS.masterclass, "Email header – registration reminder");
    const c = await itemNamed(SEED_BOARD_IDS.requests, "Alumni newsletter banner");
    await services.links.link(a.id, b.id, SEED_USER_IDS.danh);
    await services.links.link(b.id, c.id, SEED_USER_IDS.danh);
    await services.items.renameItem(a.id, "Explorer spread", SEED_USER_IDS.danh);
    expect((await services.repos.items.getById(c.id))?.name).toBe("Explorer spread");
    expect(await services.links.connectedItemIds(a.id)).toEqual(expect.arrayContaining([b.id, c.id]));

    const [ab] = await services.repos.links.listByItem(a.id);
    await services.links.unlink(ab!.id, SEED_USER_IDS.danh);
    await services.items.renameItem(a.id, "Explorer spread v2", SEED_USER_IDS.danh);
    expect((await services.repos.items.getById(b.id))?.name).toBe("Explorer spread");
    const history = await services.repos.activities.listByItem(a.id);
    expect(history.some((x) => x.eventType === "ITEM_RENAMED" && x.metadata.to === "Explorer spread v2")).toBe(true);
    expect(history.some((x) => x.eventType === "ITEM_UNLINKED")).toBe(true);

    await services.items.deleteItems(SEED_BOARD_IDS.masterclass, [b.id], SEED_USER_IDS.danh);
    expect(await services.repos.links.listByItem(c.id)).toHaveLength(0);
  });

  it("searches items on other boards and flags ones already linked", async () => {
    const sem1 = await itemNamed(SEED_BOARD_IDS.sem1, "Sem 1 DOOH adaptation");
    const hits = await services.links.searchCandidates(SEED_WORKSPACE_ID, sem1.id, "dooh");
    expect(hits.some((h) => h.board.id === SEED_BOARD_IDS.sem1)).toBe(false);
    const mirror = hits.find((h) => h.board.id === SEED_BOARD_IDS.dooh && h.item.name === "Sem 1 DOOH adaptation");
    expect(mirror?.linked).toBe(true);
    expect(hits.some((h) => h.item.name === "DOOH motion loops – 10s" && !h.linked)).toBe(true);
  });
});
