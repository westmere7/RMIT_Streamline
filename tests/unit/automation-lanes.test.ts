import { describe, expect, it } from "vitest";
import type { AutomationEvent } from "@/domain";
import { lanesOf } from "@/services/automation-engine";

/**
 * The one promise the concurrent drain makes: what happened to a task is seen
 * in the order it happened. Everything else about running lanes side by side
 * is a matter of speed, and speed is not something a unit test should time.
 */
function event(id: number, itemId: string | null, boardId = "board-1"): AutomationEvent {
  return { id: String(id), boardId, itemId, kind: "value_changed", columnId: null, actorId: null, payload: {}, depth: 0, createdAt: `2026-09-20T00:00:${String(id).padStart(2, "0")}Z`, processedAt: null, attempts: 0, error: null };
}

describe("lanesOf", () => {
  it("keeps one task's events together and in queue order", () => {
    const lanes = lanesOf([event(1, "a"), event(2, "b"), event(3, "a"), event(4, "c"), event(5, "b")]);
    expect(lanes.map((lane) => lane.map((e) => e.id))).toEqual([["1", "3"], ["2", "5"], ["4"]]);
  });

  it("gives events with no task a lane per board, so two boards' comments do not queue behind each other", () => {
    const lanes = lanesOf([event(1, null, "x"), event(2, null, "y"), event(3, null, "x")]);
    expect(lanes.map((lane) => lane.map((e) => e.id))).toEqual([["1", "3"], ["2"]]);
  });

  it("hands back nothing for nothing", () => {
    expect(lanesOf([])).toEqual([]);
  });
});
