import { describe, expect, it } from "vitest";
import { buildSeed, buildSeedParts, SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { BOOKING_ASSET_TYPES } from "@/domain";
import { toISODate } from "@/lib/dates/dates";

const NOW = new Date("2026-09-07T09:30:00.000Z");
const TODAY = toISODate(NOW);

/**
 * The generated history is the part of the extras in the f1–f6 id namespaces
 * (seed-data.ts). The closed year (seed-archive.ts) sits in fa–fd and is covered
 * by its own suite, so it must not be counted in any figure here.
 */
const isHistory = (id: string) => /^000000f[1-6]-/.test(id);

describe("the generated seed history", () => {
  const { base, extras } = buildSeedParts(NOW);
  const seed = buildSeed(NOW);
  const items = extras.items.filter((i) => isHistory(i.id));
  const topLevel = items.filter((i) => i.parentItemId === null);
  const values = extras.itemColumnValues.filter((v) => isHistory(v.id));
  const valuesByItem = new Map<string, typeof values>();
  for (const v of values) valuesByItem.set(v.itemId, [...(valuesByItem.get(v.itemId) ?? []), v]);
  const valueOf = <T extends string>(itemId: string, type: T) => valuesByItem.get(itemId)?.find((v) => v.value.type === type)?.value as Extract<(typeof values)[number]["value"], { type: T }> | undefined;
  const boardOf = new Map(seed.items.map((i) => [i.id, i.boardId]));

  it("adds several hundred items across every active board, all from the history namespaces", () => {
    expect(topLevel.length).toBeGreaterThanOrEqual(300);
    const activeBoards = base.boards.filter((b) => !b.archivedAt);
    for (const board of activeBoards) {
      expect(topLevel.filter((i) => i.boardId === board.id).length, board.name).toBeGreaterThanOrEqual(25);
    }
    for (const row of [...items, ...values, ...extras.itemAssets.filter((a) => isHistory(a.id))]) expect(row.id).toMatch(/^000000f[1-6]-/);
    // Nothing in the history is nameless boilerplate.
    for (const item of items) expect(item.name).not.toMatch(/^Item \d+$/);
  });

  it("keeps every reference inside the bundle and off the wrong board", () => {
    const users = new Set(seed.users.map((u) => u.id));
    const columns = new Map(seed.boardColumns.map((c) => [c.id, c.boardId]));
    const groups = new Map(seed.boardGroups.map((g) => [g.id, g.boardId]));
    const historyIds = new Set(items.map((i) => i.id));
    for (const item of items) {
      expect(groups.get(item.groupId), item.name).toBe(item.boardId);
      expect(users.has(item.createdBy), item.name).toBe(true);
      if (item.parentItemId) {
        expect(historyIds.has(item.parentItemId), `subitem ${item.name}`).toBe(true);
        expect(boardOf.get(item.parentItemId)).toBe(item.boardId);
      }
      // Appended after the base and extras rows in the group, so nothing already there moves.
      if (item.parentItemId === null) expect(item.position).toBeGreaterThanOrEqual(100);
    }
    for (const v of values) {
      expect(historyIds.has(v.itemId), v.id).toBe(true);
      expect(columns.get(v.columnId), v.id).toBe(boardOf.get(v.itemId));
      if (v.value.type === "PERSON") for (const u of v.value.userIds) expect(users.has(u)).toBe(true);
      if (v.value.type === "DEPENDENCY") {
        expect(v.value.itemIds.length).toBeGreaterThan(0);
        for (const d of v.value.itemIds) expect(boardOf.get(d), `dependency of ${v.itemId}`).toBe(boardOf.get(v.itemId));
      }
      if (v.value.type === "TIMELINE") expect(v.value.start! <= v.value.end!, v.id).toBe(true);
      if (v.value.type === "STATUS") expect(["not_started", "working", "waiting", "stuck", "done"]).toContain(v.value.labelId);
      if (v.value.type === "PRIORITY") expect(["critical", "high", "medium", "low"]).toContain(v.value.labelId);
    }
    for (const a of extras.itemAssets.filter((a) => isHistory(a.id))) {
      expect(historyIds.has(a.itemId)).toBe(true);
      expect(a.boardId).toBe(boardOf.get(a.itemId));
      for (const id of a.assigneeIds) expect(users.has(id)).toBe(true);
    }
    for (const c of extras.comments.filter((c) => isHistory(c.id))) {
      expect(historyIds.has(c.itemId)).toBe(true);
      for (const u of c.mentionUserIds) expect(users.has(u)).toBe(true);
      if (c.body.includes("@")) expect(c.mentionUserIds.length).toBeGreaterThan(0);
    }
    for (const a of extras.activities.filter((a) => isHistory(a.id))) {
      expect(a.itemId && historyIds.has(a.itemId), a.id).toBe(true);
      expect(a.boardId).toBe(boardOf.get(a.itemId!));
      expect(a.createdAt <= NOW.toISOString(), a.id).toBe(true);
    }
    for (const n of extras.notifications.filter((n) => isHistory(n.id))) {
      expect(historyIds.has(n.entityId)).toBe(true);
      expect([SEED_USER_IDS.danh, SEED_USER_IDS.admin]).toContain(n.userId);
    }
    // No duplicate ids across the whole seed, and no item name twice on one board.
    const all = Object.entries(seed).flatMap(([key, rows]) => (key === "boardVisits" ? [] : (rows as Array<{ id: string }>).map((r) => r.id)));
    expect(new Set(all).size).toBe(all.length);
    const names = new Set<string>();
    for (const item of seed.items.filter((i) => i.parentItemId === null)) {
      const key = `${item.boardId}:${item.name}`;
      expect(names.has(key), item.name).toBe(false);
      names.add(key);
    }
  });

  it("dates most items and reads as a schedule: timelines of working days, due at or after the end", () => {
    let dated = 0;
    for (const item of topLevel) {
      const timeline = valueOf(item.id, "TIMELINE");
      const due = valueOf(item.id, "DATE");
      if (timeline || due) dated += 1;
      if (timeline && due) expect(due.date! >= timeline.end!, item.name).toBe(true);
      if (timeline) {
        const days = (new Date(timeline.end!).getTime() - new Date(timeline.start!).getTime()) / 86_400_000 + 1;
        expect(days).toBeGreaterThanOrEqual(1);
        expect(days).toBeLessThanOrEqual(30);
        expect(new Date(timeline.start!).getDay(), `${item.name} starts on a weekday`).not.toBe(0);
        expect(new Date(timeline.start!).getDay()).not.toBe(6);
      }
      expect(item.createdAt <= NOW.toISOString(), item.name).toBe(true);
    }
    expect(dated / topLevel.length).toBeGreaterThanOrEqual(0.6);
    // The boards with a Timeline column have one on most of their items.
    const withTimelineColumn = new Set(base.boardColumns.filter((c) => c.type === "TIMELINE").map((c) => c.boardId));
    const onTimelineBoards = topLevel.filter((i) => withTimelineColumn.has(i.boardId));
    expect(onTimelineBoards.filter((i) => valueOf(i.id, "TIMELINE")).length / onTimelineBoards.length).toBeGreaterThanOrEqual(0.75);
    // Roughly five months back to three months ahead.
    const starts = values.filter((v) => v.value.type === "TIMELINE").map((v) => (v.value as { start: string }).start).sort();
    expect(starts[0]! < toISODate(new Date(NOW.getTime() - 120 * 86_400_000))).toBe(true);
    expect(starts[starts.length - 1]! > toISODate(new Date(NOW.getTime() + 45 * 86_400_000))).toBe(true);
  });

  it("lets status follow time: the past is mostly done, the future mostly not started", () => {
    const past = topLevel.filter((i) => (valueOf(i.id, "TIMELINE")?.end ?? valueOf(i.id, "DATE")?.date ?? TODAY) < TODAY);
    const future = topLevel.filter((i) => (valueOf(i.id, "TIMELINE")?.start ?? valueOf(i.id, "DATE")?.date ?? TODAY) > TODAY);
    expect(past.length).toBeGreaterThan(80);
    expect(future.length).toBeGreaterThan(80);
    const share = (rows: typeof topLevel, status: string) => rows.filter((i) => valueOf(i.id, "STATUS")?.labelId === status).length / rows.length;
    expect(share(past, "done")).toBeGreaterThanOrEqual(0.6);
    expect(share(future, "not_started")).toBeGreaterThanOrEqual(0.6);
    expect(share(future, "done")).toBeLessThan(0.1);
    // Some past work is still stuck or waiting — an overdue queue, not a tidy one.
    expect(past.some((i) => valueOf(i.id, "STATUS")?.labelId === "stuck")).toBe(true);
    // Every item has a status, a priority and an owner.
    for (const item of topLevel) {
      expect(valueOf(item.id, "STATUS"), item.name).toBeDefined();
      expect(valueOf(item.id, "PRIORITY"), item.name).toBeDefined();
      expect(valueOf(item.id, "PERSON")?.userIds.length, item.name).toBeGreaterThan(0);
    }
  });

  it("chains dependencies inside a group with sequential timelines, and shows blocked work", () => {
    const dependencies = values.filter((v) => v.value.type === "DEPENDENCY");
    expect(dependencies.length).toBeGreaterThanOrEqual(10);
    const itemById = new Map(items.map((i) => [i.id, i]));
    let blocked = 0;
    for (const v of dependencies) {
      if (v.value.type !== "DEPENDENCY") continue;
      const successor = itemById.get(v.itemId)!;
      for (const predecessorId of v.value.itemIds) {
        const predecessor = itemById.get(predecessorId)!;
        expect(predecessor.groupId, successor.name).toBe(successor.groupId);
        const before = valueOf(predecessorId, "TIMELINE") ?? valueOf(predecessorId, "DATE");
        const after = valueOf(v.itemId, "TIMELINE") ?? valueOf(v.itemId, "DATE");
        const beforeEnd = before?.type === "TIMELINE" ? before.end! : before?.date;
        const afterStart = after?.type === "TIMELINE" ? after.start! : after?.date;
        expect(beforeEnd && afterStart && beforeEnd < afterStart, `${predecessor.name} → ${successor.name}`).toBe(true);
        const predecessorStatus = valueOf(predecessorId, "STATUS")?.labelId;
        const successorStatus = valueOf(v.itemId, "STATUS")?.labelId;
        if (predecessorStatus !== "done" && successorStatus === "working") blocked += 1;
      }
    }
    expect(blocked).toBeGreaterThan(0);
    // Only the boards with a Dependency column carry any.
    for (const v of dependencies) expect([SEED_BOARD_IDS.rmitinerary, SEED_BOARD_IDS.brand]).toContain(boardOf.get(v.itemId));
  });

  it("gives items subitems, asset lines, status history, updates and a few notifications", () => {
    const subitems = items.filter((i) => i.parentItemId !== null);
    expect(subitems.length).toBeGreaterThan(200);
    const parents = new Set(subitems.map((i) => i.parentItemId));
    expect(parents.size / topLevel.length).toBeGreaterThanOrEqual(0.25);
    for (const sub of subitems) {
      expect(valueOf(sub.id, "STATUS"), sub.name).toBeDefined();
      const parentStatus = valueOf(sub.parentItemId!, "STATUS")?.labelId;
      if (parentStatus === "done") expect(valueOf(sub.id, "STATUS")?.labelId, `${sub.name} under a done parent`).toBe("done");
    }

    const assets = extras.itemAssets.filter((a) => isHistory(a.id));
    expect(assets.length).toBeGreaterThan(150);
    const withAssets = new Set(assets.map((a) => a.itemId));
    expect(withAssets.size / topLevel.length).toBeGreaterThanOrEqual(0.2);
    for (const a of assets) {
      expect(BOOKING_ASSET_TYPES.map((t) => t.name)).toContain(a.assetType);
      if (a.quantity !== null) expect(a.quantity).toBeGreaterThan(0);
    }

    const activities = extras.activities.filter((a) => isHistory(a.id));
    expect(activities.length).toBeLessThan(1200);
    const created = activities.filter((a) => a.eventType === "ITEM_CREATED");
    expect(created.length).toBe(topLevel.length);
    const done = topLevel.filter((i) => valueOf(i.id, "STATUS")?.labelId === "done");
    const statusChanges = activities.filter((a) => a.eventType === "ITEM_COLUMN_VALUE_UPDATED" && a.metadata.columnType === "STATUS");
    expect(statusChanges.length).toBeGreaterThan(done.length);
    for (const item of done) {
      const own = statusChanges.filter((a) => a.itemId === item.id);
      expect(own.length, item.name).toBeGreaterThanOrEqual(1);
      expect(own.length).toBeLessThanOrEqual(4);
      expect(own[own.length - 1]!.metadata.to).toBe("Done");
      for (const a of own) expect(a.createdAt >= item.createdAt).toBe(true);
    }

    const comments = extras.comments.filter((c) => isHistory(c.id));
    expect(comments.length).toBeGreaterThanOrEqual(30);
    expect(comments.length).toBeLessThanOrEqual(120);
    for (const c of comments) expect(activities.some((a) => a.eventType === "COMMENT_ADDED" && a.itemId === c.itemId && a.createdAt === c.createdAt), c.body).toBe(true);
    expect(comments.some((c) => c.mentionUserIds.length > 0)).toBe(true);

    const notifications = extras.notifications.filter((n) => isHistory(n.id));
    expect(notifications.length).toBeGreaterThanOrEqual(12);
    expect(notifications.length).toBeLessThanOrEqual(25);
    expect(notifications.some((n) => n.readAt === null)).toBe(true);
    expect(notifications.some((n) => n.readAt !== null)).toBe(true);
    expect(notifications.some((n) => n.userId === SEED_USER_IDS.admin)).toBe(true);
    expect(new Set(notifications.map((n) => n.type)).size).toBeGreaterThanOrEqual(3);
    for (const n of notifications) {
      if (n.type === "MENTION") expect(comments.some((c) => c.itemId === n.entityId && c.mentionUserIds.includes(n.userId)), n.title).toBe(true);
      expect(n.delivery).toBe(n.type === "STATUS_CHANGED" ? "UPDATE" : "NOTIFICATION");
    }
  });

  it("keeps the whole bundle a reasonable size for the browser database", () => {
    // The whole seed: base, extras, the generated history and the closed year
    // (seed-archive.ts), which is the larger half of these rows.
    expect(seed.itemColumnValues.length).toBeLessThan(9000);
    expect(seed.activities.length).toBeLessThan(3000);
    expect(seed.items.length).toBeLessThan(1600);
  });

  it("is deterministic for a given clock", () => {
    const again = buildSeedParts(NOW);
    expect(again.extras).toEqual(extras);
    expect(buildSeed(NOW)).toEqual(seed);
    // Another clock moves the dates (and with them what is done and what is not) but keeps the same work on every board.
    const later = buildSeedParts(new Date("2026-11-20T02:00:00.000Z"));
    const names = (rows: typeof items) => rows.filter((i) => i.parentItemId === null).map((i) => `${i.boardId}:${i.name}`).sort();
    expect(names(later.extras.items.filter((i) => isHistory(i.id)))).toEqual(names(items));
  });
});
