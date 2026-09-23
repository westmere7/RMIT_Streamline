"use client";

import * as React from "react";
import { ticketCellStyle } from "@/features/boards/board-model";
import { useShowTicket, useTableLayout } from "@/features/boards/components/table/table-layout";
import { copyToClipboard } from "@/features/members/hooks";
import { cn } from "@/lib/utils";

/**
 * The ticket slot at the front of a row.
 *
 * The code is what a stakeholder quotes, so it sits in a fixed slot in the
 * frozen head of the row, in front of the name, and never moves with the
 * columns. Clicking it copies it, because the only thing anyone does with a
 * ticket is paste it somewhere else. Giving a task one, or changing it, happens
 * in the panel where there is room to say what went wrong.
 *
 * A task nobody has ticketed shows a dash rather than an empty gap, so the
 * column still reads as a column.
 */
export function TicketCell({
  code,
  className,
  dragHandle,
}: {
  code: string | null | undefined;
  className?: string;
  dragHandle?: React.ReactNode;
}) {
  const showTicket = useShowTicket();
  const layout = useTableLayout();
  if (!showTicket) return null;
  return (
    <div
      role="gridcell"
      className={cn("relative flex h-full shrink-0 items-center justify-center border-r border-border/40 px-1", className)}
      style={ticketCellStyle(layout)}
      data-testid="item-ticket-cell"
    >
      {dragHandle}
      {code ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void copyToClipboard(code, `${code} copied`);
          }}
          title="Copy this ticket"
          aria-label={`Copy ticket ${code}`}
          className="relative z-[1] rounded-md px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground tabular transition-colors hover:bg-accent hover:text-foreground"
          data-testid="item-ticket"
        >
          {code}
        </button>
      ) : (
        <span aria-hidden className="relative z-[1] text-2xs text-muted-foreground/40">
          &mdash;
        </span>
      )}
    </div>
  );
}

/** The ticket header: a label, and nothing to drag, resize or open. */
export function TicketHeaderCell() {
  const showTicket = useShowTicket();
  const layout = useTableLayout();
  if (!showTicket) return null;
  return (
    <div role="columnheader" className="flex h-full shrink-0 items-center justify-center border-r border-border/40 px-1 text-xs font-medium text-muted-foreground" style={ticketCellStyle(layout)}>
      Ticket
    </div>
  );
}

/** The same width, holding nothing: for rows that have no ticket of their own. */
export function TicketSpacer() {
  const showTicket = useShowTicket();
  const layout = useTableLayout();
  if (!showTicket) return null;
  return <div aria-hidden className="h-full shrink-0" style={ticketCellStyle(layout)} />;
}
