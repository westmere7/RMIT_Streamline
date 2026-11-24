import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdQuery } from "@/lib/query/write-holds";
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
  const system: Array<(payload: unknown) => void> = [];
  let onStatus: ((status: string) => void) | null = null;
  const channel = {
    on(kind: string, config: { event: string; table: string; filter?: string }, run: (payload?: unknown) => void) {
      if (kind === "system") system.push(run);
      else listeners.push({ event: config.event, table: config.table, filter: config.filter, run });
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
    /** The server's word that the database feed behind the channel is up. */
    ready(extension = "postgres_changes") {
      for (const run of system) run({ extension, status: "ok", message: "Subscribed to PostgreSQL" });
    },
  };
}

let provider: "supabase" | "local" = "supabase";
let live = fakeChannel();
const removeChannel = vi.fn();
/** workspace_changed_within: what the database says, per test. */
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => ({ data: false, error: null }));
/** The Supabase channel names asked for, in order. */
const opened: string[] = [];

vi.mock("@/features/data/data-context", () => ({
  useDataContext: () => ({ providerKind: provider }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    channel: (name: string) => {
      opened.push(name);
      return live.channel;
    },
    removeChannel: (...args: unknown[]) => removeChannel(...args),
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
  }),
}));

/**
 * A fresh channel name per test. Channels are shared by name across the whole
 * app, so a name reused between tests would hand the second one the first's
 * subscription — which is the sharing this suite is partly here to check.
 */
let channelNo = 0;

function subscribe(bindings: RealtimeBinding[], options?: Parameters<typeof useRealtime>[2], name = `test-${(channelNo += 1)}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(({ b }: { b: RealtimeBinding[] }) => useRealtime(name, b, options), { wrapper, initialProps: { b: bindings } });
  invalidate.mockClear();
  return { ...view, invalidate, name };
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
    // Closing waits a tick, so a component that unmounts and mounts again on
    // the spot keeps its socket.
    act(() => void vi.advanceTimersByTime(1));
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  /**
   * Supabase hands back the channel it already has when a topic is asked for
   * twice, and a subscribed channel refuses new callbacks — so before this, the
   * second component to ask for the same subscription threw. A board asks from
   * every row.
   */
  it("shares one subscription between everyone who asks for it", () => {
    const bindings: RealtimeBinding[] = [{ table: "item_assets", filter: "board_id=eq.b2", keys: [["item-assets"]] }];
    const first = subscribe(bindings);
    const second = subscribe(bindings, undefined, first.name);
    const third = subscribe(bindings, undefined, first.name);

    // One channel, one set of listeners: the filtered binding and its deletion companion.
    expect(live.listeners).toHaveLength(2);

    act(() => {
      live.emit("item_assets");
      vi.advanceTimersByTime(500);
    });
    expect(refetched(first.invalidate)).toEqual(['["item-assets"]']);

    // And it stays open until the last of them has gone.
    second.unmount();
    third.unmount();
    act(() => void vi.advanceTimersByTime(1));
    expect(removeChannel).not.toHaveBeenCalled();
    first.unmount();
    act(() => void vi.advanceTimersByTime(1));
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  /**
   * Removing a channel is asynchronous, and Supabase keeps handing the old one
   * back until it is gone: reopening the same subscription in that gap threw
   * ("cannot add postgres_changes callbacks after subscribe()"). Each opening
   * asks for a channel name of its own.
   */
  it("reopens under a new channel name while the old one may still be closing", () => {
    const bindings: RealtimeBinding[] = [{ table: "automation_events", keys: [["automation-activity"]] }];
    const first = subscribe(bindings);
    first.unmount();
    act(() => void vi.advanceTimersByTime(1));
    expect(removeChannel).toHaveBeenCalledTimes(1);
    const before = opened.length;
    subscribe(bindings, undefined, first.name);
    expect(opened).toHaveLength(before + 1);
    expect(opened.at(-1)).not.toBe(opened.at(-2));
    expect(opened.at(-1)!.startsWith(`${first.name}#`)).toBe(true);
  });

  it("waits for this browser's own saves before re-reading what they change (v0.161)", () => {
    const { invalidate } = subscribe([{ table: "items", keys: [["board-snapshot", "b1"], ["activity"]] }]);
    const release = holdQuery(["board-snapshot", "b1"]);
    act(() => live.emit("items"));
    act(() => void vi.advanceTimersByTime(500));
    // What is not being saved is read at once; the board waits.
    expect(refetched(invalidate)).toEqual(['["activity"]']);

    invalidate.mockClear();
    act(() => release());
    act(() => void vi.advanceTimersByTime(500));
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b1"]']);
  });

  it("holds back a broad key while a narrower one under it is being saved", () => {
    const { invalidate } = subscribe([{ table: "item_assets", keys: [["item-assets"]] }]);
    const release = holdQuery(["item-assets", "task-1"]);
    act(() => live.emit("item_assets"));
    act(() => void vi.advanceTimersByTime(500));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => release());
    act(() => void vi.advanceTimersByTime(500));
    expect(refetched(invalidate)).toEqual(['["item-assets"]']);
  });

});

