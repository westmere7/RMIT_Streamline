"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import type { BoardGroup, Item } from "@/domain";
import { TABLE_LAYOUT } from "@/features/boards/board-model";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ItemRow } from "./item-row";

/**
 * The board's scroller, handed down so each group can window its rows against
 * it. One scrollport holds every group, so the groups cannot each own one.
 */
const TableScrollContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);

export function TableScrollProvider({ scrollRef, children }: { scrollRef: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  return <TableScrollContext value={scrollRef}>{children}</TableScrollContext>;
}

/**
 * Below this many rows a group renders in full.
 *
 * Twenty-five rows of forty pixels is about a screen, which is the honest line:
 * a group that fits is cheaper rendered whole than measured and windowed, and a
 * group that does not fit is paying for rows nobody can see. Past it the saving
 * is the whole point — a group of four hundred renders the dozen in view.
 */
export const VIRTUALISE_ABOVE = 25;

/** The line that shows where a dragged row would land. */
function DropLine({ color }: { color: BoardGroup["color"] }) {
  return (
    <div className="relative z-[8] h-0" data-testid="drop-slot" aria-hidden>
      <div className={cn("absolute inset-x-0 -top-[2px] h-[3px] rounded-full", colorClasses(color).dot)} />
    </div>
  );
}

export interface GroupRowsProps {
  group: BoardGroup;
  items: Item[];
  dndEnabled: boolean;
  widthOverrides: Record<string, number>;
  /** Where a dragged row would land, or null. */
  dropIndex: number | null;
  /** True for the length of a drag anywhere on the board. */
  dragging: boolean;
}

/**
 * A group's rows, and only the ones worth rendering.
 *
 * Rows are a fixed height until one is expanded and grows subitems, so the
 * window is estimated from that height and corrected by measuring what is on
 * screen. They stay in normal flow with padding above and below rather than
 * being positioned absolutely: the first column is sticky, and taking rows out
 * of flow unpins it.
 *
 * Windowing stops for the length of a drag — dnd-kit can only drop onto a row
 * that exists — and for a group short enough to fit on screen anyway.
 *
 * "use no memo" keeps React Compiler off this component. The virtualiser
 * re-renders through its own store, which the compiler cannot see, so a compiled
 * version hands back the first window it built and the list never moves. Keeping
 * the component small is the point: the group around it keeps its memoisation.
 */
export function GroupRows({ group, items, dndEnabled, widthOverrides, dropIndex, dragging }: GroupRowsProps) {
  "use no memo";

  const scrollRef = React.useContext(TableScrollContext);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);
  const on = !dragging && items.length > VIRTUALISE_ABOVE && !!scrollRef;

  // Where this group's rows start inside the shared scroller: the virtualiser
  // reasons in the scroller's coordinates, not the group's. Groups above this
  // one collapse and expand, which moves it, so it is watched rather than read
  // once.
  React.useEffect(() => {
    if (!on) return;
    const scroller = scrollRef?.current;
    if (!scroller) return;
    const measure = () => {
      const list = listRef.current;
      if (!list) return;
      setScrollMargin(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [on, scrollRef, items.length]);

  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: on,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => TABLE_LAYOUT.rowHeight,
    overscan: 10,
    scrollMargin,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  // Positions come back in the scroller's coordinates, so the group's own offset
  // comes off both ends before they become padding inside it. Forgetting it on
  // the bottom leaves the group as short as its rendered slice and the rest of
  // the rows out of reach.
  const total = virtualizer.getTotalSize();
  const first = virtualRows[0];
  const last = virtualRows[virtualRows.length - 1];
  const padTop = on && first ? Math.max(0, first.start - scrollMargin) : 0;
  const padBottom = on && last ? Math.max(0, total - (last.end - scrollMargin)) : 0;
  const indexes = on ? virtualRows.map((row) => row.index) : items.map((_, index) => index);

  return (
    <div ref={listRef} data-windowed={on ? String(items.length) : undefined}>
      {padTop > 0 && <div aria-hidden style={{ height: padTop }} />}
      {indexes.map((index) => {
        const item = items[index];
        if (!item) return null;
        return (
          <React.Fragment key={item.id}>
            {dropIndex === index && <DropLine color={group.color} />}
            <div ref={on ? virtualizer.measureElement : undefined} data-index={index}>
              <ItemRow item={item} group={group} dndEnabled={dndEnabled} widthOverrides={widthOverrides} />
            </div>
          </React.Fragment>
        );
      })}
      {padBottom > 0 && <div aria-hidden style={{ height: padBottom }} />}
      {/* Landing at the end, and the only line an empty group can show. */}
      {dropIndex !== null && dropIndex >= items.length && <DropLine color={group.color} />}
    </div>
  );
}
