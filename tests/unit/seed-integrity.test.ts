import { describe, expect, it } from "vitest";
import { buildSeed, buildSeedParts, SEED_BOOKING_KEY, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { isPlausibleBookingKey } from "@/domain";
import { taskAllocationColumns } from "@/services/booking-service";

const NOW = new Date("2026-09-07T09:30:00.000Z");

describe("the demo seed", () => {
  const seed = buildSeed(NOW);
  const ids = <T extends { id: string }>(rows: readonly T[]) => new Set(rows.map((r) => r.id));
  const users = ids(seed.users);
  const teams = ids(seed.teams);
  const boards = ids(seed.boards);
  const columns = ids(seed.boardColumns);
  const items = ids(seed.items);
  const trackers = ids(seed.trackers);
  const boardOf = new Map(seed.items.map((i) => [i.id, i.boardId]));
  const groupBoard = new Map(seed.boardGroups.map((g) => [g.id, g.boardId]));
  const columnBoard = new Map(seed.boardColumns.map((c) => [c.id, c.boardId]));

  it("has no duplicate ids anywhere, base and extras included", () => {
    const all: string[] = [];
    for (const [key, rows] of Object.entries(seed)) {
      if (key === "boardVisits") continue; // keyed by user:board, not a uuid
      for (const row of rows as Array<{ id: string }>) all.push(row.id);
    }
    expect(new Set(all).size).toBe(all.length);
    // Every id is a well-formed uuid, so Postgres accepts it.
    for (const id of all) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps every reference resolvable", () => {
    for (const m of seed.workspaceMembers) expect(users.has(m.userId), `member ${m.id}`).toBe(true);
    for (const m of seed.teamMembers) {
      expect(teams.has(m.teamId), `team member ${m.id}`).toBe(true);
      expect(users.has(m.userId), `team member ${m.id}`).toBe(true);
    }
    for (const b of seed.boards) {
      expect(b.workspaceId).toBe(SEED_WORKSPACE_ID);
      expect(users.has(b.ownerId), `board ${b.name}`).toBe(true);
      if (b.teamId) expect(teams.has(b.teamId), `board ${b.name}`).toBe(true);
    }
    for (const m of seed.boardMembers) {
      expect(boards.has(m.boardId), `board member ${m.id}`).toBe(true);
      expect(users.has(m.userId), `board member ${m.id}`).toBe(true);
    }
    for (const g of seed.boardGroups) expect(boards.has(g.boardId), `group ${g.name}`).toBe(true);
    for (const c of seed.boardColumns) expect(boards.has(c.boardId), `column ${c.name}`).toBe(true);
    for (const i of seed.items) {
      expect(boards.has(i.boardId), `item ${i.name}`).toBe(true);
      expect(groupBoard.get(i.groupId), `item ${i.name} group`).toBe(i.boardId);
      expect(users.has(i.createdBy), `item ${i.name} creator`).toBe(true);
      if (i.parentItemId) expect(boardOf.get(i.parentItemId), `subitem ${i.name}`).toBe(i.boardId);
    }
    for (const v of seed.itemColumnValues) {
      expect(items.has(v.itemId), `value ${v.id}`).toBe(true);
      expect(columns.has(v.columnId), `value ${v.id}`).toBe(true);
      // The trigger enforce_value_same_board: the column sits on the item's board.
      expect(columnBoard.get(v.columnId), `value ${v.id} board`).toBe(boardOf.get(v.itemId));
      if (v.value.type === "PERSON") for (const u of v.value.userIds) expect(users.has(u)).toBe(true);
      if (v.value.type === "DEPENDENCY") for (const d of v.value.itemIds) expect(items.has(d)).toBe(true);
    }
    for (const l of seed.itemLinks) {
      expect(items.has(l.itemAId) && items.has(l.itemBId), `link ${l.id}`).toBe(true);
      expect(l.itemAId < l.itemBId, `link ${l.id} ordered`).toBe(true);
      expect(boardOf.get(l.itemAId), `link ${l.id} boards differ`).not.toBe(boardOf.get(l.itemBId));
      expect(users.has(l.createdBy)).toBe(true);
    }
    for (const t of seed.trackers) {
      expect(users.has(t.createdBy), `tracker ${t.name}`).toBe(true);
      if (t.teamId) expect(teams.has(t.teamId), `tracker ${t.name}`).toBe(true);
    }
    for (const s of seed.trackerSheets) {
      expect(trackers.has(s.trackerId), `sheet ${s.name}`).toBe(true);
      const columnIds = new Set(s.columns.map((c) => c.id));
      for (const row of s.rows) for (const columnId of Object.keys(row.cells)) expect(columnIds.has(columnId), `sheet ${s.name} cell`).toBe(true);
    }
    for (const c of seed.comments) {
      expect(items.has(c.itemId), `comment ${c.id}`).toBe(true);
      expect(users.has(c.authorId), `comment ${c.id}`).toBe(true);
      for (const u of c.mentionUserIds) expect(users.has(u)).toBe(true);
    }
    for (const a of seed.activities) {
      expect(users.has(a.actorId), `activity ${a.id}`).toBe(true);
      if (a.boardId) expect(boards.has(a.boardId), `activity ${a.id}`).toBe(true);
      if (a.itemId) expect(items.has(a.itemId), `activity ${a.id}`).toBe(true);
    }
    for (const n of seed.notifications) {
      expect(users.has(n.userId), `notification ${n.id}`).toBe(true);
      if (n.actorId) expect(users.has(n.actorId)).toBe(true);
      if (n.boardId) expect(boards.has(n.boardId), `notification ${n.id}`).toBe(true);
      if (n.entityType === "ITEM") expect(items.has(n.entityId), `notification ${n.title}`).toBe(true);
      if (n.entityType === "BOARD") expect(boards.has(n.entityId), `notification ${n.title}`).toBe(true);
    }
    for (const m of seed.directMessages) {
      expect(users.has(m.senderId) && users.has(m.recipientId), `message ${m.id}`).toBe(true);
      expect(m.senderId).not.toBe(m.recipientId);
      expect(m.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries exactly one Admin team and one Task Allocation board, shaped as the app would make them", () => {
    const adminTeams = seed.teams.filter((t) => t.system === "ADMIN");
    const allocationBoards = seed.boards.filter((b) => b.system === "TASK_ALLOCATION");
    expect(adminTeams).toHaveLength(1);
    expect(allocationBoards).toHaveLength(1);
    const board = allocationBoards[0]!;
    expect(board.teamId).toBe(adminTeams[0]!.id);
    expect(board.visibility).toBe("TEAM");
    expect(seed.boardGroups.filter((g) => g.boardId === board.id).map((g) => g.name)).toEqual(["Incoming", "Allocated", "Closed"]);
    expect(seed.boardColumns.filter((c) => c.boardId === board.id).sort((a, b) => a.position - b.position).map((c) => c.name)).toEqual(taskAllocationColumns([]).map((c) => c.name));
    // Only owners and admins are on the board and in the team.
    const admins = new Set(seed.workspaceMembers.filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN")).map((m) => m.userId));
    for (const m of seed.boardMembers.filter((m) => m.boardId === board.id)) expect(admins.has(m.userId)).toBe(true);
    for (const m of seed.teamMembers.filter((m) => m.teamId === adminTeams[0]!.id)) expect(admins.has(m.userId)).toBe(true);

    // Bookings: 5 incoming, 2 allocated (each linked to a mirror on a team board), 1 closed.
    const groupsByName = new Map(seed.boardGroups.filter((g) => g.boardId === board.id).map((g) => [g.name, g.id]));
    const requests = seed.items.filter((i) => i.boardId === board.id && i.parentItemId === null);
    expect(requests.filter((i) => i.groupId === groupsByName.get("Incoming"))).toHaveLength(5);
    expect(requests.filter((i) => i.groupId === groupsByName.get("Allocated"))).toHaveLength(2);
    expect(requests.filter((i) => i.groupId === groupsByName.get("Closed"))).toHaveLength(1);
    for (const request of requests) {
      expect(seed.items.some((i) => i.parentItemId === request.id), `${request.name} has subitems`).toBe(true);
      expect(seed.activities.some((a) => a.itemId === request.id && a.eventType === "ITEM_CREATED")).toBe(true);
      const booked = seed.notifications.filter((n) => n.type === "TASK_BOOKED" && n.entityId === request.id);
      expect(new Set(booked.map((n) => n.userId))).toEqual(admins);
    }
    for (const request of requests.filter((i) => i.groupId === groupsByName.get("Allocated"))) {
      const link = seed.itemLinks.find((l) => l.itemAId === request.id || l.itemBId === request.id);
      expect(link, `${request.name} is linked`).toBeDefined();
      expect(seed.activities.filter((a) => a.eventType === "ITEM_LINKED" && (a.itemId === link!.itemAId || a.itemId === link!.itemBId))).toHaveLength(2);
    }
    expect(seed.notifications.some((n) => n.type === "TASK_BOOKED" && n.readAt === null)).toBe(true);
    expect(seed.notifications.some((n) => n.type === "TASK_BOOKED" && n.readAt !== null)).toBe(true);
  });

  it("gives the workspace a plausible booking key", () => {
    expect(seed.workspaces[0]!.bookingKey).toBe(SEED_BOOKING_KEY);
    expect(isPlausibleBookingKey(SEED_BOOKING_KEY)).toBe(true);
  });

  it("leaves Danh and the admin account with unread messages and a mix of read and unread notifications", () => {
    const toDanh = seed.directMessages.filter((m) => m.recipientId === SEED_USER_IDS.danh && m.readAt === null);
    expect(toDanh.length).toBeGreaterThanOrEqual(3);
    expect(seed.directMessages.filter((m) => m.recipientId === SEED_USER_IDS.admin && m.readAt === null).length).toBeGreaterThanOrEqual(1);
    expect(seed.directMessages.length).toBeGreaterThanOrEqual(25);
    const danh = seed.notifications.filter((n) => n.userId === SEED_USER_IDS.danh);
    expect(danh.some((n) => n.type === "BOARD_INVITE" && n.readAt === null)).toBe(true);
    expect(danh.some((n) => n.type === "MENTION" && n.readAt === null)).toBe(true);
    expect(danh.some((n) => n.readAt !== null)).toBe(true);
    expect(seed.notifications.some((n) => n.userId === SEED_USER_IDS.admin && n.type === "MENTION")).toBe(true);
    // Every mention notification has the comment behind it.
    for (const n of seed.notifications.filter((n) => n.type === "MENTION")) {
      expect(seed.comments.some((c) => c.itemId === n.entityId && c.mentionUserIds.includes(n.userId)), n.title).toBe(true);
    }
  });

  it("adds the two extra trackers with sensible frozen columns", () => {
    expect(seed.trackers.map((t) => t.name)).toEqual(["Domestic Campaigns Asset Tracker", "Vietnam Studio Production Log", "Open Day 2026 Run Sheet"]);
    const production = seed.trackers.find((t) => t.name === "Vietnam Studio Production Log")!;
    const sheets = seed.trackerSheets.filter((s) => s.trackerId === production.id);
    expect(sheets.map((s) => s.name)).toEqual(["September", "October"]);
    for (const sheet of sheets) {
      expect(sheet.frozenColumns).toBeGreaterThan(0);
      expect(sheet.frozenColumns).toBeLessThan(sheet.columns.length);
      expect(sheet.rows.filter((r) => r.kind === "data" && Object.keys(r.cells).length > 0).length).toBeGreaterThanOrEqual(9);
      expect(sheet.rows.some((r) => r.kind === "section")).toBe(true);
      const hours = sheet.columns.find((c) => c.name === "Hours")!;
      expect(hours).toMatchObject({ type: "number", numberFormat: "decimal", summary: "sum" });
    }
  });

  it("is deterministic for a given clock, and the extras stay in their own id namespaces", () => {
    const again = buildSeed(NOW);
    expect(again).toEqual(seed);
    const { base, extras } = buildSeedParts(NOW);
    const baseIds = new Set(Object.values(base).flatMap((rows) => (rows as Array<{ id: string }>).map((r) => r.id)));
    for (const rows of Object.values(extras)) {
      for (const row of rows as Array<{ id: string }>) {
        expect(baseIds.has(row.id), row.id).toBe(false);
        // "e…" is seed-extras.ts, "f…" the generated history in seed-history.ts.
        expect(row.id, row.id).toMatch(/^000000[ef]/);
      }
    }
  });
});
