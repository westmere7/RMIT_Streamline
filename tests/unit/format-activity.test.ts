import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Activity, User } from "@/domain";
import { moveEnds } from "@/domain";
import { describeActivity, describeActivityText } from "@/features/activity/format-activity";

const users: User[] = [
  { id: "danh", email: "danh@rmit.local", firstName: "Danh", lastName: "Nguyen", displayName: "Danh Nguyen", avatarUrl: null, jobTitle: null, department: null, timezone: "UTC", deactivatedAt: null, createdAt: "", updatedAt: "" },
  { id: "jun", email: "jun@rmit.local", firstName: "Jun", lastName: "Tanaka", displayName: "Jun Tanaka", avatarUrl: null, jobTitle: null, department: null, timezone: "UTC", deactivatedAt: null, createdAt: "", updatedAt: "" },
];

function activity(overrides: Partial<Activity>): Activity {
  return { id: "a", workspaceId: "w", boardId: "b", itemId: "i", actorId: "danh", eventType: "ITEM_CREATED", metadata: {}, createdAt: "", ...overrides };
}

describe("describeActivityText", () => {
  it("turns a status change into a sentence", () => {
    expect(
      describeActivityText(activity({ eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnName: "Status", columnType: "STATUS", from: "In Progress", to: "Done" } }), users),
    ).toBe("Danh changed Status from In Progress to Done");
  });

  it("describes assignments by name", () => {
    expect(describeActivityText(activity({ actorId: "jun", eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnName: "Owner", columnType: "PERSON", addedUserIds: ["danh"] } }), users)).toBe("Jun assigned Danh");
  });

  it("formats date changes with short dates", () => {
    expect(
      describeActivityText(activity({ eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnName: "Due Date", columnType: "DATE", from: "2026-09-08", to: "2026-09-11" } }), users),
    ).toBe("Danh changed Due Date from Sep 8 to Sep 11");
  });

  it("describes moves and unknown actors", () => {
    expect(describeActivityText(activity({ eventType: "ITEM_MOVED", metadata: { toGroupName: "Completed" } }), users)).toBe("Danh moved the item to Completed");
    expect(describeActivityText(activity({ actorId: "ghost", eventType: "ITEM_MOVED", metadata: { toGroupName: "Done" } }), users)).toBe("Someone moved the item to Done");
  });

  // Allocating a booked task moves it to another board, and that move names the
  // boards (`from`, `to`) rather than groups: it read "moved the item to" with
  // nothing after it.
  it("names the board a task was moved to, and where from", () => {
    const allocated = activity({ eventType: "ITEM_MOVED", metadata: { itemName: "FB post", boardName: "Design", from: "Task Allocation", to: "Design" } });
    expect(moveEnds(allocated.metadata)).toEqual({ to: "Design", from: "Task Allocation" });
    expect(describeActivityText(allocated, users)).toBe("Danh moved the item to Design");
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, describeActivity(allocated, users, true)));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Danh moved FB post to Design from Task Allocation");
    // With nowhere recorded at all, it stops at the task rather than at "to".
    expect(describeActivityText(activity({ eventType: "ITEM_MOVED", metadata: {} }), users)).toBe("Danh moved the item");
  });

  // An asset's PIC is recorded as people put on and taken off. The feed read
  // only `to`, which these entries never carry, so every one said "to empty".
  it("says who was put in charge of an asset, and who was taken off", () => {
    const pic = (metadata: Activity["metadata"]) => activity({ eventType: "ASSET_UPDATED", metadata: { itemName: "Holiday social posts", assetName: "Key visual", assetField: "who is in charge", ...metadata } });
    expect(describeActivityText(pic({ addedUserIds: ["jun"], removedUserIds: [] }), users)).toBe("Danh put Jun in charge of Key visual");
    expect(describeActivityText(pic({ addedUserIds: [], removedUserIds: ["jun"] }), users)).toBe("Danh took Jun off Key visual");
    expect(describeActivityText(pic({ addedUserIds: ["jun"], removedUserIds: ["danh"] }), users)).toBe("Danh put Jun in charge of Key visual and took Danh off it");
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, describeActivity(pic({ addedUserIds: ["jun"], removedUserIds: [] }), users)));
    expect(html.replace(/<[^>]+>/g, "")).toMatch(/^Danh put Jun in charge of Key visual/);
    expect(html).not.toContain("empty");
    // Any other field still reads from and to.
    expect(describeActivityText(pic({ assetField: "quantity", from: "1", to: "7" }), users)).toBe("Danh set quantity on Key visual to 7");
  });
});
