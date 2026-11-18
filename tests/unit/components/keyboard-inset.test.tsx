import { act, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTypingField, KeyboardInset, keyboardInset } from "@/components/shared/keyboard-inset";

/**
 * A phone keyboard opens over the page. Sheets stand on --keyboard-inset, and
 * the field being typed into is centred once the keyboard has opened.
 */
describe("keyboard inset", () => {
  it("measures the keyboard, and ignores browser chrome and pinch-zoom", () => {
    expect(keyboardInset(800, { height: 480, offsetTop: 0, scale: 1 })).toBe(320);
    expect(keyboardInset(800, { height: 380, offsetTop: 100, scale: 1 })).toBe(320);
    expect(keyboardInset(800, { height: 760, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });

  it("counts only fields that bring up a keyboard", () => {
    const make = (html: string) => {
      const box = document.createElement("div");
      box.innerHTML = html;
      return box.firstElementChild;
    };
    expect(isTypingField(make('<input type="text">'))).toBe(true);
    expect(isTypingField(make('<input type="password">'))).toBe(true);
    expect(isTypingField(make("<textarea></textarea>"))).toBe(true);
    expect(isTypingField(make('<input type="checkbox">'))).toBe(false);
    expect(isTypingField(make('<input type="date">'))).toBe(false);
    expect(isTypingField(make("<button></button>"))).toBe(false);
  });

  describe("on a phone", () => {
    const original = { vv: window.visualViewport, mm: window.matchMedia, height: window.innerHeight };
    afterEach(() => {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: original.vv });
      window.matchMedia = original.mm;
      Object.defineProperty(window, "innerHeight", { configurable: true, value: original.height });
      vi.useRealTimers();
    });

    it("publishes the keyboard's height and centres the focused field once it settles", async () => {
      vi.useFakeTimers();
      const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
      window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

      render(
        <>
          <KeyboardInset />
          <input aria-label="Name" />
        </>,
      );
      const field = document.querySelector("input")!;
      const scroll = vi.fn();
      field.scrollIntoView = scroll;

      act(() => field.focus());
      // The keyboard opens: a burst of resizes, then quiet.
      viewport.height = 600;
      act(() => viewport.dispatchEvent(new Event("resize")));
      viewport.height = 480;
      act(() => viewport.dispatchEvent(new Event("resize")));
      expect(scroll).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      expect(document.documentElement.style.getPropertyValue("--keyboard-inset")).toBe("320px");
      expect(document.documentElement.hasAttribute("data-keyboard")).toBe(true);
    });
  });
});