/**
 * Catching up when the channel first comes up (v0.161.2): a page reads its
 * data, then joins its channel a moment later, and a change committed in
 * between reached nobody until the next one.
 */
describe("catching up when a channel comes up", () => {
  /** A subscription whose page has already read `key` (or not). */
  function opened(bindings: RealtimeBinding[], options: Parameters<typeof useRealtime>[2], read: Array<readonly unknown[]>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const key of read) client.setQueryData(key, { read: true });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useRealtime(`catch-up-${(channelNo += 1)}`, bindings, options), { wrapper });
    return invalidate;
  }

  beforeEach(() => rpc.mockClear());

  /** The feed comes up, the database answers (a promise), then the coalescing timer. */
  const settle = async () => {
    act(() => live.ready());
    await act(async () => undefined);
    await act(async () => void vi.advanceTimersByTime(500));
  };

  it("reads light data again once, without asking the database", async () => {
    const invalidate = opened([{ table: "docs", keys: [["doc", "d1"]] }], undefined, [["doc", "d1"]]);
    await settle();
    expect(refetched(invalidate)).toEqual(['["doc","d1"]']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves alone what the page has not read yet", async () => {
    const invalidate = opened([{ table: "docs", keys: [["doc", "d1"]] }], undefined, []);
    await settle();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("asks whether the workspace changed, and reads the board again only if it did", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const changed = opened([{ table: "items", keys: [["board-snapshot", "b1"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b1"]]);
    await settle();
    expect(rpc).toHaveBeenCalledWith("workspace_changed_within", expect.objectContaining({ p_workspace_id: "ws1" }));
    expect((rpc.mock.calls[0]![1] as { p_seconds: number }).p_seconds).toBeGreaterThan(0);
    expect(refetched(changed)).toEqual(['["board-snapshot","b1"]']);

    rpc.mockResolvedValueOnce({ data: false, error: null });
    const quiet = opened([{ table: "items", keys: [["board-snapshot", "b2"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b2"]]);
    await settle();
    expect(quiet).not.toHaveBeenCalled();
  });

  it("reads again when the question cannot be answered: a missed change costs more than one read", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    const invalidate = opened([{ table: "items", keys: [["board-snapshot", "b3"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b3"]]);
    await settle();
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b3"]']);
  });

  it("mixes the three: probed, read again, and left alone, per binding", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const invalidate = opened(
      [
        { table: "items", keys: [["board-snapshot", "b4"]] },
        { table: "notifications", keys: [["notifications", "u1"]], catchUp: "refetch" },
        { table: "workspace_members", keys: [["workspace-members"]], catchUp: "none" },
      ],
      { catchUp: { workspaceId: "ws1" } },
      [["board-snapshot", "b4"], ["notifications", "u1"], ["workspace-members"]],
    );
    await settle();
    expect(refetched(invalidate)).toEqual(['["notifications","u1"]']);
  });

  it("catches up only the first time: a later reconnect re-reads everything, as before", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const invalidate = opened([{ table: "items", keys: [["board-snapshot", "b5"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b5"]]);
    await settle();
    expect(invalidate).not.toHaveBeenCalled();
    act(() => live.reconnect());
    await settle();
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b5"]']);
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockReset();
    rpc.mockImplementation(async () => ({ data: false, error: null }));
  });

  it("waits for the database feed, not the channel joining: a change in between is still caught", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const invalidate = opened([{ table: "items", keys: [["board-snapshot", "b6"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b6"]]);
    // Joined, feed not up yet: nothing asked.
    await act(async () => void vi.advanceTimersByTime(1_000));
    expect(rpc).not.toHaveBeenCalled();
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(refetched(invalidate)).toEqual(['["board-snapshot","b6"]']);
    // Only the first word counts.
    act(() => live.ready());
    await act(async () => void vi.advanceTimersByTime(5_000));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("goes ahead after a few seconds when the feed never says, and again if it says later", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    opened([{ table: "items", keys: [["board-snapshot", "b7"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b7"]]);
    await act(async () => void vi.advanceTimersByTime(2_900));
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(200));
    expect(rpc).toHaveBeenCalledTimes(1);
    await settle();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("ignores other system messages", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    opened([{ table: "items", keys: [["board-snapshot", "b8"]] }], { catchUp: { workspaceId: "ws1" } }, [["board-snapshot", "b8"]]);
    act(() => live.ready("system"));
    await act(async () => void vi.advanceTimersByTime(1_000));
    expect(rpc).not.toHaveBeenCalled();
  });
});
