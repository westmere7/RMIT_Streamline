import { afterEach, describe, expect, it } from "vitest";
import { beginUnsavedWork, hasUnsavedWork, resetUnsavedWork } from "@/lib/unsaved-work";

/** Fires the event the browser fires when the tab is about to go away. */
function unload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => resetUnsavedWork());

describe("unsaved work guard", () => {
  it("lets the tab close when nothing is in flight", () => {
    expect(hasUnsavedWork()).toBe(false);
    expect(unload()).toBe(false);
  });

  it("asks before leaving while a write is in flight, and stops once it settles", () => {
    const settled = beginUnsavedWork();
    expect(hasUnsavedWork()).toBe(true);
    expect(unload()).toBe(true);

    settled();
    expect(hasUnsavedWork()).toBe(false);
    expect(unload()).toBe(false);
  });

  it("counts concurrent writes, so the last one to finish releases the guard", () => {
    const first = beginUnsavedWork();
    const second = beginUnsavedWork();
    first();
    expect(hasUnsavedWork()).toBe(true);
    second();
    expect(hasUnsavedWork()).toBe(false);
  });

  it("ignores a write reported as settled twice", () => {
    const first = beginUnsavedWork();
    const second = beginUnsavedWork();
    first();
    first();
    expect(hasUnsavedWork(), "the second write is still running").toBe(true);
    second();
    expect(hasUnsavedWork()).toBe(false);
  });
});
