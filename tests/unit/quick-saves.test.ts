import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { lastSave, quickSave, savesPending } from "@/lib/query/quick-saves";
import { isQueryHeld } from "@/lib/query/write-holds";
import { guardMutations, resetUnsavedWork } from "@/lib/unsaved-work";

/**
 * Optimistic saves clicked in quick succession (v0.161.1): on one list they
 * run one after another, the list is held while any is on its way, and only
 * the last reads back or rolls back. These pin TanStack behaviour the pattern
 * leans on, so an upgrade that changes it fails here first.
 */
afterEach(() => resetUnsavedWork());

const KEY = ["comments", "task-1"] as const;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("quick saves on one list", () => {
  it("run one after another, each counting itself while it finishes, and only the last reads back", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    guardMutations(client.getMutationCache());
    const started: string[] = [];
    const gates = { a: deferred(), b: deferred(), c: deferred() };
    const readBack: string[] = [];
    const save = (name: keyof typeof gates) =>
      new MutationObserver(client, {
        ...quickSave(KEY),
        mutationFn: async () => {
          started.push(name);
          await gates[name].promise;
        },
        onSettled: () => {
          if (lastSave(client, KEY)) readBack.push(name);
        },
      }).mutate();

    const all = Promise.all([save("a"), save("b"), save("c")]);
    await tick();
    // Only the first is on the wire; the others wait their turn.
    expect(started).toEqual(["a"]);
    expect(savesPending(client, KEY)).toBe(true);
    expect(isQueryHeld(KEY)).toBe(true);
    expect(isQueryHeld(["comments"])).toBe(true);

    gates.a.resolve();
    await tick();
    expect(started).toEqual(["a", "b"]);
    gates.b.resolve();
    await tick();
    gates.c.resolve();
    await all;

    expect(started).toEqual(["a", "b", "c"]);
    // a and b finished with saves behind them, so only c read back.
    expect(readBack).toEqual(["c"]);
    await tick();
    expect(savesPending(client, KEY)).toBe(false);
    expect(isQueryHeld(KEY)).toBe(false);
  });

  it("a failure with saves behind it leaves the screen to the last one's read back", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const gates = { a: deferred(), b: deferred() };
    const rolledBack: string[] = [];
    const save = (name: keyof typeof gates) =>
      new MutationObserver(client, {
        ...quickSave(KEY),
        mutationFn: () => gates[name].promise,
        onError: () => {
          if (lastSave(client, KEY)) rolledBack.push(name);
        },
      })
        .mutate()
        .catch(() => undefined);

    const all = Promise.all([save("a"), save("b")]);
    await tick();
    gates.a.reject(new Error("offline"));
    await tick();
    gates.b.reject(new Error("offline"));
    await all;
    // a failed with b still waiting: no rollback from a (it would undo b on screen); b, the last, rolls back.
    expect(rolledBack).toEqual(["b"]);
  });

  it("keeps different lists apart: saves on another list neither wait nor count", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const started: string[] = [];
    const gate = deferred();
    const one = new MutationObserver(client, {
      ...quickSave(["comments", "task-1"]),
      mutationFn: async () => {
        started.push("task-1");
        await gate.promise;
      },
    }).mutate();
    const two = new MutationObserver(client, {
      ...quickSave(["comments", "task-2"]),
      mutationFn: async () => {
        started.push("task-2");
      },
    }).mutate();
    await tick();
    expect(started).toEqual(["task-1", "task-2"]);
    expect(lastSave(client, ["comments", "task-2"])).toBe(true);
    gate.resolve();
    await Promise.all([one, two]);
  });
});
