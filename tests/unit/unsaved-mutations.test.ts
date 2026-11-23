import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { beginUnsavedWork, guardMutations, hasUnsavedWork, onLeaving, pauseUnlessLeaving, resetUnsavedWork } from "@/lib/unsaved-work";

/**
 * Closing the tab while a save is on its way asks first (v0.161): every
 * mutation holds the guard while it runs, however it ends.
 */
afterEach(() => resetUnsavedWork());

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("the leave-page guard over every save", () => {
  it("is on while a mutation runs, and off once it has saved or failed", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    guardMutations(client.getMutationCache());

    const ok = deferred();
    const save = new MutationObserver(client, { mutationFn: () => ok.promise });
    const running = save.mutate();
    expect(hasUnsavedWork()).toBe(true);
    ok.resolve();
    await running;
    expect(hasUnsavedWork()).toBe(false);

    const bad = deferred();
    const failing = new MutationObserver(client, { mutationFn: () => bad.promise });
    const attempt = failing.mutate().catch(() => undefined);
    expect(hasUnsavedWork()).toBe(true);
    bad.reject(new Error("offline"));
    await attempt;
    expect(hasUnsavedWork()).toBe(false);
  });

  it("asks before the page unloads while something is saving", () => {
    const client = new QueryClient();
    guardMutations(client.getMutationCache());
    void new MutationObserver(client, { mutationFn: () => new Promise(() => undefined) }).mutate();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("saves waiting out a pause when the page goes", () => {
  it("are sent at once when the page unloads or is hidden, and not before", async () => {
    const settled = beginUnsavedWork();
    let done = false;
    void pauseUnlessLeaving(60_000).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();
    expect(done).toBe(true);

    let flushed = 0;
    const off = onLeaving(() => (flushed += 1));
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(flushed).toBe(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flushed).toBe(2);
    off();
    settled();
  });
});
