import { describe, expect, it } from "vitest";
import type { Activity, ActivityEventType, ActivityMetadata } from "@/domain";
import { buildJourney, formatSpan } from "@/features/journey/journey";

const T0 = Date.parse("2026-09-01T09:00:00.000Z");
const HOUR = 3_600_000;
let seq = 0;
function event(eventType: ActivityEventType, hoursIn: number, metadata: ActivityMetadata = {}): Activity {
  seq += 1;
  return { id: `a${String(seq).padStart(3, "0")}`, workspaceId: "ws", boardId: "b", itemId: "i", actorId: "u1", eventType, metadata, createdAt: new Date(T0 + hoursIn * HOUR).toISOString() };
}

const statuses = [
  { name: "Not Started", color: "gray" as const, done: false },
  { name: "In Progress", color: "orange" as const, done: false },
  { name: "Done", color: "green" as const, done: true },
];

describe("task journey", () => {
  const log = [
    event("ITEM_CREATED", 0, { boardName: "Task Allocation", via: "booking", requesterName: "Priya", department: "Marketing" }),
    event("ASSET_ADDED", 0, { assetName: "A2 poster" }),
    event("ASSET_ADDED", 0, { assetName: "Social tile" }),
    event("ITEM_RENAMED", 1, { from: "old", to: "new" }),
    event("ITEM_COLUMN_VALUE_UPDATED", 1, { columnType: "PERSON", columnName: "PIC" }),
    event("ITEM_MOVED", 5, { from: "Task Allocation", to: "Semester 1 Campaign" }),
    event("ITEM_COLUMN_VALUE_UPDATED", 6, { columnType: "STATUS", from: "Not Started", to: "In Progress" }),
    event("ASSET_COMPLETED", 30, { assetName: "A2 poster" }),
    event("ASSET_COMPLETED", 40, { assetName: "Social tile" }),
    event("ITEM_COLUMN_VALUE_UPDATED", 48, { columnType: "STATUS", from: "In Progress", to: "Done" }),
    event("ITEM_ARCHIVED", 72, { boardName: "Semester 1 Campaign" }),
    event("ITEM_COLUMN_VALUE_UPDATED", 80, { columnType: "STATUS", from: "Done", to: "In Progress" }),
  ];
  const journey = buildJourney(log, { statuses, now: new Date(T0 + 100 * HOUR) });

  it("keeps the milestones and drops the small changes", () => {
    expect(journey.milestones.map((m) => m.kind)).toEqual(["booked", "allocated", "status", "asset-done", "assets-complete", "done", "archived"]);
    expect(journey.milestones[0]!.detail).toBe("by Priya · for Marketing · into Task Allocation · 2 deliverables");
    expect(journey.booking).toEqual({ requesterName: "Priya", department: "Marketing", via: "booking" });
  });

  it("stops at the archive", () => {
    expect(journey.ongoing).toBe(false);
    expect(journey.totalMs).toBe(72 * HOUR);
    expect(journey.current?.name).toBe("Done");
  });

  it("times each leg and each phase", () => {
    expect(journey.milestones[1]!.sincePrev).toBe(5 * HOUR);
    expect(journey.phases.map((p) => [p.key, p.ms / HOUR])).toEqual([
      ["queue", 5],
      ["team", 43],
      ["wrap", 24],
    ]);
    // Not Started from booking until 6h, In Progress 6h → 48h, Done 48h → archive.
    expect(Object.fromEntries(journey.inStatus.map((s) => [s.name, s.ms / HOUR]))).toEqual({ "In Progress": 42, Done: 24, "Not Started": 6 });
  });

  it("counts deliverables as they land", () => {
    expect(journey.milestones[3]!.progress).toEqual({ done: 1, total: 2 });
    expect(journey.milestones[4]!.title).toBe("All 2 deliverables done");
  });

  it("is still going until it is archived, and counts to now", () => {
    const open = buildJourney(log.slice(0, 7), { statuses, now: new Date(T0 + 10 * HOUR) });
    expect(open.ongoing).toBe(true);
    expect(open.totalMs).toBe(10 * HOUR);
    expect(open.phases.find((p) => p.key === "team")).toMatchObject({ open: true, ms: 5 * HOUR });
  });

  it("reads an older booking by its board", () => {
    const old = buildJourney([event("ITEM_CREATED", 0, { boardName: "Task Allocation" })], { statuses, now: new Date(T0 + HOUR) });
    expect(old.milestones[0]!.kind).toBe("booked");
    expect(old.phases[0]).toMatchObject({ key: "queue", open: true });
  });

  it("writes spans in at most two units", () => {
    expect(formatSpan(42_000)).toBe("42s");
    expect(formatSpan(3 * HOUR + 20 * 60_000)).toBe("3h 20m");
    expect(formatSpan(52 * HOUR)).toBe("2d 4h");
    expect(formatSpan(23 * 24 * HOUR)).toBe("3w 2d");
  });

  it("makes deliverables ticked off one after another one step, counted against the lines the task came with", () => {
    const burst = [
      event("ITEM_CREATED", 0, { via: "booking", boardName: "Task Allocation" }),
      ...["Arch banner", "Pull-up", "Table talker", "Event map", "Teaser"].map((assetName, i) => event("ASSET_COMPLETED", 5 + i * 0.0003, { assetName })),
    ];
    const journey = buildJourney(burst, { statuses, now: new Date(T0 + 10 * HOUR), assetCount: 7 });
    const done = journey.milestones.filter((m) => m.kind === "asset-done" || m.kind === "assets-complete");
    expect(done).toHaveLength(1);
    expect(done[0]!.title).toBe("5 deliverables done");
    expect(done[0]!.detail).toBe("Arch banner, Pull-up, Table talker and 2 more");
    // Seven lines came with the booking, none logged as added.
    expect(done[0]!.progress).toEqual({ done: 5, total: 7 });
    expect(journey.milestones[0]!.detail).toContain("7 deliverables");
  });
});
