"use client";

import * as React from "react";

/** Below this the gap is browser chrome moving, not a keyboard. */
const KEYBOARD_MIN_PX = 80;
/** How long the keyboard is given to finish opening before the field is centred anyway. */
const SETTLE_MS = 450;
/** The resize events of one keyboard opening arrive in a burst; centre once it stops. */
const QUIET_MS = 120;

/** Fields that bring up a keyboard. Pickers and switches do not. */
export function isTypingField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "hidden", "image", "date", "time", "datetime-local", "month", "week"].includes(el.type);
}

/** The height the on-screen keyboard covers at the bottom of the layout viewport, or 0. */
export function keyboardInset(innerHeight: number, viewport: { height: number; offsetTop: number; scale: number }): number {
  // A pinch-zoom shrinks the visual viewport too, and is not a keyboard.
  if (viewport.scale > 1.01) return 0;
  const inset = Math.round(innerHeight - viewport.height - viewport.offsetTop);
  return inset >= KEYBOARD_MIN_PX ? inset : 0;
}

/**
 * Keeps what is being typed into in sight on a phone.
 *
 * Phone browsers now open the keyboard over the page rather than shrinking it,
 * so a sheet fixed to the bottom edge stayed where it was with its field under
 * the keys. This publishes the keyboard's height as --keyboard-inset (sheets
 * and dialogs stand on it) and, once the keyboard has opened, centres the
 * focused field in what is left of the screen.
 */
export function KeyboardInset() {
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;

    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = keyboardInset(window.innerHeight, viewport);
        root.style.setProperty("--keyboard-inset", `${inset}px`);
        if (inset > 0) root.setAttribute("data-keyboard", "");
        else root.removeAttribute("data-keyboard");
      });
    };

    let pending: { cancel: () => void } | null = null;
    const centreWhenSettled = (field: HTMLElement) => {
      pending?.cancel();
      let quiet = 0;
      const centre = () => {
        cancel();
        if (document.activeElement === field) field.scrollIntoView({ block: "center", behavior: "smooth" });
      };
      const onResize = () => {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(centre, QUIET_MS);
      };
      const fallback = window.setTimeout(centre, SETTLE_MS);
      const cancel = () => {
        window.clearTimeout(quiet);
        window.clearTimeout(fallback);
        viewport.removeEventListener("resize", onResize);
        pending = null;
      };
      viewport.addEventListener("resize", onResize);
      pending = { cancel };
    };

    const onFocusIn = (event: FocusEvent) => {
      const field = event.target as Element | null;
      if (!isTypingField(field)) return;
      // Phones only: a desktop has no keyboard to clear, and jumping the page
      // on every click into a field would be its own annoyance.
      if (!window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches) return;
      centreWhenSettled(field);
    };

    publish();
    viewport.addEventListener("resize", publish);
    viewport.addEventListener("scroll", publish);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      pending?.cancel();
      viewport.removeEventListener("resize", publish);
      viewport.removeEventListener("scroll", publish);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--keyboard-inset");
      root.removeAttribute("data-keyboard");
    };
  }, []);
  return null;
}
