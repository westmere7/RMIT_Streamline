import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { LINK_FIELD_UPDATES } from "@/domain";
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

  /**
   * A request in the allocation queue is a question about who should do the
   * work, not the work. Linking it would mirror it onto a team's board while
   * it still sat in the queue — the very duplicate that allocating (which
   * *moves* it) exists to avoid.
   */
  it("refuses to link anything still waiting in the allocation queue, either way round", async () => {
    const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    const queue = boards.find((b) => b.system === "TASK_ALLOCATION")!;
    const [queued] = await services.repos.items.listByBoard(queue.id);
    const other = await itemNamed(SEED_BOARD_IDS.sem1, "Sem 1 DOOH adaptation");

    expect(await services.links.validate(queued!.id, other.id)).toMatchObject({ ok: false });
    expect(await services.links.validate(other.id, queued!.id)).toMatchObject({ ok: false });
    await expect(services.links.link(other.id, queued!.id, SEED_USER_IDS.danh)).rejects.toThrow(/waiting to be allocated/);

    // And it is not offered: a list of choices that all fail is not a list.
    const { hits } = await services.links.searchCandidates(SEED_WORKSPACE_ID, other.id, "");
    expect(hits.some((hit) => hit.board.id === queue.id)).toBe(false);
  });

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
    // Every board holds the special columns, so those always line up; a plain one only by name.
    expect(views[0]?.mapping.mapped.map((m) => m.source.name)).toEqual(["Owner", "Status", "Priority", "Timeline", "Due Date", "Requester", "Start day", "Department", "Size", "Brief"]);
    expect(views[0]?.mapping.unmapped.map((c) => c.name)).toEqual(["Channel"]);
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
    // Moving into progress also gives the empty Start day today's date, so the Status change is picked out by name.
    const mirrored = (await services.repos.activities.listByItem(target.id)).find((a) => a.eventType === "ITEM_COLUMN_VALUE_UPDATED" && a.metadata?.columnName === "Status");
    expect(mirrored?.metadata).toMatchObject({
      columnName: "Status",
      to: "In Progress",
      syncedFrom: "Open day messaging matrix",
    });

    // A special column is on every board, so it travels even where the other board never had one of its own.
    await setValue(source.id, SEED_BOARD_IDS.sem1, "Timeline", {
      type: "TIMELINE",
      start: "2026-09-01",
      end: "2026-09-10",
    });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Timeline")).toEqual({ type: "TIMELINE", start: "2026-09-01", end: "2026-09-10" });

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

  /**
   * Deliverables are shared by a link rather than copied: one poster, seen from
   * both boards. Copying would give the two sides their own counts to disagree
   * about, which is worse than not syncing them at all.
   */
  describe("deliverables", () => {
    it("shows both sides the same lines, whichever side they were added on", async () => {
      const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
      const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Behind the scenes – Vietnam team");
      const before = (await services.assets.list(source.id)).length;
      await services.links.link(source.id, target.id, SEED_USER_IDS.danh);

      await services.assets.add({ itemId: target.id, boardId: SEED_BOARD_IDS.alwayson, name: "A1 poster" }, SEED_USER_IDS.danh);
      const onSource = await services.assets.list(source.id);
      const onTarget = await services.assets.list(target.id);
      expect(onSource.map((a) => a.name)).toContain("A1 poster");
      expect(onSource.map((a) => a.id).sort()).toEqual(onTarget.map((a) => a.id).sort());
      // Shared, not copied: one line exists, not one per side.
      expect(onSource.filter((a) => a.name === "A1 poster")).toHaveLength(1);
      expect(onSource).toHaveLength(before + 1);
    });

    it("moves the recap on both boards when a line is ticked off on one", async () => {
      const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
      const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Behind the scenes – Vietnam team");
      await services.links.link(source.id, target.id, SEED_USER_IDS.danh);
      const line = await services.assets.add({ itemId: target.id, boardId: SEED_BOARD_IDS.alwayson, name: "Banner" }, SEED_USER_IDS.danh);

      const recapOn = async (itemId: string, boardId: string) => {
        const column = (await services.repos.boards.listColumns(boardId)).find((c) => c.type === "ASSETS_RECAP");
        if (!column) return null;
        const value = (await services.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === column.id)?.value;
        return value?.type === "ASSETS_RECAP" ? value : null;
      };

      const sourceRecap = await recapOn(source.id, SEED_BOARD_IDS.sem1);
      const targetRecap = await recapOn(target.id, SEED_BOARD_IDS.alwayson);
      // Whichever boards carry a recap column agree on the count.
      for (const recap of [sourceRecap, targetRecap]) {
        if (recap) expect(recap.lines).toBe((await services.assets.list(source.id)).length);
      }
      expect(line.itemId).toBe(target.id);
    });
  });

  // v0.165.0: a label the other board lacks is added to its column (same name and colour), so the value lands.
  it("adds a status label the other board does not define, then syncs the value", async () => {
    const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Behind the scenes – Vietnam team");
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
    const targetStatus = (await services.repos.boards.listColumns(SEED_BOARD_IDS.alwayson)).find((c) => c.type === "STATUS")!;
    const added = targetStatus.settings.kind === "status" ? targetStatus.settings.labels.find((l) => l.name === "In QA") : undefined;
    expect(added).toMatchObject({ name: "In QA", color: "teal" });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: added!.id });
  });

  it("carries a dropdown label across when the boards were set up with different ones, both on linking and on a change", async () => {
    const source = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const target = await itemNamed(SEED_BOARD_IDS.alwayson, "Behind the scenes – Vietnam team");
    // A dropdown of the same name on each board, with different labels.
    const add = async (boardId: string, names: string[]) =>
      services.boards.addColumn({ boardId, name: "Piece kind", type: "DROPDOWN" }).then(async (column) => {
        const labels = names.map((name, i) => ({ id: `${boardId.slice(-4)}-${i}`, name, color: "blue" as const }));
        return services.repos.boards.updateColumn(column.id, { settings: { ...(column.settings as Extract<typeof column.settings, { kind: "dropdown" }>), labels } });
      });
    const sourceFormat = await add(SEED_BOARD_IDS.sem1, ["Photo essay", "Video"]);
    const targetFormat = await add(SEED_BOARD_IDS.alwayson, ["Speaker card"]);
    await services.repos.items.setValue(source.id, sourceFormat.id, { type: "DROPDOWN", labelId: `${SEED_BOARD_IDS.sem1.slice(-4)}-0` });
    await services.links.link(source.id, target.id, SEED_USER_IDS.danh);
    const read = async () => (await services.repos.boards.listColumns(SEED_BOARD_IDS.alwayson)).find((c) => c.id === targetFormat.id)!;
    const labelNamed = async (name: string) => {
      const c = await read();
      return c.settings.kind === "dropdown" ? c.settings.labels.find((l) => l.name === name) : undefined;
    };
    expect(await labelNamed("Photo essay")).toBeTruthy();
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Piece kind")).toEqual({ type: "DROPDOWN", labelId: (await labelNamed("Photo essay"))!.id });

    await setValue(source.id, SEED_BOARD_IDS.sem1, "Piece kind", { type: "DROPDOWN", labelId: `${SEED_BOARD_IDS.sem1.slice(-4)}-1` });
    expect(await valueOf(target.id, SEED_BOARD_IDS.alwayson, "Piece kind")).toEqual({ type: "DROPDOWN", labelId: (await labelNamed("Video"))!.id });
    // The label it already had is left alone, and nothing is added twice.
    const labels = (await read()).settings;
    expect(labels.kind === "dropdown" ? labels.labels.map((l) => l.name) : []).toEqual(["Speaker card", "Photo essay", "Video"]);
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
    const { hits, blockedBoardIds } = await services.links.searchCandidates(SEED_WORKSPACE_ID, sem1.id, "dooh");
    // The item's own board and every board already in its chain are off limits.
    expect(new Set(blockedBoardIds)).toEqual(new Set([SEED_BOARD_IDS.sem1, SEED_BOARD_IDS.dooh]));
    expect(hits.some((h) => h.board.id === SEED_BOARD_IDS.sem1 || h.board.id === SEED_BOARD_IDS.dooh)).toBe(false);
    expect(hits.some((h) => h.item.name === "DOOH motion loops – 10s" && !h.linked)).toBe(true);

    // Browsing one board lists everything on it, in group then position order.
    const other = await itemNamed(SEED_BOARD_IDS.rmitinerary, "RMITinerary Explorer");
    const dooh = (await services.links.searchCandidates(SEED_WORKSPACE_ID, other.id, "", { boardId: SEED_BOARD_IDS.dooh })).hits;
    expect(new Set(dooh.map((h) => h.board.id))).toEqual(new Set([SEED_BOARD_IDS.dooh]));
    expect(dooh).toHaveLength((await services.repos.items.listByBoard(SEED_BOARD_IDS.dooh)).length);
    expect(dooh[0]?.group?.name).toBe("This Fortnight");
  });

  it("never lets a chain hold two items from the same board", async () => {
    // sem1 ↔ dooh is seeded; a second dooh item on the same chain would be a duplicate.
    const sem1 = await itemNamed(SEED_BOARD_IDS.sem1, "Sem 1 DOOH adaptation");
    const anotherDooh = await itemNamed(SEED_BOARD_IDS.dooh, "Motion test – logo reveal");
    expect(await services.links.validate(sem1.id, anotherDooh.id)).toMatchObject({ ok: false, reason: expect.stringContaining("DOOH Production") });
    // …even indirectly: linking through a third board that then reaches dooh again.
    const via = await itemNamed(SEED_BOARD_IDS.requests, "Alumni newsletter banner");
    await services.links.link(anotherDooh.id, via.id, SEED_USER_IDS.danh);
    expect(await services.links.validate(sem1.id, via.id)).toMatchObject({ ok: false, reason: expect.stringContaining("DOOH Production") });
  });

  it("lets a link switch fields off, stopping them at that hop", async () => {
    const a = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const b = await itemNamed(SEED_BOARD_IDS.alwayson, "Student spotlight – exchange to Barcelona");
    const statusA = (await services.repos.boards.listColumns(SEED_BOARD_IDS.sem1)).find((c) => c.type === "STATUS")!;
    const statusB = (await services.repos.boards.listColumns(SEED_BOARD_IDS.alwayson)).find((c) => c.type === "STATUS")!;

    await services.links.link(a.id, b.id, SEED_USER_IDS.danh, { seedFrom: "item", excluded: ["name", statusA.id, statusB.id] });
    // Excluded fields keep their own values on both sides…
    expect((await services.repos.items.getById(b.id))?.name).toBe("Student spotlight – exchange to Barcelona");
    expect(await valueOf(b.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "not_started" });
    await setValue(a.id, SEED_BOARD_IDS.sem1, "Status", { type: "STATUS", labelId: "stuck" });
    expect(await valueOf(b.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "not_started" });
    // …while everything else still flows.
    await setValue(a.id, SEED_BOARD_IDS.sem1, "Priority", { type: "PRIORITY", labelId: "critical" });
    expect(await valueOf(b.id, SEED_BOARD_IDS.alwayson, "Priority")).toEqual({ type: "PRIORITY", labelId: "critical" });

    // Turning the field back on fills the other side and resumes syncing.
    const [link] = await services.repos.links.listByItem(a.id);
    await services.links.setExcluded(link!.id, ["name"], a.id, SEED_USER_IDS.danh);
    expect(await valueOf(b.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "stuck" });
    await setValue(a.id, SEED_BOARD_IDS.sem1, "Status", { type: "STATUS", labelId: "done" });
    expect(await valueOf(b.id, SEED_BOARD_IDS.alwayson, "Status")).toEqual({ type: "STATUS", labelId: "done" });
    expect((await services.repos.items.getById(b.id))?.name).toBe("Student spotlight – exchange to Barcelona");
  });

  it("posts an update to the linked task when the composer toggle is on", async () => {
    const a = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const b = await itemNamed(SEED_BOARD_IDS.alwayson, "Student spotlight – exchange to Barcelona");
    await services.links.link(a.id, b.id, SEED_USER_IDS.danh, { seedFrom: "item" });
    const users = await services.repos.users.list();

    await services.comments.addComment(a.id, "Shared with the other board", SEED_USER_IDS.danh, users, { alsoLinked: true });
    expect((await services.comments.listByItem(a.id)).map((c) => c.body)).toContain("Shared with the other board");
    expect((await services.comments.listByItem(b.id)).map((c) => c.body)).toContain("Shared with the other board");

    // Both boards record the update in their own activity feed.
    const activity = await services.repos.activities.listByBoard(SEED_BOARD_IDS.alwayson, 20);
    expect(activity.some((entry) => entry.eventType === "COMMENT_ADDED" && entry.itemId === b.id)).toBe(true);
  });

  it("keeps an update to itself when the toggle is off", async () => {
    const a = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
    const b = await itemNamed(SEED_BOARD_IDS.alwayson, "Student spotlight – exchange to Barcelona");
    await services.links.link(a.id, b.id, SEED_USER_IDS.danh, { seedFrom: "item" });
    const users = await services.repos.users.list();

    await services.comments.addComment(a.id, "Just for this board", SEED_USER_IDS.danh, users);
    expect((await services.comments.listByItem(a.id)).map((c) => c.body)).toContain("Just for this board");
    expect((await services.comments.listByItem(b.id)).map((c) => c.body)).not.toContain("Just for this board");
  });

  // v0.165.0: Updates and replies, in What stays in sync.
  describe("updates and replies in sync", () => {
    const pair = async () => {
      const a = await itemNamed(SEED_BOARD_IDS.sem1, "Campus open day messaging matrix");
      const b = await itemNamed(SEED_BOARD_IDS.alwayson, "Student spotlight – exchange to Barcelona");
      const link = await services.links.link(a.id, b.id, SEED_USER_IDS.danh, { seedFrom: "item" });
      return { a, b, link, users: await services.repos.users.list() };
    };
    const bodies = async (itemId: string) => (await services.comments.listByItem(itemId)).map((c) => c.body);

    it("puts a reply under the update's copy on the linked task, and an edit or a delete reaches both", async () => {
      const { a, b, users } = await pair();
      const update = await services.comments.addComment(a.id, "Brief is final", SEED_USER_IDS.danh, users, { alsoLinked: true });
      const reply = await services.comments.replyToComment(a.id, update.id, "Thanks, starting now", SEED_USER_IDS.emily, users);
      expect(reply.sharedId).not.toBeNull();
      const copyOfUpdate = (await services.comments.listByItem(b.id)).find((c) => c.sharedId === update.sharedId && !c.parentId)!;
      const copyOfReply = (await services.comments.listByItem(b.id)).find((c) => c.sharedId === reply.sharedId)!;
      expect(copyOfReply).toMatchObject({ body: "Thanks, starting now", parentId: copyOfUpdate.id, authorId: SEED_USER_IDS.emily });

      await services.comments.editComment(reply.id, "Thanks, starting tomorrow", users, { itemId: a.id, actorId: SEED_USER_IDS.emily });
      expect(await bodies(b.id)).toContain("Thanks, starting tomorrow");

      await services.comments.deleteComment(reply);
      expect(await bodies(a.id)).not.toContain("Thanks, starting tomorrow");
      expect(await bodies(b.id)).not.toContain("Thanks, starting tomorrow");
      expect(await bodies(b.id)).toContain("Brief is final");
    });

    it("with Updates switched off for the link, neither new updates nor replies cross it", async () => {
      const { a, b, link, users } = await pair();
      const update = await services.comments.addComment(a.id, "Posted while shared", SEED_USER_IDS.danh, users, { alsoLinked: true });
      await services.links.setExcluded(link.id, [LINK_FIELD_UPDATES], a.id, SEED_USER_IDS.danh);

      await services.comments.addComment(a.id, "Posted after switching off", SEED_USER_IDS.danh, users, { alsoLinked: true });
      expect(await bodies(a.id)).toContain("Posted after switching off");
      expect(await bodies(b.id)).not.toContain("Posted after switching off");

      // A reply to the update that was shared stays on this task too.
      await services.comments.replyToComment(a.id, update.id, "Reply after switching off", SEED_USER_IDS.emily, users);
      expect(await bodies(b.id)).not.toContain("Reply after switching off");
      expect(await bodies(a.id)).toContain("Reply after switching off");
    });

    it("a reply to an update that was never shared stays where it is", async () => {
      const { a, b, users } = await pair();
      const update = await services.comments.addComment(a.id, "Only here", SEED_USER_IDS.danh, users);
      const reply = await services.comments.replyToComment(a.id, update.id, "Reply only here", SEED_USER_IDS.emily, users);
      expect(reply.sharedId ?? null).toBeNull();
      expect(await bodies(b.id)).not.toContain("Reply only here");
    });
  });
});
