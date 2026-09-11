import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { DEFAULT_ARCHIVE_SORT, EMPTY_ARCHIVE_FILTERS, EMPTY_ARCHIVE_REQUEST, type ArchiveRequest } from "@/domain";
import { createServices, resolveArchiveFilters } from "@/services";

let counter = 0;

/**
 * The archive: a board's items after they have been taken off it.
 *
 * The point of the whole feature is that a board which only ever grows stays
 * openable, so the tests that matter are the ones about *bounds* — a page is a
 * page whatever the archive holds, the count is of the filtered archive rather
 * than the page, and filtering happens before the page is cut, not after.
 */
describe("Board archive", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `archive-${Date.now()}-${counter}` }));
  });

  const board = SEED_BOARD_IDS.sem1;
  const actor = SEED_USER_IDS.danh;

  const request = (patch: Partial<ArchiveRequest> = {}): ArchiveRequest => ({ ...EMPTY_ARCHIVE_REQUEST, ...patch });

  /** Archives `count` top-level items of the board and returns them, oldest first. */
  async function archiveSome(count: number) {
    const items = (await services.repos.items.listByBoard(board)).filter((i) => i.parentItemId === null).slice(0, count);
    // One at a time, so each gets its own archived_at and the order is knowable.
    for (const item of items) await services.items.archiveItems(board, [item.id], actor);
    return items;
  }

  describe("reading a page", () => {
    it("cuts a page from the archive and counts the whole of it", async () => {
      await archiveSome(12);

      const first = await services.items.loadArchivePage(board, request({ pageSize: 10, page: 1 }));
      const second = await services.items.loadArchivePage(board, request({ pageSize: 10, page: 2 }));

      expect(first.items).toHaveLength(10);
      expect(second.items).toHaveLength(2);
      // The count is of the archive, not of the page: it is what the pager counts.
      expect(first.total).toBe(12);
      expect(second.total).toBe(12);
      expect(first.page).toBe(1);
      expect(second.page).toBe(2);
      // No row is on two pages.
      expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(12);
    });

    it("brings back the values and links of the page and of nothing else", async () => {
      await archiveSome(12);
      const page = await services.items.loadArchivePage(board, request({ pageSize: 10 }));

      const onPage = new Set(page.items.map((i) => i.id));
      expect(onPage.size).toBe(10);
      expect(page.values.every((v) => onPage.has(v.itemId))).toBe(true);
      // The board's groups and columns travel whole: a row has to say which
      // group it would go back to, and its cells have to render.
      expect(page.groups.length).toBeGreaterThan(0);
      expect(page.columns.length).toBeGreaterThan(0);
    });

    it("leaves the board's own read alone", async () => {
      const before = (await services.repos.items.listByBoard(board)).length;
      const [archived] = await archiveSome(1);

      const onBoard = await services.repos.items.listByBoard(board);
      expect(onBoard).toHaveLength(before - 1);
      expect(onBoard.some((i) => i.id === archived!.id)).toBe(false);
      expect(await services.items.countArchived(board)).toBe(1);
    });

    it("lists top-level items only: a subitem goes away with its parent and comes back with it", async () => {
      const parent = (await services.repos.items.listByBoard(board)).find((i) => i.parentItemId === null)!;
      const child = await services.items.createItem({ boardId: board, groupId: parent.groupId, parentItemId: parent.id, name: "A subitem" }, actor);
      await services.items.archiveItems(board, [parent.id], actor);

      const page = await services.items.loadArchivePage(board, request());
      expect(page.items.map((i) => i.id)).toEqual([parent.id]);
      // The child was never archived in its own right; restoring the parent is
      // what brings the pair back.
      expect((await services.repos.items.getById(child.id))!.archivedAt).toBeNull();
    });
  });

  describe("ordering", () => {
    it("puts the most recently archived first, and turns round on request", async () => {
      const archived = await archiveSome(4);
      const names = archived.map((i) => i.name);

      const newest = await services.items.loadArchivePage(board, request());
      const oldest = await services.items.loadArchivePage(board, request({ sort: { field: "archivedAt", direction: "asc" } }));

      expect(DEFAULT_ARCHIVE_SORT).toEqual({ field: "archivedAt", direction: "desc" });
      expect(newest.items.map((i) => i.name)).toEqual([...names].reverse());
      expect(oldest.items.map((i) => i.name)).toEqual(names);
    });

    it("sorts by name when asked", async () => {
      await archiveSome(6);
      const page = await services.items.loadArchivePage(board, request({ sort: { field: "name", direction: "asc" } }));
      const names = page.items.map((i) => i.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe("filtering", () => {
    it("searches the name and the booking code, and counts what matched rather than the page", async () => {
      const items = await archiveSome(8);
      const target = items[3]!;

      const byName = await services.items.loadArchivePage(board, request({ search: target.name.slice(0, 12) }));
      expect(byName.total).toBeGreaterThan(0);
      expect(byName.items.every((i) => i.name.toLowerCase().includes(target.name.slice(0, 12).toLowerCase()))).toBe(true);

      const nothing = await services.items.loadArchivePage(board, request({ search: "no task is called this" }));
      expect(nothing.items).toHaveLength(0);
      expect(nothing.total).toBe(0);
    });

    it("filters by the group an item would go back to", async () => {
      const items = await archiveSome(10);
      const groupId = items[0]!.groupId;
      const expected = items.filter((i) => i.groupId === groupId).length;

      const page = await services.items.loadArchivePage(board, request({ filters: { ...EMPTY_ARCHIVE_FILTERS, groupIds: [groupId] } }));
      expect(page.total).toBe(expected);
      expect(page.items.every((i) => i.groupId === groupId)).toBe(true);
    });

    it("filters by a status label, across every page", async () => {
      const items = await archiveSome(10);
      const columns = await services.repos.boards.listColumns(board);
      const status = columns.find((c) => c.type === "STATUS")!;
      const labels = status.settings.kind === "status" ? status.settings.labels : [];
      const labelId = labels[1]!.id;
      const otherId = labels[0]!.id;
      const users = await services.repos.users.list();
      const boardRow = (await services.repos.boards.getById(board))!;
      // Every archived item is given a status, so the two that carry the one
      // being filtered for are the only two that could come back.
      for (const [index, item] of items.entries()) {
        const value = { type: "STATUS" as const, labelId: index < 2 ? labelId : otherId };
        await services.items.setValue(item.id, status.id, value, { column: status, item, board: boardRow, users }, actor);
      }

      const page = await services.items.loadArchivePage(board, request({ pageSize: 10, filters: { ...EMPTY_ARCHIVE_FILTERS, statusIds: [labelId] } }));
      expect(page.total).toBe(2);
      expect(page.items.map((i) => i.id).sort()).toEqual(items.slice(0, 2).map((i) => i.id).sort());
    });

    it("filters by owner, matching any of the people chosen", async () => {
      const items = await archiveSome(6);
      const columns = await services.repos.boards.listColumns(board);
      const person = columns.find((c) => c.type === "PERSON")!;
      const users = await services.repos.users.list();
      const boardRow = (await services.repos.boards.getById(board))!;
      for (const [index, item] of items.entries()) {
        const userIds = index < 2 ? [SEED_USER_IDS.emily] : index < 4 ? [SEED_USER_IDS.jun] : [];
        await services.items.setValue(item.id, person.id, { type: "PERSON", userIds }, { column: person, item, board: boardRow, users }, actor);
      }

      const one = await services.items.loadArchivePage(board, request({ filters: { ...EMPTY_ARCHIVE_FILTERS, personIds: [SEED_USER_IDS.emily] } }));
      const either = await services.items.loadArchivePage(board, request({ filters: { ...EMPTY_ARCHIVE_FILTERS, personIds: [SEED_USER_IDS.emily, SEED_USER_IDS.jun] } }));

      expect(one.total).toBe(2);
      // Within one kind the choices are an "any of", so two people is the union.
      expect(either.total).toBe(4);
    });

    it("narrows, rather than widens, when two kinds are used at once", async () => {
      const items = await archiveSome(6);
      const columns = await services.repos.boards.listColumns(board);
      const person = columns.find((c) => c.type === "PERSON")!;
      const users = await services.repos.users.list();
      const boardRow = (await services.repos.boards.getById(board))!;
      for (const item of items.slice(0, 3)) {
        await services.items.setValue(item.id, person.id, { type: "PERSON", userIds: [SEED_USER_IDS.emily] }, { column: person, item, board: boardRow, users }, actor);
      }
      const groupId = items[0]!.groupId;

      const page = await services.items.loadArchivePage(
        board,
        request({ filters: { ...EMPTY_ARCHIVE_FILTERS, personIds: [SEED_USER_IDS.emily], groupIds: [groupId] } }),
      );
      expect(page.items.every((i) => i.groupId === groupId)).toBe(true);
      expect(page.total).toBeLessThanOrEqual(3);
    });

    it("drops a filter the board has no column to answer", async () => {
      const columns = await services.repos.boards.listColumns(board);
      const resolved = resolveArchiveFilters(
        request({ filters: { ...EMPTY_ARCHIVE_FILTERS, statusIds: ["whatever"], tags: ["Video"] } }),
        columns.filter((c) => c.type !== "STATUS" && c.type !== "TAGS"),
      );
      // Nothing on the board can answer it, so it is not asked rather than
      // asked and silently matching nothing.
      expect(resolved.status).toBeNull();
      expect(resolved.tags).toBeNull();
    });
  });

  describe("opening one task from anywhere", () => {
    it("carries an item the page does not hold, without counting it as a row", async () => {
      const items = await archiveSome(12);
      const offPage = items[0]!; // oldest, so it is on the last page

      const page = await services.items.loadArchivePage(board, request({ pageSize: 10 }), { focusItemId: offPage.id });

      expect(page.focusItemId).toBe(offPage.id);
      expect(page.items.map((i) => i.id)).toContain(offPage.id);
      // The pager still counts the archive, and the page is still a page.
      expect(page.total).toBe(12);
      expect(page.items.filter((i) => i.id !== page.focusItemId)).toHaveLength(10);
      expect(page.values.some((v) => v.itemId === offPage.id)).toBe(true);
    });

    it("ignores an item that belongs to another board", async () => {
      await archiveSome(2);
      const stranger = (await services.repos.items.listByBoard(SEED_BOARD_IDS.dooh))[0]!;
      const page = await services.items.loadArchivePage(board, request(), { focusItemId: stranger.id });
      expect(page.focusItemId).toBeNull();
      expect(page.items.some((i) => i.id === stranger.id)).toBe(false);
    });
  });

  describe("restoring", () => {
    it("puts an item back in the group and the place it came from", async () => {
      const [item] = await archiveSome(1);
      const { groupId, position } = item!;

      await services.items.restoreItems([item!.id], actor);

      const restored = (await services.repos.items.getById(item!.id))!;
      expect(restored.archivedAt).toBeNull();
      expect(restored.groupId).toBe(groupId);
      expect(restored.position).toBe(position);
      expect((await services.repos.items.listByBoard(board)).some((i) => i.id === item!.id)).toBe(true);
      expect(await services.items.countArchived(board)).toBe(0);
    });

    it("records who restored it, so the board's history reads both ways", async () => {
      const [item] = await archiveSome(1);
      await services.items.restoreItems([item!.id], actor);

      const activity = await services.repos.activities.listByBoard(board, 50);
      expect(activity.some((a) => a.eventType === "ITEM_ARCHIVED" && a.itemId === item!.id)).toBe(true);
      expect(activity.some((a) => a.eventType === "ITEM_RESTORED" && a.itemId === item!.id)).toBe(true);
    });

    it("restores a selection in one go", async () => {
      const items = await archiveSome(4);
      await services.items.restoreItems(items.map((i) => i.id), actor);
      expect(await services.items.countArchived(board)).toBe(0);
    });
  });

  describe("links", () => {
    /**
     * A pair the workspace already links across two boards.
     *
     * The seed has them, and a board only accepts one end of a chain, so
     * inventing another pair means first taking an existing one apart. Using
     * what is there keeps the test about archiving.
     */
    async function linkedPair() {
      const onBoard = (await services.repos.items.listByBoard(board)).filter((i) => i.parentItemId === null);
      for (const here of onBoard) {
        const [link] = await services.repos.links.listByItem(here.id);
        if (!link) continue;
        const otherId = link.itemAId === here.id ? link.itemBId : link.itemAId;
        const there = (await services.repos.items.getById(otherId))!;
        if (there.boardId !== board) return { here, there };
      }
      throw new Error("The seed has no cross-board link on this board");
    }

    it("reports what archiving would reach before anything is archived", async () => {
      const { here, there } = await linkedPair();

      const impact = await services.items.archiveLinkImpact([here.id]);
      expect(impact.linkedItemIds).toEqual([here.id]);
      expect(impact.connectedItemIds).toContain(there.id);
      expect(impact.connectedBoardIds).toContain(there.boardId);
      // Nothing has moved: it is a question, not an action.
      expect((await services.repos.items.getById(here.id))!.archivedAt).toBeNull();
    });

    it("breaks the links and leaves the other board alone", async () => {
      const { here, there } = await linkedPair();

      await services.items.archiveItems(board, [here.id], actor, { links: "break" });

      expect((await services.repos.items.getById(here.id))!.archivedAt).not.toBeNull();
      // The twin stays where it is, and stops following a task nobody can see.
      expect((await services.repos.items.getById(there.id))!.archivedAt).toBeNull();
      expect(await services.repos.links.listByItem(here.id)).toHaveLength(0);
      expect(await services.repos.links.listByItem(there.id)).toHaveLength(0);
    });

    it("takes the linked items with it, on their own boards, when asked to", async () => {
      const { here, there } = await linkedPair();

      await services.items.archiveItems(board, [here.id], actor, { links: "cascade" });

      expect((await services.repos.items.getById(here.id))!.archivedAt).not.toBeNull();
      expect((await services.repos.items.getById(there.id))!.archivedAt).not.toBeNull();
      // They left together, so the link is still worth keeping.
      expect(await services.repos.links.listByItem(here.id)).toHaveLength(1);
      // Each board records its own archiving.
      const otherActivity = await services.repos.activities.listByBoard(there.boardId, 50);
      expect(otherActivity.some((a) => a.eventType === "ITEM_ARCHIVED" && a.itemId === there.id)).toBe(true);
      // And the other board's archive is where it now shows up.
      const page = await services.items.loadArchivePage(there.boardId, request());
      expect(page.items.map((i) => i.id)).toContain(there.id);
    });

    it("leaves links alone when no policy is given", async () => {
      const { here, there } = await linkedPair();
      await services.items.archiveItems(board, [here.id], actor);
      expect(await services.repos.links.listByItem(here.id)).toHaveLength(1);
      expect((await services.repos.items.getById(there.id))!.archivedAt).toBeNull();
    });
  });

  describe("the rest of the app", () => {
    it("keeps archived work in the workspace dashboard", async () => {
      const { loadDashboardSnapshot } = await import("@/services/dashboard-service");
      const { buildFacts } = await import("@/features/dashboard/analytics");
      const boards = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);

      const before = buildFacts(await loadDashboardSnapshot(services.repos, SEED_WORKSPACE_ID, boards));
      await archiveSome(3);
      const after = buildFacts(await loadDashboardSnapshot(services.repos, SEED_WORKSPACE_ID, boards));

      // Work that was delivered and then tidied away is still work the year
      // did. Archiving is housekeeping, not a retraction.
      expect(after.tasks).toHaveLength(before.tasks.length);
    });

    it("finds archived items in search only when asked, and says that is what they are", async () => {
      const [item] = await archiveSome(1);

      const plain = await services.search.search(SEED_WORKSPACE_ID, item!.name);
      expect(plain.items.some((hit) => hit.item.id === item!.id)).toBe(false);

      const withArchive = await services.search.search(SEED_WORKSPACE_ID, item!.name, { includeArchived: true });
      const hit = withArchive.items.find((h) => h.item.id === item!.id);
      expect(hit).toBeDefined();
      expect(hit!.archived).toBe(true);
    });

    it("puts live work above archived work in the results", async () => {
      const items = (await services.repos.items.listByBoard(board)).filter((i) => i.parentItemId === null);
      const live = items[0]!;
      // A second item with the same name, archived: the live one must win.
      const twin = await services.items.createItem({ boardId: board, groupId: live.groupId, name: live.name }, actor);
      await services.items.archiveItems(board, [twin.id], actor);

      const results = await services.search.search(SEED_WORKSPACE_ID, live.name, { includeArchived: true });
      const both = results.items.filter((h) => h.item.name === live.name);
      expect(both.length).toBeGreaterThan(1);
      expect(both[0]!.archived).toBe(false);
    });
  });
});
