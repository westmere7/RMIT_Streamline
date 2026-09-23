"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore, type ItemPanelSize } from "@/stores/ui-store";

/**
 * The task panel's three widths.
 *
 * Three rather than any width at all, because each is a layout of its own
 * rather than the same one stretched: the compact panel is a summary, the
 * default one is the panel as it always was, and the wide one is the pop-up's
 * two panes — the overview and the updates side by side, 440px each. A width
 * in between would be neither.
 */
export const PANEL_WIDTHS: Record<ItemPanelSize, number> = { compact: 300, default: 520, wide: 880 };
const ORDER: ItemPanelSize[] = ["compact", "default", "wide"];

/** How far past either end a drag is let run, so the edge still follows the hand at the stops. */
const OVERDRAG = 60;
/** Far enough to mean "drag", not a hand wobbling on the way to a double click. */
const DRAG_SLOP = 4;

export function nearestPanelSize(width: number): ItemPanelSize {
  return ORDER.reduce((best, size) => (Math.abs(PANEL_WIDTHS[size] - width) < Math.abs(PANEL_WIDTHS[best] - width) ? size : best), "default");
}

const PanelSizeContext = React.createContext<ItemPanelSize>("default");

/**
 * Which of the three layouts the panel's contents take. Anything outside a
 * resizable panel — the pop-up, a shared page, a phone — reads "default".
 */
export function usePanelSize(): ItemPanelSize {
  return React.useContext(PanelSizeContext);
}

export const PanelSizeProvider = PanelSizeContext.Provider;

/**
 * The panel's width, and the edge that changes it.
 *
 * While the edge is held the panel follows the pointer, and its contents take
 * whichever layout the width is nearest, so the reader sees what they will get
 * before letting go. On release it settles on that one.
 */
export function useResizablePanel(enabled: boolean) {
  const stored = useUiStore((s) => s.itemPanelSize);
  const setStored = useUiStore((s) => s.setItemPanelSize);
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);

  const width = dragWidth ?? PANEL_WIDTHS[stored];
  const size = enabled ? (dragWidth === null ? stored : nearestPanelSize(dragWidth)) : "default";

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = PANEL_WIDTHS[useUiStore.getState().itemPanelSize];
    let dragged = false;
    let last = startWidth;
    const onMove = (e: PointerEvent) => {
      if (!dragged && Math.abs(e.clientX - startX) < DRAG_SLOP) return;
      dragged = true;
      // The panel sits on the right, so the edge moving left makes it wider.
      last = Math.min(PANEL_WIDTHS.wide + OVERDRAG, Math.max(PANEL_WIDTHS.compact - OVERDRAG, startWidth + (startX - e.clientX)));
      setDragWidth(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      if (dragged) setStored(nearestPanelSize(last));
      setDragWidth(null);
    };
    // Held on the body too, so the cursor and the text selection do not flicker
    // while the pointer is over the board rather than the edge.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const step = (by: number) => {
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(stored) + by))];
    if (next) setStored(next);
  };

  const handle = enabled ? (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Panel width"
      aria-valuetext={size}
      aria-valuenow={ORDER.indexOf(size)}
      aria-valuemin={0}
      aria-valuemax={ORDER.length - 1}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setStored("default")}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") step(1);
        else if (e.key === "ArrowRight") step(-1);
        else return;
        e.preventDefault();
      }}
      className="group/edge absolute inset-y-0 left-0 z-30 flex w-2.5 cursor-col-resize justify-start focus-visible:outline-none"
      data-testid="panel-resize"
    >
      {/* Wide enough to hit; only a hairline of it shows, and only when asked. */}
      <span
        aria-hidden
        className={cn(
          "my-6 w-[3px] rounded-full transition-colors group-hover/edge:bg-ring/50 group-focus-visible/edge:bg-ring group-active/edge:bg-ring",
          dragWidth !== null && "bg-ring",
        )}
      />
    </div>
  ) : null;

  return { width, size, dragging: dragWidth !== null, handle };
}
