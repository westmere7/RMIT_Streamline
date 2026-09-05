import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { countUnread, defaultNotificationPreferences, deliveryFor, isBoardMuted, type Notification } from "@/domain";
import { createServices } from "@/services";
import { shouldRaiseOsNotification } from "@/lib/browser-notifications";

let counter = 0;

function services() {
  counter += 1;
  return createServices(createLocalRepositories({ databaseName: `notify-${Date.now()}-${counter}` }));
}

describe("delivery rules", () => {
  it("uses the shipped defaults when someone has never changed anything", () => {
    expect(deliveryFor(null, "MENTION", null)).toBe("NOTIFICATION");
    expect(deliveryFor(null, "ASSIGNED", null)).toBe("NOTIFICATION");
    expect(deliveryFor(null, "STATUS_CHANGED", null)).toBe("UPDATE");
    expect(deliveryFor(null, "DUE_DATE_CHANGED", null)).toBe("UPDATE");
    expect(deliveryFor(null, "ITEM_LINKED", null)).toBe("UPDATE");
  });

  it("follows the person's own choice for a type", () => {
    const prefs = { ...defaultNotificationPreferences("u1"), types: { ...defaultNotificationPreferences("u1").types, MENTION: "UPDATE" as const, STATUS_CHANGED: "NOTIFICATION" as const } };
    expect(deliveryFor(prefs, "MENTION", null)).toBe("UPDATE");
    expect(deliveryFor(prefs, "STATUS_CHANGED", null)).toBe("NOTIFICATION");
    // Anything they have not touched still uses the default.
    expect(deliveryFor(prefs, "ASSIGNED", null)).toBe("NOTIFICATION");
  });

  it("an unsubscribed board silences everything from it, whatever the type says", () => {
    const prefs = { ...defaultNotificationPreferences("u1"), mutedBoardIds: ["board-1"] };
    expect(deliveryFor(prefs, "MENTION", "board-1")).toBe("OFF");
    expect(deliveryFor(prefs, "ASSIGNED", "board-1")).toBe("OFF");
    // Other boards are untouched.
    expect(deliveryFor(prefs, "MENTION", "board-2")).toBe("NOTIFICATION");
    // And a notification with no board at all still arrives.
    expect(deliveryFor(prefs, "MENTION", null)).toBe("NOTIFICATION");
    expect(isBoardMuted(prefs, "board-1")).toBe(true);
    expect(isBoardMuted(prefs, "board-2")).toBe(false);
  });

  it("counts unread separately for the two badges", () => {
    const rows = [
      { delivery: "NOTIFICATION", readAt: null },
      { delivery: "NOTIFICATION", readAt: null },
      { delivery: "NOTIFICATION", readAt: "2026-01-01T00:00:00.000Z" },
      { delivery: "UPDATE", readAt: null },
      { delivery: "UPDATE", readAt: "2026-01-01T00:00:00.000Z" },
    ] as Notification[];
    expect(countUnread(rows)).toEqual({ notifications: 2, updates: 1 });
    expect(countUnread([])).toEqual({ notifications: 0, updates: 0 });
  });
});

