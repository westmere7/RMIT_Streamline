import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { Board, BoardGroup, Item } from "@/domain";
import { INTAKE_MANUAL_MESSAGE, intakeGroupOf } from "@/domain";
import { createServices } from "@/services";

/**
 * Booked by Form takes bookings only (v0.141), and Re-allocate sends a task back
 * to Task Allocation reset as if just booked, linked tasks included. Moving a
 * task keeps linked tasks off one board and its link pairings pointing at the
 * columns it now has.
 */
describe("Task Allocation: Booked by Form, re-allocating, and links", () => {
  let services: ReturnType<typeof createServices>;
  let repos: ReturnType<typeof createLocalRepositories>;
  let queue: Board;
  let intake: BoardGroup;
  let other: BoardGroup;
  let boards: Board[];
  const danh = SEED_USER_IDS.danh;
  const users = async () => repos.users.list();

  beforeEach(async () => {
    repos = createLocalRepositories({ databaseName: `realloc-${Date.now()}-${Math.random()}` });
    services = createServices(repos);
    const all = await repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    queue = all.find((b) => b.system === "TASK_ALLOCATION")!;
    const groups = await repos.boards.listGroups(queue.id);
    intake = intakeGroupOf(groups)!;
    other = groups.find((g) => g.id !== intake.id)!;
    boards = [];
    for (const b of all.filter((b) => !b.system && !b.archivedAt)) if ((await repos.boards.listColumns(b.id)).some((c) => c.type === "STATUS")) boards.push(b);
  });

  describe("Booked by Form takes bookings only", () => {
    it("refuses a task made by hand there, and a copy of one; a booking, a subitem and another group are fine", async () => {
      await expect(services.items.createItem({ boardId: queue.id, groupId: intake.id, name: "By hand" }, danh)).rejects.toThrow(INTAKE_MANUAL_MESSAGE);
      const booked = await services.items.createItem({ boardId: queue.id, groupId: intake.id, name: "Booked", activity: { via: "booking" } }, danh);
      await expect(services.items.createItem({ boardId: queue.id, groupId: intake.id, parentItemId: booked.id, name: "A step" }, danh)).resolves.toMatchObject({ parentItemId: booked.id });
      await expect(services.items.createItem({ boardId: queue.id, groupId: other.id, name: "Elsewhere" }, danh)).resolves.toMatchObject({ groupId: other.id });
      await expect(services.items.duplicateItem(booked.id, danh)).rejects.toThrow(INTAKE_MANUAL_MESSAGE);
    });
  });

  describe("re-allocating", () => {
    let item: Item;
    let partner: Item;
    let board: Board;

    beforeEach(async () => {
      board = boards[0]!;
      // A booking that went straight to a team's board: the kind that can come back.
      const seat = (await repos.items.listByBoard(board.id)).find((i) => !i.parentItemId)!;
      item = await services.items.createItem({ boardId: board.id, groupId: seat.groupId, name: "Booked poster", activity: { via: "booking", requesterName: "Priya" } }, danh);
      expect(item.bookedVia).toBe("booking");
      const columns = await repos.boards.listColumns(board.id);
      const status = columns.find((c) => c.type === "STATUS")!;
      const person = columns.find((c) => c.type === "PERSON");
      const labels = (status.settings as { labels: Array<{ id: string }> }).labels;
      await repos.items.setValues([
        { itemId: item.id, columnId: status.id, value: { type: "STATUS", labelId: labels[labels.length - 1]!.id } },
        ...(person ? [{ itemId: item.id, columnId: person.id, value: { type: "PERSON" as const, userIds: [SEED_USER_IDS.jun] } }] : []),
      ]);
      await services.items.createItem({ boardId: board.id, groupId: item.groupId, parentItemId: item.id, name: "Team's step" }, danh);
      await services.comments.addComment(item.id, "Started on this", danh, await users());
      await repos.itemAssets.createMany([{ itemId: item.id, boardId: board.id, position: 0, createdBy: danh, name: "Poster", assigneeIds: [SEED_USER_IDS.jun], completedAt: new Date().toISOString() }]);
      await services.subscriptions.follow(SEED_USER_IDS.jun, SEED_WORKSPACE_ID, { boardId: board.id, itemId: item.id }, ["status"]);
      partner = (await repos.items.listByBoard(boards[1]!.id)).find((i) => !i.parentItemId)!;
      await services.links.link(item.id, partner.id, danh);
      await services.comments.addComment(partner.id, "The partner's own note", danh, await users());
    });

    it("previews what goes and what stays, and offers every group but Booked by Form", async () => {
      const preview = await services.reallocation.preview(item.id);
      expect(preview.board.id).toBe(queue.id);
      expect(preview.groups.map((g) => g.id)).not.toContain(intake.id);
      expect(preview.groups.length).toBeGreaterThan(0);
      expect(preview).toMatchObject({ subitems: 1, links: 1, followers: 1, assetsReset: 1 });
      expect(preview.updates).toBeGreaterThanOrEqual(1);
      // The people and status are reset, not listed as lost.
      const columns = await repos.boards.listColumns(board.id);
      const reset = new Set(columns.filter((c) => ["PERSON", "PEOPLE", "STATUS"].includes(c.type)).map((c) => c.id));
      for (const l of preview.lost) expect(reset.has(l.columnId)).toBe(false);
    });

    it("resets it onto Task Allocation as if just booked, leaving the linked task its own", async () => {
      const firstBefore = (await repos.activities.listByItem(item.id)).filter((a) => a.eventType === "ITEM_CREATED").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
      const { item: moved } = await services.reallocation.reallocate(item.id, danh, { groupId: other.id });
      expect(moved).toMatchObject({ boardId: queue.id, groupId: other.id, createdAt: item.createdAt });

      // The log keeps only the first entry, so the journey starts again there.
      expect((await repos.activities.listByItem(item.id)).map((a) => a.id)).toEqual([firstBefore.id]);
      expect(await repos.comments.listByItem(item.id)).toEqual([]);
      expect((await repos.items.listByBoard(queue.id, { includeArchived: true })).filter((i) => i.parentItemId === item.id)).toEqual([]);
      expect(await repos.links.listByItem(item.id)).toEqual([]);
      expect((await repos.subscriptions.listByBoards([board.id, queue.id])).filter((s) => s.itemId === item.id)).toEqual([]);
      const [asset] = await repos.itemAssets.listByItem(item.id);
      expect(asset).toMatchObject({ name: "Poster", assigneeIds: [], completedAt: null, boardId: queue.id });

      // No person value stays, and the status is the queue's default, if it has one.
      const queueColumns = await repos.boards.listColumns(queue.id);
      const values = await repos.items.listValuesByItem(item.id);
      for (const v of values) expect(queueColumns.some((c) => c.id === v.columnId)).toBe(true);
      expect(values.some((v) => v.value.type === "PERSON" || v.value.type === "PEOPLE")).toBe(false);
      for (const c of queueColumns.filter((c) => c.type === "STATUS")) {
        const def = (c.settings as { defaultLabelId?: string }).defaultLabelId;
        const v = values.find((x) => x.columnId === c.id)?.value;
        if (def) expect(v).toEqual({ type: "STATUS", labelId: def });
        else expect(v).toBeUndefined();
      }

      // The linked task keeps its own thread and is where it was.
      expect((await repos.items.getById(partner.id))?.boardId).toBe(boards[1]!.id);
      expect((await repos.comments.listByItem(partner.id)).map((c) => c.body)).toContain("The partner's own note");
    });

    it("refuses Booked by Form as the group, and makes a new group when asked", async () => {
      await expect(services.reallocation.reallocate(item.id, danh, { groupId: intake.id })).rejects.toThrow("other than Booked by Form");
      expect((await repos.items.getById(item.id))?.boardId).toBe(board.id);
      const { item: moved } = await services.reallocation.reallocate(item.id, danh, { newGroupName: "  Back from teams  " });
      const group = (await repos.boards.listGroups(queue.id)).find((g) => g.id === moved.groupId)!;
      expect(group).toMatchObject({ name: "Back from teams", role: null });
      expect(intakeGroupOf(await repos.boards.listGroups(queue.id))?.id).toBe(intake.id);
    });

    it("refuses a task a team made itself: it never came through the form", async () => {
      const own = await services.items.createItem({ boardId: board.id, groupId: item.groupId, name: "Team's own" }, danh);
      expect(own.bookedVia).toBeNull();
      await expect(services.reallocation.preview(own.id)).rejects.toThrow("came in through the booking form");
      await expect(services.reallocation.reallocate(own.id, danh, { groupId: other.id })).rejects.toThrow("came in through the booking form");
    });

    it("keeps the task marked as booked wherever it goes", async () => {
      const { item: moved } = await services.itemMoves.moveToBoard(item.id, boards[2]!.id, danh);
      expect(moved.bookedVia).toBe("booking");
      const { item: back } = await services.reallocation.reallocate(item.id, danh, { groupId: other.id });
      expect(back.bookedVia).toBe("booking");
    });

    it("refuses a subitem, and a task already on Task Allocation", async () => {
      const sub = (await repos.items.listByBoard(board.id)).find((i) => i.parentItemId === item.id)!;
      await expect(services.reallocation.reallocate(sub.id, danh, { groupId: other.id })).rejects.toThrow("Re-allocate the task instead");
      const booked = await services.items.createItem({ boardId: queue.id, groupId: intake.id, name: "Booked", activity: { via: "booking" } }, danh);
      await expect(services.reallocation.reallocate(booked.id, danh, { groupId: other.id })).rejects.toThrow("not on a team's board");
    });
  });

  describe("moving a linked task", () => {
    it("refuses the board its linked task is on, and re-points the link's pairings to the new columns", async () => {
      const [a, b, c] = boards;
      const item = (await repos.items.listByBoard(a!.id)).find((i) => !i.parentItemId)!;
      const partner = (await repos.items.listByBoard(b!.id)).find((i) => !i.parentItemId)!;
      const link = await services.links.link(item.id, partner.id, danh);
      await expect(services.itemMoves.moveToBoard(item.id, b!.id, danh)).rejects.toThrow("linked tasks can't share a board");
      expect((await repos.items.getById(item.id))?.boardId).toBe(a!.id);

      // A hand pairing from a's status to b's status, and an unsynced column of a's.
      const [statusA] = (await repos.boards.listColumns(a!.id)).filter((x) => x.type === "STATUS");
      const [statusB] = (await repos.boards.listColumns(b!.id)).filter((x) => x.type === "STATUS");
      const lone = (await repos.boards.listColumns(a!.id)).find((x) => x.type === "TEXT" || x.type === "LONG_TEXT");
      await repos.links.update(link.id, { pairs: [[statusA!.id, statusB!.id]], excluded: ["name", ...(lone ? [lone.id] : [])] });
      const { plan } = await services.itemMoves.moveToBoard(item.id, c!.id, danh);
      const after = (await repos.links.getById(link.id))!;
      const statusC = plan.columnMap[statusA!.id];
      expect(after.pairs).toEqual(statusC ? [[statusC, statusB!.id]] : []);
      expect(after.excluded).toContain("name");
      const cColumns = new Set((await repos.boards.listColumns(c!.id)).map((x) => x.id));
      const aColumns = new Set((await repos.boards.listColumns(a!.id)).map((x) => x.id));
      for (const f of after.excluded) expect(aColumns.has(f)).toBe(false);
      for (const f of after.excluded.filter((x) => x !== "name")) expect(cColumns.has(f)).toBe(true);
    });
  });
});
