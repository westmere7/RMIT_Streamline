import { describe, expect, it } from "vitest";
import type { Activity, Comment } from "@/domain";
import { mergeFeed } from "@/features/items/item-feed";

const update = (id: string, createdAt: string, pin?: Comment["pin"]): Comment =>
  ({ id, itemId: "i", authorId: "u", body: id, createdAt, updatedAt: createdAt, parentId: null, pin: pin ?? null }) as unknown as Comment;
const line = (id: string, createdAt: string, eventType: Activity["eventType"] = "ITEM_COLUMN_VALUE_UPDATED"): Activity =>
  ({ id, workspaceId: "w", boardId: "b", itemId: "i", actorId: "u", eventType, createdAt, metadata: {} }) as unknown as Activity;
const ids = (entries: ReturnType<typeof mergeFeed>) => entries.map((e) => (e.kind === "update" ? `u:${e.comment.id}` : `l:${e.activity.id}`));

describe("the pop-up's feed", () => {
  it("weaves updates and history together, newest first", () => {
    const updates = [update("b", "2026-11-26T10:00:00Z"), update("a", "2026-11-25T10:00:00Z")];
    const log = [line("x", "2026-11-26T12:00:00Z"), line("y", "2026-11-25T12:00:00Z"), line("z", "2026-11-24T12:00:00Z")];
    expect(ids(mergeFeed(updates, new Map(), log))).toEqual(["l:x", "u:b", "l:y", "u:a", "l:z"]);
  });

  it("keeps pinned conversations on top and leaves out the update-posted lines", () => {
    const pin = { overview: false, pinnedAt: "2026-11-26T09:00:00Z", pinnedBy: "u" } as unknown as Comment["pin"];
    const updates = [update("p", "2026-11-20T10:00:00Z", pin), update("b", "2026-11-26T10:00:00Z")];
    const log = [line("posted", "2026-11-26T10:00:00Z", "COMMENT_ADDED"), line("x", "2026-11-27T10:00:00Z")];
    expect(ids(mergeFeed(updates, new Map(), log))).toEqual(["u:p", "l:x", "u:b"]);
  });

  it("sorts history it was given out of order", () => {
    const log = [line("old", "2026-11-01T00:00:00Z"), line("new", "2026-11-02T00:00:00Z")];
    expect(ids(mergeFeed([], new Map(), log))).toEqual(["l:new", "l:old"]);
  });
});
