"use client";

import * as React from "react";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, TABLE_LAYOUT_COMPACT, type TableLayout } from "@/features/boards/board-model";
import { useUiStore } from "@/stores/ui-store";

/**
 * Which set of measurements the table is drawn with.
 *
 * The desktop table has one fixed set: a 320px name column, 40px rows, a
 * ticket slot. On a 375px phone that frozen head is wider than the screen, so
 * the grid showed the name and nothing else, and every value was a swipe away
 * under a column that never moved. The phone's grid asks for the compact set
 * instead — a narrower name, no ticket slot, taller rows a thumb can land on —
 * and every row, header and spacer reads its widths from here rather than from
 * the constant, so the two stay in step.
 */
const TableLayoutContext = React.createContext<TableLayout | null>(null);

export function TableLayoutProvider({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return <TableLayoutContext.Provider value={compact ? TABLE_LAYOUT_COMPACT : TABLE_LAYOUT}>{children}</TableLayoutContext.Provider>;
}

/** The narrowest and widest the Item column can be dragged to. It only ever grows from the default. */
export const ITEM_COLUMN_MIN = TABLE_LAYOUT.nameWidth;
export const ITEM_COLUMN_MAX = 800;

/**
 * The desktop table's measurements, with the Item column as wide as this board
 * was dragged to. The phone's compact set is not resizable.
 */
export function useTableLayout(): TableLayout {
  const provided = React.useContext(TableLayoutContext);
  const { board } = useBoardContext();
  const nameWidth = useUiStore((s) => s.itemColumnWidths[board.id]);
  return React.useMemo(() => provided ?? (nameWidth && nameWidth > TABLE_LAYOUT.nameWidth ? { ...TABLE_LAYOUT, nameWidth } : TABLE_LAYOUT), [provided, nameWidth]);
}

/** Whether the Item column can be dragged wider here: not on the phone's grid. */
export function useItemColumnResizable(): boolean {
  return React.useContext(TableLayoutContext) === null;
}

/** Whether the ticket slot is drawn: the board's own setting, unless the layout has no room for one. */
export function useShowTicket(): boolean {
  const { showTicket } = useBoardContext();
  const layout = useTableLayout();
  return showTicket && layout.ticketWidth > 0;
}
