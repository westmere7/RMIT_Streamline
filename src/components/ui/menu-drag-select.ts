"use client";

import * as React from "react";

const ITEM = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';

/**
 * Press on one menu item, release on another.
 *
 * A menu item is chosen by the click event, which the browser only raises when
 * the press and the release land on the same element. A hand that drifts a
 * couple of pixels between the two crosses into the next item and the choice is
 * lost: nothing happens and the menu stays open, which reads as the menu
 * ignoring the click. Radix has a path for this but it only covers a press that
 * began outside the items, so it does not help here.
 *
 * Spread over a menu's content: whatever item the release lands on is the one
 * chosen, which is how a menu has always behaved.
 */
export function useMenuDragSelect() {
  const from = React.useRef<HTMLElement | null>(null);
  return React.useMemo(
    () => ({
      onPointerDown: (event: React.PointerEvent) => {
        from.current = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
      },
      onPointerUp: (event: React.PointerEvent) => {
        const started = from.current;
        from.current = null;
        if (!started || event.button !== 0) return;
        const landed = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
        if (!landed || landed === started) return;
        if (landed.hasAttribute("data-disabled") || landed.getAttribute("aria-disabled") === "true") return;
        landed.click();
      },
    }),
    [],
  );
}
