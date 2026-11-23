import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isQueryHeld } from "@/lib/query/write-holds";
import { useBatchedWrites, type BatchedWritesOptions } from "@/lib/query/use-batched-writes";
import { hasUnsavedWork, resetUnsavedWork } from "@/lib/unsaved-work";

/**
 * Quick edits saved in batches (v0.161): ticking down a list of asset lines or
 * checklist boxes sends one save per thing that changed, folds repeat changes
 * together, keeps realtime re-reads off the query until the last save has
 * landed, and reads back once.
 */

type Write = { on: boolean };

function setup(overrides: Partial<BatchedWritesOptions<Write>> = {}) {
  const send = vi.fn<(id: string, write: Write) => Promise<unknown>>(async () => undefined);
  const onDrained = vi.fn<(failed: number) => void>();
  const view = renderHook(() =>
    useBatchedWrites<Write>({ queryKey: ["comments", "task-1"], delayMs: 600, merge: (_a, b) => b, send, onDrained, ...overrides }),
  );
  return { ...view, send, onDrained };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetUnsavedWork();
});

describe("batched writes", () => {
  it("saves a burst once the edits pause, the last change per thing only, and reads back once", async () => {
    const { result, send, onDrained } = setup();
    act(() => {
      result.current.enqueue("a", { on: true });
      result.current.enqueue("b", { on: true });
      result.current.enqueue("a", { on: false });
    });
    await act(async () => void vi.advanceTimersByTime(500));
    expect(send).not.toHaveBeenCalled();
    expect(isQueryHeld(["comments", "task-1"])).toBe(true);
    expect(isQueryHeld(["comments"])).toBe(true);

    await act(async () => void vi.advanceTimersByTime(200));
    expect(send.mock.calls).toEqual([
      ["a", { on: false }],
      ["b", { on: true }],
    ]);
    expect(onDrained).toHaveBeenCalledTimes(1);
    expect(onDrained).toHaveBeenCalledWith(0);
    expect(isQueryHeld(["comments", "task-1"])).toBe(false);
  });

  it("does not wait forever while the edits keep coming", async () => {
    const { result, send } = setup({ maxWaitMs: 2_000 });
    for (let i = 0; i < 6; i++) {
      act(() => result.current.enqueue(`box-${i}`, { on: true }));
      await act(async () => void vi.advanceTimersByTime(500));
    }
    expect(send).toHaveBeenCalled();
  });

  it("counts what did not save and still reads back", async () => {
    const send = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("no");
    });
    const { result, onDrained } = setup({ send });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => {
      result.current.enqueue("bad", { on: true });
      result.current.enqueue("good", { on: true });
    });
    await act(async () => void vi.advanceTimersByTime(700));
    expect(onDrained).toHaveBeenCalledWith(1);
    expect(result.current.busy()).toBe(false);
  });

  it("sends what is waiting at once when the page is closed or reloaded, and asks first", async () => {
    const { result, send } = setup();
    act(() => result.current.enqueue("a", { on: true }));
    expect(hasUnsavedWork()).toBe(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => undefined);
    expect(send).toHaveBeenCalledWith("a", { on: true });
  });

  it("sends what is waiting when the screen goes away", async () => {
    const { result, send, unmount } = setup();
    act(() => result.current.enqueue("a", { on: true }));
    unmount();
    await act(async () => undefined);
    expect(send).toHaveBeenCalledWith("a", { on: true });
  });

  it("sends a batch one save after another, never two at once", async () => {
    let open = 0;
    let most = 0;
    const send = vi.fn(async () => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 50));
      open -= 1;
    });
    const { result, onDrained } = setup({ send });
    act(() => ["a", "b", "c"].forEach((id) => result.current.enqueue(id, { on: true })));
    await act(async () => void vi.advanceTimersByTime(700));
    for (let i = 0; i < 3; i++) await act(async () => void vi.advanceTimersByTime(60));
    expect(send).toHaveBeenCalledTimes(3);
    expect(most).toBe(1);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });
});

describe("an asset line's changes, netted", () => {
  it("drops a tick undone before it was saved, and keeps everything when the start is unknown", async () => {
    const { netLinePatch } = await import("@/features/items/asset-hooks");
    expect(netLinePatch({ patch: { completedAt: null }, was: { completedAt: null } })).toBeNull();
    expect(netLinePatch({ patch: { completedAt: "2026-11-23T10:00:00Z" }, was: { completedAt: "2026-11-01T10:00:00Z" } })).toBeNull();
    expect(netLinePatch({ patch: { completedAt: null, quantity: 3 }, was: { completedAt: null, quantity: 2 } })).toEqual({ quantity: 3 });
    expect(netLinePatch({ patch: { completedAt: null }, was: null })).toEqual({ completedAt: null });
  });
});
