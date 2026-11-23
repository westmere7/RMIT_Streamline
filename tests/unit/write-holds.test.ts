import { describe, expect, it, vi } from "vitest";
import { holdQuery, isQueryHeld, onHoldReleased } from "@/lib/query/write-holds";

/** Queries with saves on their way (v0.161): held as TanStack prefixes match, released once per hold. */
describe("write holds", () => {
  it("holds a key, the keys it covers and the keys that cover it, until every hold is released", () => {
    const first = holdQuery(["board-snapshot", "b1"]);
    const second = holdQuery(["board-snapshot", "b1"]);
    expect(isQueryHeld(["board-snapshot", "b1"])).toBe(true);
    expect(isQueryHeld(["board-snapshot"])).toBe(true);
    expect(isQueryHeld(["board-snapshot", "b2"])).toBe(false);
    first();
    first();
    expect(isQueryHeld(["board-snapshot", "b1"])).toBe(true);
    second();
    expect(isQueryHeld(["board-snapshot", "b1"])).toBe(false);
  });

  it("tells listeners about each release", () => {
    const heard = vi.fn();
    const stop = onHoldReleased(heard);
    holdQuery(["comments", "t1"])();
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    holdQuery(["comments", "t1"])();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
