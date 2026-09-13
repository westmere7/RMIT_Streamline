import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

/**
 * A channel that records what was subscribed to and lets a test push rows at it.
 *
 * Deliberately close to the shape supabase-js offers: `on` is chainable,
 * `subscribe` reports status, and a listener is only reached by an event whose
 * table and kind match the config it was registered with — which is the whole
 * point of the DELETE companion the hook adds.
 */
function fakeChannel() {
  const listeners: Array<{ event: string; table: string; filter?: string; run: () => void }> = [];
  let onStatus: ((status: string) => void) | null = null;
  const channel = {
    on(_kind: string, config: { event: string; table: string; filter?: string }, run: () => void) {
      listeners.push({ event: config.event, table: config.table, filter: config.filter, run });
      return channel;
    },
    subscribe(handler?: (status: string) => void) {
      onStatus = handler ?? null;
      onStatus?.("SUBSCRIBED");
      return channel;
    },
  };
  return {
    channel,
    listeners,
    emit(table: string, event: "INSERT" | "UPDATE" | "DELETE" = "UPDATE") {
      for (const listener of listeners) {
        if (listener.table === table && (listener.event === "*" || listener.event === event)) listener.run();
      }
    },
    reconnect() {
      onStatus?.("SUBSCRIBED");
    },
  };
}

let provider: "supabase" | "local" = "supabase";
let live = fakeChannel();
const removeChannel = vi.fn();

vi.mock("@/features/data/data-context", () => ({
  useDataContext: () => ({ providerKind: provider }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    channel: () => live.channel,
    removeChannel: (...args: unknown[]) => removeChannel(...args),
  }),
}));

function subscribe(bindings: RealtimeBinding[], options?: Parameters<typeof useRealtime>[2]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(({ b }: { b: RealtimeBinding[] }) => useRealtime("test", b, options), { wrapper, initialProps: { b: bindings } });
  invalidate.mockClear();
  return { ...view, invalidate };
}

/** Keys the hook asked to be refetched, flattened for easy assertions. */
const refetched = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map(([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey));

beforeEach(() => {
  provider = "supabase";
  live = fakeChannel();
  removeChannel.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a realtime subscription", () => {
  it("refetches once for a burst of rows rather than once per row", () => {
    const { invalidate } = subscribe([{ table: "items", keys: [["board-snapshot", "b1"]] }]);

    act(() => {
      live.emit("items");
      live.emit("items");
      live.emit("items");
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(500));
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b1"]']);
  });

  it("holds a steady stream to one refetch per minimum interval", () => {
    const { invalidate } = subscribe([{ table: "items", keys: [["board-snapshot", "b1"]] }], { coalesceMs: 100, minIntervalMs: 5_000 });

    act(() => {
      live.emit("items");
      vi.advanceTimersByTime(200);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    // A second event straight after: the read waits out the interval rather
    // than putting the board on the wire again.
    act(() => {
      live.emit("items");
      vi.advanceTimersByTime(200);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    act(() => void vi.advanceTimersByTime(5_000));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("hears a deletion that its filter would have hidden", () => {
    // A deletion arrives as a primary key and nothing else, so `board_id=eq.b1`
    // matches nothing: without the companion listener the row would vanish from
    // the database and stay on screen.
    const { invalidate } = subscribe([{ table: "items", filter: "board_id=eq.b1", keys: [["board-snapshot", "b1"]] }]);

    act(() => {
      live.emit("items", "DELETE");
      vi.advanceTimersByTime(500);
    });
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b1"]']);
  });

  it("adds one deletion listener per table, not per binding", () => {
    subscribe([
      { table: "items", filter: "board_id=eq.b1", keys: [["board-snapshot", "b1"]] },
      { table: "items", filter: "board_id=eq.b2", keys: [["board-snapshot", "b2"]] },
      { table: "comments", keys: [["comments"]] },
    ]);

    const deletes = live.listeners.filter((l) => l.event === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.table).toBe("items");
    // An unfiltered binding already hears its own deletions.
    expect(live.listeners.filter((l) => l.table === "comments")).toHaveLength(1);
  });

  it("reads everything again after the channel comes back", () => {
    const { invalidate } = subscribe([
      { table: "items", keys: [["board-snapshot", "b1"]] },
      { table: "comments", keys: [["comments"]] },
    ]);

    act(() => {
      live.reconnect();
      vi.advanceTimersByTime(500);
    });
    expect(refetched(invalidate).sort()).toEqual(['["board-snapshot","b1"]', '["comments"]']);
  });

  it("subscribes to nothing in local mode, where the BroadcastChannel syncs instead", () => {
    provider = "local";
    const { invalidate } = subscribe([{ table: "items", keys: [["board-snapshot", "b1"]] }]);

    expect(live.listeners).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("closes the channel when the page it belongs to goes away", () => {
    const { unmount } = subscribe([{ table: "items", keys: [["board-snapshot", "b1"]] }]);
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
