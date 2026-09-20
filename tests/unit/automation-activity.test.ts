import { describe, expect, it } from "vitest";
import { AUTOMATION_ACTIVITY_HOLD_MS, NO_BUSY_BOARDS, reconcileBusy } from "@/features/automations/activity";

/**
 * The held set behind the "automations running" indicator.
 *
 * The queue is the source of truth, but it is drained faster than an eye can
 * follow; these pin down the one thing the hold adds — a board stays lit for a
 * moment after its rows are gone — and the one thing it must not do, which is
 * keep a board lit past that moment.
 */
describe("reconcileBusy", () => {
  const T0 = 1_000_000;

  it("lights a board the moment its queue has a row, stamped with when it appeared", () => {
    const { next, recheckIn } = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0);
    expect([...next.entries()]).toEqual([["a", T0]]);
    expect(recheckIn).toBeNull();
  });

  it("keeps the original timestamp while the board stays pending", () => {
    const first = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0).next;
    const { next } = reconcileBusy(first, ["a"], T0 + 900);
    expect(next.get("a")).toBe(T0);
  });

  it("holds a board that went quiet before it could be seen, and says when to look again", () => {
    const first = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0).next;
    const { next, recheckIn } = reconcileBusy(first, [], T0 + 400);
    expect(next.has("a")).toBe(true);
    expect(recheckIn).toBe(AUTOMATION_ACTIVITY_HOLD_MS - 400);
  });

  it("lets go once the hold has run out", () => {
    const first = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0).next;
    const { next, recheckIn } = reconcileBusy(first, [], T0 + AUTOMATION_ACTIVITY_HOLD_MS);
    expect(next.size).toBe(0);
    expect(recheckIn).toBeNull();
  });

  it("times the recheck to the earliest board due to go", () => {
    const first = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0).next;
    const second = reconcileBusy(first, ["a", "b"], T0 + 1_000).next;
    const { next, recheckIn } = reconcileBusy(second, [], T0 + 1_200);
    expect(next.size).toBe(2);
    expect(recheckIn).toBe(AUTOMATION_ACTIVITY_HOLD_MS - 1_200);
  });

  it("hands back the same map when nothing changed, so state holding it stays put", () => {
    const first = reconcileBusy(NO_BUSY_BOARDS, ["a"], T0).next;
    const { next } = reconcileBusy(first, ["a"], T0 + 100);
    expect(next).toBe(first);
    expect(reconcileBusy(NO_BUSY_BOARDS, [], T0).next).toBe(NO_BUSY_BOARDS);
  });
});
