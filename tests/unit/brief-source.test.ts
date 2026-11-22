import { describe, expect, it } from "vitest";
import type { Activity } from "@/domain/activity/activity";
import { briefMatchesSource, briefSourceText, lastBriefEdit } from "@/domain/booking/brief-source";

const booked = "**Service:** Design Request\n\n## 1. What design type do you after?\nSocial post\n\n## 2. Who is the audience?\n  parents & students";

const entry = (over: Partial<Activity> & { metadata: Activity["metadata"] }): Activity => ({
  id: Math.random().toString(36),
  workspaceId: "w",
  boardId: "b",
  itemId: "i",
  actorId: "u1",
  eventType: "ITEM_COLUMN_VALUE_UPDATED",
  createdAt: "2026-11-22T10:00:00.000Z",
  ...over,
});

describe("the brief as booked", () => {
  it("goes into a Brief column as written, and an old plain brief gets headings", () => {
    expect(briefSourceText(booked)).toBe(booked);
    expect(briefSourceText("Service: Design\n\n1. Audience\nStudents")).toBe("**Service:** Design\n\n## 1. Audience\nStudents");
  });

  it("matches the working copy until someone changes the words, not the line ends", () => {
    expect(briefMatchesSource(booked, booked)).toBe(true);
    expect(briefMatchesSource(`${booked.replace(/\n/g, "  \r\n")}\n`, booked)).toBe(true);
    expect(briefMatchesSource(booked.replace("Social post", "Story"), booked)).toBe(false);
    // An old brief a later Brief column dressed with headings still counts as unedited.
    expect(briefMatchesSource("**Service:** Design\n\n## 1. Audience\nStudents", "Service: Design\n\n1. Audience\nStudents")).toBe(true);
  });

  it("names the latest change to that column, by id, or by name in older entries", () => {
    const column = { id: "c1", name: "Brief" };
    const log = [
      entry({ actorId: "old", createdAt: "2026-11-20T09:00:00.000Z", metadata: { columnName: "Brief", columnType: "BRIEF" } }),
      entry({ actorId: "new", createdAt: "2026-11-22T09:00:00.000Z", metadata: { columnId: "c1", columnName: "Renamed", columnType: "BRIEF" } }),
      entry({ actorId: "other", createdAt: "2026-11-23T09:00:00.000Z", metadata: { columnId: "c2", columnName: "Brief", columnType: "BRIEF" } }),
      entry({ actorId: "status", createdAt: "2026-11-24T09:00:00.000Z", eventType: "ITEM_CREATED", metadata: { columnId: "c1" } }),
    ];
    expect(lastBriefEdit(log, column)).toEqual({ actorId: "new", at: "2026-11-22T09:00:00.000Z" });
    expect(lastBriefEdit([], column)).toBeNull();
  });
});

describe("who booked it and when, in the brief", () => {
  it("is written as words under the service, and the portal leaves the name out", async () => {
    const { briefForVisitors, formatBookedAt } = await import("@/services/booking");
    expect(formatBookedAt(new Date("2026-11-22T07:20:00.000Z"))).toBe("Nov 22, 2026, 2:20 PM (Vietnam time)");
    const brief = "**Service:** Design\n\n**Booked by:** Linh Tran · Comm.\n\n**Booked:** Nov 22, 2026, 2:20 PM (Vietnam time)\n\n---\n\n## 1. Audience\nStudents";
    expect(briefForVisitors(brief)).toBe("**Service:** Design\n\n**Booked:** Nov 22, 2026, 2:20 PM (Vietnam time)\n\n---\n\n## 1. Audience\nStudents");
    expect(briefForVisitors(null)).toBeNull();
  });
});
