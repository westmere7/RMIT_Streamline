import { describe, expect, it } from "vitest";
import type { Comment } from "@/domain";
import { summarizeUpdates } from "@/features/comments/updates";

const comment = (id: string, itemId: string, authorId: string, createdAt: string): Comment => ({ id, itemId, authorId, body: "…", mentionUserIds: [], sharedId: null, createdAt, updatedAt: createdAt });

const comments = [
  comment("c1", "item-a", "emily", "2026-09-01T09:00:00.000Z"),
  comment("c2", "item-a", "me", "2026-09-01T10:00:00.000Z"),
  comment("c3", "item-a", "jun", "2026-09-02T09:00:00.000Z"),
  comment("c4", "item-b", "jun", "2026-09-03T09:00:00.000Z"),
];

describe("update badges", () => {
  it("counts every update but calls only other people's newer-than-seen ones new", () => {
    const fresh = summarizeUpdates(comments, "me", {}, []);
    expect(fresh.get("item-a")).toEqual({ count: 3, unread: 2 });
    expect(fresh.get("item-b")).toEqual({ count: 1, unread: 1 });
    expect(fresh.get("item-c")).toBeUndefined();

    const seen = summarizeUpdates(comments, "me", { "item-a": "2026-09-01T12:00:00.000Z" }, []);
    expect(seen.get("item-a")).toEqual({ count: 3, unread: 1 });
  });

  it("treats a notification read in the Inbox as catching up on that item", () => {
    const readInInbox = [{ entityType: "ITEM" as const, entityId: "item-b", readAt: "2026-09-04T00:00:00.000Z" }];
    const result = summarizeUpdates(comments, "me", {}, readInInbox);
    expect(result.get("item-b")).toEqual({ count: 1, unread: 0 });
    // Unread notifications and notifications about other things change nothing.
    const unrelated = [
      { entityType: "ITEM" as const, entityId: "item-b", readAt: null },
      { entityType: "BOARD" as const, entityId: "item-b", readAt: "2026-09-04T00:00:00.000Z" },
    ];
    expect(summarizeUpdates(comments, "me", {}, unrelated).get("item-b")).toEqual({ count: 1, unread: 1 });
  });

  it("uses whichever of the seen marker and the read notification is later", () => {
    const result = summarizeUpdates(comments, "me", { "item-a": "2026-09-01T09:30:00.000Z" }, [{ entityType: "ITEM", entityId: "item-a", readAt: "2026-09-02T10:00:00.000Z" }]);
    expect(result.get("item-a")).toEqual({ count: 3, unread: 0 });
  });
});
