import { describe, expect, it } from "vitest";
import { ARCHIVE_YEAR } from "@/data/seed/seed-archive";
import { buildSeed, buildSeedParts, SEED_BOARD_IDS } from "@/data/seed/seed-data";

const NOW = new Date("2026-09-07T09:30:00.000Z");

/** The closed year is the part of the extras in the fa–fd id namespaces (seed-data.ts). */
const isArchive = (id: string) => /^000000f[a-d]-/.test(id);

describe("the closed year of delivered work", () => {
  const { base, extras } = buildSeedParts(NOW);
  const seed = buildSeed(NOW);
  const items = extras.items.filter((i) => isArchive(i.id));
  const values = extras.itemColumnValues.filter((v) => isArchive(v.id));
  const assets = extras.itemAssets.filter((a) => isArchive(a.id));
  const activities = extras.activities.filter((a) => isArchive(a.id));
  const byItem = new Map<string, typeof values>();
  for (const v of values) byItem.set(v.itemId, [...(byItem.get(v.itemId) ?? []), v]);
  const valueOf = <T extends string>(itemId: string, type: T) =>
    byItem.get(itemId)?.find((v) => v.value.type === type)?.value as Extract<(typeof values)[number]["value"], { type: T }> | undefined;
  const statusOf = (itemId: string) => valueOf(itemId, "STATUS")?.labelId ?? null;

  it("fills the year before last across every open board", () => {
    expect(items.length).toBeGreaterThanOrEqual(300);
    const open = base.boards.filter((b) => !b.archivedAt && !b.system);
    for (const board of open) {
      expect(items.filter((i) => i.boardId === board.id).length, board.name).toBeGreaterThanOrEqual(20);
    }
    // The 2025 campaign board is archived, and archived boards are out of the reports' scope.
    expect(items.filter((i) => i.boardId === SEED_BOARD_IDS.sem2archive)).toHaveLength(0);
    // Every month of the year has work, with the quiet months quieter than the peaks.
    const perMonth = Array.from({ length: 12 }, (_, month) => items.filter((i) => i.createdAt.slice(0, 7) === `${ARCHIVE_YEAR}-${String(month + 1).padStart(2, "0")}`).length);
    for (const [month, count] of perMonth.entries()) expect(count, `month ${month + 1}`).toBeGreaterThan(0);
    expect(Math.max(...perMonth)).toBeGreaterThan(Math.min(...perMonth) * 2);
  });

  it("is all top-level work, named for the period it ran in, and never boilerplate", () => {
    for (const item of items) {
      expect(item.parentItemId, item.name).toBeNull();
      expect(item.archivedAt).toBeNull();
      expect(item.name).toMatch(new RegExp(` · Sem [12] ${ARCHIVE_YEAR}$`));
    }
    // Names are unique per board, so a period never repeats the same piece of work.
    for (const board of new Set(items.map((i) => i.boardId))) {
      const names = items.filter((i) => i.boardId === board).map((i) => i.name);
      expect(new Set(names).size, board).toBe(names.length);
    }
  });

  it("keeps every reference inside the bundle and on the right board", () => {
    const users = new Set(seed.users.map((u) => u.id));
    const columns = new Map(seed.boardColumns.map((c) => [c.id, c.boardId]));
    const groups = new Map(seed.boardGroups.map((g) => [g.id, g.boardId]));
    const itemBoard = new Map(items.map((i) => [i.id, i.boardId]));
    for (const item of items) {
      expect(groups.get(item.groupId), item.name).toBe(item.boardId);
      expect(users.has(item.createdBy), item.name).toBe(true);
      // Appended well past the rest, so nothing already in the group moves.
      expect(item.position).toBeGreaterThanOrEqual(5000);
    }
    for (const v of values) expect(columns.get(v.columnId), v.id).toBe(itemBoard.get(v.itemId));
    for (const a of assets) expect(a.boardId).toBe(itemBoard.get(a.itemId));
    for (const a of activities) expect(a.itemId === null || itemBoard.has(a.itemId)).toBe(true);
    // Ids are unique, and none of them collides with the rest of the seed.
    const all = seed.items.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("reads as a finished year: nearly everything delivered, dated inside it", () => {
    const done = items.filter((i) => statusOf(i.id) === "done");
    expect(done.length / items.length).toBeGreaterThan(0.85);
    expect(done.length).toBeLessThan(items.length); // some work stalled and was never picked up
    for (const item of items) {
      expect(statusOf(item.id), item.name).toBeTruthy();
      expect(item.createdAt < item.updatedAt, item.name).toBe(true);
      // Work is dated in the archive year; a December job may be signed off in January.
      expect(item.updatedAt.slice(0, 4) >= String(ARCHIVE_YEAR), item.name).toBe(true);
      expect(item.updatedAt.slice(0, 4) <= String(ARCHIVE_YEAR + 1), item.name).toBe(true);
    }
    const dated = items.filter((i) => valueOf(i.id, "DATE") || valueOf(i.id, "TIMELINE"));
    expect(dated.length / items.length).toBeGreaterThan(0.85);
    for (const item of items) {
      const timeline = valueOf(item.id, "TIMELINE");
      if (timeline?.start && timeline.end) expect(timeline.start <= timeline.end, item.name).toBe(true);
    }
  });

  it("carries deliverables that were ticked off, so completion can be counted by date", () => {
    expect(assets.length).toBeGreaterThan(400);
    const withAssets = new Set(assets.map((a) => a.itemId));
    expect(withAssets.size / items.length).toBeGreaterThan(0.6);
    const completed = assets.filter((a) => a.completedAt);
    expect(completed.length / assets.length).toBeGreaterThan(0.8);
    for (const a of assets) {
      expect(["Print", "Digital", "Social", "Video", "Motion", "Web", "Brand", "Event", "Copy", "Photography"]).toContain(a.assetType);
      if (a.quantity !== null) expect(a.quantity).toBeGreaterThan(0);
      if (a.completedAt) expect(a.completedAt.slice(0, 4) >= String(ARCHIVE_YEAR)).toBe(true);
    }
    // A line of a delivered task is ticked off; a line of one that stalled may not be.
    for (const a of assets) {
      if (statusOf(a.itemId) === "done") expect(a.completedAt, a.name).not.toBeNull();
    }
    // Several asset types are represented, so the mix has something to show.
    expect(new Set(assets.map((a) => a.assetType)).size).toBeGreaterThanOrEqual(6);
  });

  it("records how each piece of work arrived and, when delivered, that it was signed off", () => {
    const created = activities.filter((a) => a.eventType === "ITEM_CREATED");
    expect(created.length).toBe(items.length);
    const done = items.filter((i) => statusOf(i.id) === "done");
    const signOffs = activities.filter((a) => a.eventType === "ITEM_COLUMN_VALUE_UPDATED");
    expect(signOffs.length).toBe(done.length);
    for (const a of signOffs) expect(a.metadata.to).toBe("Done");
    for (const a of activities) {
      const item = items.find((i) => i.id === a.itemId)!;
      expect(a.createdAt >= item.createdAt, a.id).toBe(true);
    }
  });

  it("is deterministic for a given clock", () => {
    const again = buildSeedParts(NOW);
    expect(again.extras.items.filter((i) => isArchive(i.id))).toEqual(items);
    expect(again.extras.itemAssets.filter((a) => isArchive(a.id))).toEqual(assets);
  });

  it("leaves the ids of everything seeded before it untouched", () => {
    // The archive is merged last and draws from its own namespaces, so the
    // additive Supabase top-up still recognises every row it wrote before.
    const history = extras.items.filter((i) => /^000000f[1-6]-/.test(i.id));
    expect(history.length).toBeGreaterThan(300);
    const expected = buildSeedParts(NOW).extras.items.filter((i) => /^000000f[1-6]-/.test(i.id));
    expect(history.map((i) => i.id)).toEqual(expected.map((i) => i.id));
  });
});
