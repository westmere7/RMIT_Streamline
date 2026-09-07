import { describe, expect, it } from "vitest";
import { buildSeedParts, SEED_BOARD_IDS, SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { emptyKnownIds, emptyShape, fanOutTaskBooked, planTopup, remapBoardLayouts, remapSystemEntities, renameTeamsInExtras, stableTopupId, TOPUP_TABLES, uniqueBoardSlugs } from "@/data/seed/seed-topup";

const NOW = new Date("2026-09-07T09:30:00.000Z");

/** What the database looks like after `db:seed` ran the base seed: every base row exists, nothing from the extras. */
function knownFromBase() {
  const { base } = buildSeedParts(NOW);
  const known = emptyKnownIds();
  known.profiles = new Set(base.users.map((u) => u.id));
  known.workspaces = new Set(base.workspaces.map((w) => w.id));
  known.teams = new Set(base.teams.map((t) => t.id));
  known.boards = new Set(base.boards.map((b) => b.id));
  known.board_groups = new Set(base.boardGroups.map((g) => g.id));
  known.board_columns = new Set(base.boardColumns.map((c) => c.id));
  known.items = new Set(base.items.map((i) => i.id));
  known.trackers = new Set(base.trackers.map((t) => t.id));
  return known;
}

describe("remapping the extras onto an existing Admin team and Task Allocation board", () => {
  const { extras } = buildSeedParts(NOW);
  const seedTeam = extras.teams.find((t) => t.system === "ADMIN")!;
  const seedBoard = extras.boards.find((b) => b.system === "TASK_ALLOCATION")!;
  const seedGroups = extras.boardGroups.filter((g) => g.boardId === seedBoard.id);
  const seedColumns = extras.boardColumns.filter((c) => c.boardId === seedBoard.id);

  it("leaves everything alone when the database has neither", () => {
    const { bundle, report } = remapSystemEntities(extras, { teamId: null, board: null });
    expect(report).toEqual({ teamRemapped: false, boardRemapped: false, groupFallbacks: [], droppedColumns: [], droppedValues: 0 });
    expect(bundle).toEqual(extras);
  });

  it("drops the seed's copies and points members, items, values, activities and notifications at the existing rows", () => {
    // The live board was renamed and its columns re-cased; one group and one column are missing.
    const existing = {
      teamId: "11111111-1111-4111-8111-111111111111",
      board: {
        id: "22222222-2222-4222-8222-222222222222",
        groups: [
          { id: "g-incoming", name: "INCOMING", position: 0 },
          { id: "g-closed", name: "closed ", position: 2 },
        ],
        columns: seedColumns.filter((c) => c.name !== "Reference").map((c, i) => ({ id: `c-${i}`, name: c.name.toUpperCase(), type: c.type })),
      },
    };
    const { bundle, report } = remapSystemEntities(extras, existing);
    expect(report.teamRemapped).toBe(true);
    expect(report.boardRemapped).toBe(true);
    expect(report.groupFallbacks).toEqual(["Allocated"]);
    expect(report.droppedColumns).toEqual(["Reference"]);
    expect(report.droppedValues).toBeGreaterThan(0);

    expect(bundle.teams.some((t) => t.id === seedTeam.id)).toBe(false);
    expect(bundle.boards.some((b) => b.id === seedBoard.id)).toBe(false);
    expect(bundle.boardGroups.some((g) => g.boardId === seedBoard.id)).toBe(false);
    expect(bundle.boardColumns.some((c) => c.boardId === seedBoard.id)).toBe(false);
    expect(bundle.teamMembers.filter((m) => m.teamId === existing.teamId)).toHaveLength(extras.teamMembers.filter((m) => m.teamId === seedTeam.id).length);
    expect(bundle.boardMembers.filter((m) => m.boardId === existing.board.id)).toHaveLength(extras.boardMembers.filter((m) => m.boardId === seedBoard.id).length);

    const moved = bundle.items.filter((i) => i.boardId === existing.board.id);
    expect(moved).toHaveLength(extras.items.filter((i) => i.boardId === seedBoard.id).length);
    const incoming = seedGroups.find((g) => g.name === "Incoming")!;
    const allocated = seedGroups.find((g) => g.name === "Allocated")!;
    const closed = seedGroups.find((g) => g.name === "Closed")!;
    const fromGroup = (groupId: string) => extras.items.filter((i) => i.boardId === seedBoard.id && i.groupId === groupId).map((i) => i.id);
    for (const id of fromGroup(incoming.id)) expect(moved.find((i) => i.id === id)!.groupId).toBe("g-incoming");
    for (const id of fromGroup(closed.id)) expect(moved.find((i) => i.id === id)!.groupId).toBe("g-closed");
    // No "Allocated" group any more: those requests land in the first group.
    for (const id of fromGroup(allocated.id)) expect(moved.find((i) => i.id === id)!.groupId).toBe("g-incoming");

    const movedIds = new Set(moved.map((i) => i.id));
    const existingColumnIds = new Set(existing.board.columns.map((c) => c.id));
    for (const v of bundle.itemColumnValues.filter((v) => movedIds.has(v.itemId))) expect(existingColumnIds.has(v.columnId), v.columnId).toBe(true);
    const reference = seedColumns.find((c) => c.name === "Reference")!;
    expect(bundle.itemColumnValues.some((v) => v.columnId === reference.id)).toBe(false);
    // Values on other boards are untouched.
    expect(bundle.itemColumnValues.filter((v) => !movedIds.has(v.itemId))).toEqual(extras.itemColumnValues.filter((v) => !movedIds.has(v.itemId)));

    expect(bundle.activities.some((a) => a.boardId === seedBoard.id)).toBe(false);
    expect(bundle.activities.filter((a) => a.boardId === existing.board.id)).toHaveLength(extras.activities.filter((a) => a.boardId === seedBoard.id).length);
    expect(bundle.notifications.some((n) => n.boardId === seedBoard.id)).toBe(false);
    expect(bundle.notifications.filter((n) => n.boardId === existing.board.id)).toHaveLength(extras.notifications.filter((n) => n.boardId === seedBoard.id).length);
    // Links still join the same items, which now live on the existing board.
    expect(bundle.itemLinks).toEqual(extras.itemLinks);
  });

  it("gives a board a free slug when its slug is already taken in the workspace", () => {
    const { bundle } = remapSystemEntities(extras, { teamId: null, board: null });
    const renamed = uniqueBoardSlugs(bundle, ["task-allocation", "task-allocation-2"]);
    expect(renamed.boards.find((b) => b.system === "TASK_ALLOCATION")!.slug).toBe("task-allocation-3");
    expect(uniqueBoardSlugs(bundle, ["something-else"]).boards).toEqual(bundle.boards);
  });
});

describe("TASK_BOOKED notifications follow the database's admins", () => {
  const { extras } = buildSeedParts(NOW);
  const bookings = new Set(extras.notifications.filter((n) => n.type === "TASK_BOOKED").map((n) => n.entityId));

  it("keeps the seed's rows for seed admins, invents stable ones for others, and drops former admins", () => {
    const stranger = "99999999-9999-4999-8999-999999999999";
    const admins = [SEED_USER_IDS.danh, stranger];
    const result = fanOutTaskBooked(extras.notifications, admins);
    const booked = result.filter((n) => n.type === "TASK_BOOKED");
    expect(booked).toHaveLength(bookings.size * admins.length);
    for (const n of booked.filter((n) => n.userId === SEED_USER_IDS.danh)) expect(extras.notifications.some((o) => o.id === n.id)).toBe(true);
    for (const n of booked.filter((n) => n.userId === stranger)) {
      expect(n.id).toBe(stableTopupId("task-booked", n.entityId, stranger));
      expect(n.readAt).toBeNull();
    }
    expect(booked.some((n) => n.userId === SEED_USER_IDS.emily)).toBe(false);
    // Nothing else moves.
    expect(result.filter((n) => n.type !== "TASK_BOOKED")).toEqual(extras.notifications.filter((n) => n.type !== "TASK_BOOKED"));
    // Same inputs, same ids: a second run inserts nothing.
    expect(fanOutTaskBooked(extras.notifications, admins).map((n) => n.id)).toEqual(result.map((n) => n.id));
  });

  it("makes well-formed, distinct stable ids", () => {
    const a = stableTopupId("task-booked", "x", "y");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(stableTopupId("task-booked", "x", "z"));
    expect(a).toBe(stableTopupId("task-booked", "x", "y"));
  });
});

describe("planning the top-up against what the database holds", () => {
  const { extras } = buildSeedParts(NOW);

  it("accepts the whole extras bundle on top of a plain base seed", () => {
    const { bundle, reports } = planTopup(extras, knownFromBase());
    for (const report of reports) {
      expect(report.skippedExisting, report.table).toBe(0);
      expect(report.skippedMissingParent, report.table).toBe(0);
    }
    expect(bundle.items).toHaveLength(extras.items.length);
    expect(bundle.itemColumnValues).toHaveLength(extras.itemColumnValues.length);
    expect(bundle.directMessages).toHaveLength(extras.directMessages.length);
    // Subitems come after their parents so the insert order is valid.
    const seen = new Set<string>();
    for (const item of bundle.items) {
      if (item.parentItemId) expect(seen.has(item.parentItemId), item.name).toBe(true);
      seen.add(item.id);
    }
  });

  it("skips rows that are already there and everything that hangs off a missing parent", () => {
    const known = knownFromBase();
    // Second run: everything from the first is present.
    for (const table of TOPUP_TABLES) {
      const rows = (bundle(table) as Array<{ id: string }>).map((r) => r.id);
      known[table] = new Set(rows);
    }
    const again = planTopup(extras, known);
    for (const report of again.reports) {
      expect(report.planned, report.table).toBe(0);
      expect(report.skippedExisting, report.table).toBe((bundle(report.table) as unknown[]).length);
    }

    // A board someone deleted by hand: its items, values, comments and activities are left out, the rest goes in.
    const partial = knownFromBase();
    partial.boards.delete(SEED_BOARD_IDS.requests);
    for (const g of extras.items.filter((i) => i.boardId === SEED_BOARD_IDS.requests)) partial.items.delete(g.id);
    const { bundle: kept, reports } = planTopup(extras, partial);
    const onRequests = extras.items.filter((i) => i.boardId === SEED_BOARD_IDS.requests);
    expect(onRequests.length).toBeGreaterThan(0);
    expect(kept.items.some((i) => i.boardId === SEED_BOARD_IDS.requests)).toBe(false);
    expect(reports.find((r) => r.table === "items")!.skippedMissingParent).toBe(onRequests.length);
    const lostIds = new Set(onRequests.map((i) => i.id));
    expect(kept.itemColumnValues.some((v) => lostIds.has(v.itemId))).toBe(false);
    expect(kept.comments.some((c) => lostIds.has(c.itemId))).toBe(false);
    expect(kept.activities.some((a) => a.itemId && lostIds.has(a.itemId))).toBe(false);
    // The link to the mirror on Creative Requests cannot be made either.
    expect(kept.itemLinks.some((l) => lostIds.has(l.itemAId) || lostIds.has(l.itemBId))).toBe(false);
    expect(kept.itemLinks.length).toBe(extras.itemLinks.length - 1);
    // Unrelated tables are complete.
    expect(kept.directMessages).toHaveLength(extras.directMessages.length);
    expect(kept.trackers).toHaveLength(extras.trackers.length);

    // A seed profile that was removed: nothing of theirs goes in.
    const noEmily = knownFromBase();
    noEmily.profiles.delete(SEED_USER_IDS.emily);
    const withoutEmily = planTopup(extras, noEmily).bundle;
    expect(withoutEmily.directMessages.some((m) => m.senderId === SEED_USER_IDS.emily || m.recipientId === SEED_USER_IDS.emily)).toBe(false);
    expect(withoutEmily.notifications.some((n) => n.userId === SEED_USER_IDS.emily)).toBe(false);
    expect(withoutEmily.teamMembers.some((m) => m.userId === SEED_USER_IDS.emily)).toBe(false);

    function bundle(table: (typeof TOPUP_TABLES)[number]) {
      const key = {
        teams: "teams",
        team_members: "teamMembers",
        boards: "boards",
        board_members: "boardMembers",
        board_groups: "boardGroups",
        board_columns: "boardColumns",
        items: "items",
        item_column_values: "itemColumnValues",
        item_links: "itemLinks",
        trackers: "trackers",
        tracker_sheets: "trackerSheets",
        comments: "comments",
        activities: "activities",
        notifications: "notifications",
        direct_messages: "directMessages",
      } as const;
      return extras[key[table]];
    }
  });

  it("lets a freshly inserted Admin team carry its board, groups, columns and items in one run", () => {
    const { bundle } = planTopup(extras, knownFromBase());
    const team = bundle.teams.find((t) => t.system === "ADMIN")!;
    const board = bundle.boards.find((b) => b.system === "TASK_ALLOCATION")!;
    expect(board.teamId).toBe(team.id);
    expect(board.workspaceId).toBe(SEED_WORKSPACE_ID);
    expect(bundle.boardGroups.filter((g) => g.boardId === board.id)).toHaveLength(3);
    expect(bundle.items.filter((i) => i.boardId === board.id && i.parentItemId === null)).toHaveLength(8);
    expect(bundle.trackers.map((t) => t.teamId)).toEqual([SEED_TEAM_IDS.vietnam, SEED_TEAM_IDS.events]);
  });
});

describe("translating the extras onto base boards whose group and column ids differ", () => {
  const { base, extras } = buildSeedParts(NOW);
  const social = SEED_BOARD_IDS.social;
  const seedGroups = base.boardGroups.filter((g) => g.boardId === social);
  const seedColumns = base.boardColumns.filter((c) => c.boardId === social);
  const status = seedColumns.find((c) => c.type === "STATUS")!;

  it("matches groups and columns by name on their own board and drops what has no namesake", () => {
    // The live board has the same names under other ids, a renamed "Design" group and no Status column.
    const live = new Map([
      [
        social,
        {
          groups: seedGroups.map((g) => ({ id: `live-${g.id}`, name: g.name === "Design" ? "Artwork" : g.name.toUpperCase(), position: g.position })),
          columns: seedColumns.filter((c) => c.id !== status.id).map((c) => ({ id: `live-${c.id}`, name: c.name, type: c.type })),
        },
      ],
    ]);
    const { bundle, reports } = remapBoardLayouts(extras, { groups: base.boardGroups, columns: base.boardColumns }, live);
    const socialItems = bundle.items.filter((i) => i.boardId === social);
    expect(socialItems.length).toBeGreaterThan(0);
    expect(socialItems.every((i) => i.groupId.startsWith("live-"))).toBe(true);
    const designId = seedGroups.find((g) => g.name === "Design")!.id;
    const firstGroup = seedGroups.slice().sort((a, b) => a.position - b.position)[0]!;
    for (const item of extras.items.filter((i) => i.boardId === social && i.groupId === designId)) {
      expect(bundle.items.find((i) => i.id === item.id)?.groupId).toBe(`live-${firstGroup.id}`);
    }
    const socialItemIds = new Set(socialItems.map((i) => i.id));
    const socialValues = bundle.itemColumnValues.filter((v) => socialItemIds.has(v.itemId));
    expect(socialValues.some((v) => v.columnId === status.id || v.columnId === `live-${status.id}`)).toBe(false);
    expect(socialValues.every((v) => v.columnId.startsWith("live-"))).toBe(true);
    const report = reports.find((r) => r.boardId === social)!;
    expect(report.groupFallbacks).toEqual(["Design"]);
    expect(report.droppedColumns).toEqual([status.name]);
    expect(report.droppedValues).toBe(extras.itemColumnValues.filter((v) => v.columnId === status.id).length);
    // Other boards are untouched.
    const other = extras.items.find((i) => i.boardId === SEED_BOARD_IDS.rmitinerary)!;
    expect(bundle.items.find((i) => i.id === other.id)).toEqual(other);
  });

  it("changes nothing when the live layout carries the seed's own ids", () => {
    const live = new Map([[social, { groups: seedGroups, columns: seedColumns }]]);
    const { bundle, reports } = remapBoardLayouts(extras, { groups: base.boardGroups, columns: base.boardColumns }, live);
    expect(bundle.items).toEqual(extras.items);
    expect(bundle.itemColumnValues).toEqual(extras.itemColumnValues);
    expect(reports[0]).toEqual({ boardId: social, groupFallbacks: [], droppedColumns: [], droppedValues: 0 });
  });

  it("refuses an item whose group, or a value whose column, sits on another board", () => {
    const known = knownFromBase();
    const shape = emptyShape();
    for (const g of base.boardGroups) shape.boardOfGroup.set(g.id, g.boardId);
    for (const c of base.boardColumns) shape.boardOfColumn.set(c.id, c.boardId);
    for (const i of base.items) shape.boardOfItem.set(i.id, i.boardId);
    // Pretend the database gave the RMITinerary "Design" group's id to a Website Redesign group,
    // and the Social board's Status column id to a Website Redesign column.
    const design = base.boardGroups.find((g) => g.boardId === SEED_BOARD_IDS.rmitinerary && g.name === "Design")!;
    shape.boardOfGroup.set(design.id, SEED_BOARD_IDS.website);
    shape.boardOfColumn.set(status.id, SEED_BOARD_IDS.website);
    const plan = planTopup(extras, known, shape);
    const strandedItems = extras.items.filter((i) => i.groupId === design.id);
    expect(strandedItems.length).toBeGreaterThan(0);
    expect(plan.bundle.items.some((i) => i.groupId === design.id)).toBe(false);
    expect(plan.bundle.itemColumnValues.some((v) => v.columnId === status.id)).toBe(false);
    expect(plan.reports.find((r) => r.table === "items")!.skippedMissingParent).toBeGreaterThanOrEqual(strandedItems.length);
  });
});

describe("teams renamed since the seed", () => {
  const { extras } = buildSeedParts(NOW);

  it("swaps the seed's team names for the current ones in tags, texts, notifications and descriptions", () => {
    const renames = new Map([["Melbourne Creative", "Melbourne"], ["Video & Motion", "Production"]]);
    const bundle = renameTeamsInExtras(extras, renames);
    const mentions = (text: string) => /Melbourne Creative|Video & Motion/.test(text);
    expect(bundle.itemColumnValues.some((v) => v.value.type === "TAGS" && v.value.tags.some(mentions))).toBe(false);
    expect(bundle.itemColumnValues.some((v) => (v.value.type === "TEXT" || v.value.type === "LONG_TEXT") && mentions(v.value.text))).toBe(false);
    expect(bundle.notifications.some((n) => mentions(n.title) || mentions(n.body ?? ""))).toBe(false);
    expect(bundle.items.some((i) => mentions(i.description ?? ""))).toBe(false);
    // The tag the request carried is now the current name, and nothing else moved.
    const before = extras.itemColumnValues.filter((v) => v.value.type === "TAGS" && v.value.tags.includes("Melbourne Creative"));
    expect(before.length).toBeGreaterThan(0);
    for (const v of before) {
      const after = bundle.itemColumnValues.find((x) => x.id === v.id)!;
      expect(after.value.type === "TAGS" && after.value.tags).toContain("Melbourne");
    }
    expect(bundle.items.length).toBe(extras.items.length);
    expect(renameTeamsInExtras(extras, new Map())).toBe(extras);
  });
});