describe("NotificationService.deliver", () => {
  let app: ReturnType<typeof createServices>;

  beforeEach(() => {
    app = services();
  });

  const mention = (userId: string, boardId: string | null = SEED_BOARD_IDS.rmitinerary) => ({
    userId,
    type: "MENTION" as const,
    title: "Someone mentioned you",
    body: null,
    entityType: "ITEM" as const,
    entityId: "item-1",
    boardId,
    actorId: SEED_USER_IDS.emily,
  });

  it("writes each notification the way its recipient asked for it", async () => {
    await app.notifications.savePreferences(SEED_USER_IDS.tuyet, { types: { MENTION: "UPDATE" } as never });

    const written = await app.notifications.deliver([mention(SEED_USER_IDS.danh), mention(SEED_USER_IDS.tuyet)]);

    expect(written).toHaveLength(2);
    expect(written.find((n) => n.userId === SEED_USER_IDS.danh)?.delivery).toBe("NOTIFICATION");
    expect(written.find((n) => n.userId === SEED_USER_IDS.tuyet)?.delivery).toBe("UPDATE");
  });

  it("writes nothing for a type someone turned off", async () => {
    await app.notifications.savePreferences(SEED_USER_IDS.danh, { types: { MENTION: "OFF" } as never });
    const before = (await app.repos.notifications.listByUser(SEED_USER_IDS.danh)).length;

    expect(await app.notifications.deliver([mention(SEED_USER_IDS.danh)])).toEqual([]);
    expect(await app.repos.notifications.listByUser(SEED_USER_IDS.danh)).toHaveLength(before);
  });

  it("writes nothing from a board someone unsubscribed from", async () => {
    await app.notifications.setBoardSubscribed(SEED_USER_IDS.danh, SEED_BOARD_IDS.rmitinerary, false);

    expect(await app.notifications.deliver([mention(SEED_USER_IDS.danh, SEED_BOARD_IDS.rmitinerary)])).toEqual([]);
    // Another board still reaches them.
    const elsewhere = await app.notifications.deliver([mention(SEED_USER_IDS.danh, SEED_BOARD_IDS.openday)]);
    expect(elsewhere).toHaveLength(1);

    // And resubscribing restores it.
    await app.notifications.setBoardSubscribed(SEED_USER_IDS.danh, SEED_BOARD_IDS.rmitinerary, true);
    expect(await app.notifications.deliver([mention(SEED_USER_IDS.danh)])).toHaveLength(1);
  });

  it("one person's choice does not change what anyone else receives", async () => {
    await app.notifications.savePreferences(SEED_USER_IDS.danh, { types: { MENTION: "OFF" } as never });
    const written = await app.notifications.deliver([mention(SEED_USER_IDS.danh), mention(SEED_USER_IDS.jun)]);
    expect(written.map((n) => n.userId)).toEqual([SEED_USER_IDS.jun]);
  });

  it("saving one setting leaves the others alone", async () => {
    await app.notifications.savePreferences(SEED_USER_IDS.grace, { types: { MENTION: "UPDATE" } as never });
    await app.notifications.savePreferences(SEED_USER_IDS.grace, { browserEnabled: true });

    const prefs = await app.notifications.getPreferences(SEED_USER_IDS.grace);
    expect(prefs.types.MENTION).toBe("UPDATE");
    expect(prefs.types.ASSIGNED).toBe("NOTIFICATION");
    expect(prefs.browserEnabled).toBe(true);
  });

  it("an empty batch touches nothing", async () => {
    expect(await app.notifications.deliver([])).toEqual([]);
  });
});

describe("what the app's own events deliver as", () => {
  it("a mention interrupts, a status change collects quietly", async () => {
    const app = services();
    const board = (await app.repos.boards.getById(SEED_BOARD_IDS.rmitinerary))!;
    const columns = await app.repos.boards.listColumns(board.id);
    const users = await app.repos.users.list();
    const items = (await app.repos.items.listByBoard(board.id)).filter((i) => i.parentItemId === null);

    // A status change on an item owned by someone else.
    const status = columns.find((c) => c.type === "STATUS")!;
    const person = columns.find((c) => c.type === "PERSON")!;
    const item = items[0]!;
    await app.repos.items.setValue(item.id, person.id, { type: "PERSON", userIds: [SEED_USER_IDS.tuyet] });
    await app.items.setValue(item.id, status.id, { type: "STATUS", labelId: "stuck" }, { column: status, item, board, users }, SEED_USER_IDS.danh);

    const statusNotifications = (await app.repos.notifications.listByUser(SEED_USER_IDS.tuyet)).filter((n) => n.type === "STATUS_CHANGED");
    expect(statusNotifications.length).toBeGreaterThan(0);
    expect(statusNotifications.every((n) => n.delivery === "UPDATE")).toBe(true);

    // A mention in an update.
    await app.comments.addComment(item.id, "@Tuyet Le can you look at this?", SEED_USER_IDS.danh, users);
    const mentions = (await app.repos.notifications.listByUser(SEED_USER_IDS.tuyet)).filter((n) => n.type === "MENTION");
    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.every((n) => n.delivery === "NOTIFICATION")).toBe(true);
  });
});

describe("raising an operating-system notification", () => {
  const base = { delivery: "NOTIFICATION", enabled: true, permission: "granted", visibility: "hidden", alreadySeen: false } as const;

  it("raises one for a new, loud notification while the tab is in the background", () => {
    expect(shouldRaiseOsNotification({ ...base })).toBe(true);
  });

  it("stays quiet for an update", () => {
    expect(shouldRaiseOsNotification({ ...base, delivery: "UPDATE" })).toBe(false);
  });

  it("stays quiet when the person has not switched it on", () => {
    expect(shouldRaiseOsNotification({ ...base, enabled: false })).toBe(false);
  });

  it("stays quiet without permission", () => {
    for (const permission of ["default", "denied", "unsupported"] as const) {
      expect(shouldRaiseOsNotification({ ...base, permission })).toBe(false);
    }
  });

  it("stays quiet while the reader is looking at the app", () => {
    expect(shouldRaiseOsNotification({ ...base, visibility: "visible" })).toBe(false);
  });

  it("never repeats one it has already shown", () => {
    expect(shouldRaiseOsNotification({ ...base, alreadySeen: true })).toBe(false);
  });
});
