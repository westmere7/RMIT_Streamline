import { describe, expect, it } from "vitest";
import type { Activity, User } from "@/domain";
import { describeActivityText } from "@/features/activity/format-activity";

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
      describeActivityText(activity({ eventType: "ITEM_COLUMN_VALUE_UPDATED", metadata: { columnName: "Status", columnType: "STATUS", from: "Working On It", to: "Done" } }), users),
    ).toBe("Danh changed Status from Working On It to Done");
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
});
