"use client";

import * as React from "react";
import { referenceCellStyle } from "@/features/boards/board-model";
import { useBoardContext } from "@/features/boards/board-context";
import { copyToClipboard } from "@/features/members/hooks";
import { cn } from "@/lib/utils";

/**
 * The ID# slot at the front of a row.
 *
 * The code comes from the booking that created the task, so it is never typed,
 * never edited and never moved: it sits in a fixed slot in the frozen head of
 * the row, in front of the name. Clicking it copies it, because the only thing
 * anyone does with a booking code is paste it somewhere else.
 *
 * A task nobody booked has no code, and shows a dash rather than an empty gap,
 * so the column still reads as a column.
 */
export function ReferenceCell({ code, className }: { code: string | null | undefined; className?: string }) {
  const { showReference } = useBoardContext();
  if (!showReference) return null;
  return (
    <div
      role="gridcell"
      className={cn("flex h-full shrink-0 items-center justify-center border-r border-border/40 px-1", className)}
      style={referenceCellStyle()}
      data-testid="item-reference-cell"
    >
      {code ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void copyToClipboard(code, `${code} copied`);
          }}
          title="Copy this ID"
          aria-label={`Copy ID ${code}`}
          className="rounded-md px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-muted-foreground tabular transition-colors hover:bg-accent hover:text-foreground"
          data-testid="item-reference"
        >
          {code}
        </button>
      ) : (
        <span aria-hidden className="text-2xs text-muted-foreground/40">
          &mdash;
        </span>
      )}
    </div>
  );
}

/** The ID# header: a label, and nothing to drag, resize or open. */
export function ReferenceHeaderCell() {
  const { showReference } = useBoardContext();
  if (!showReference) return null;
  return (
    <div role="columnheader" className="flex h-full shrink-0 items-center justify-center border-r border-border/40 px-1 text-xs font-medium text-muted-foreground" style={referenceCellStyle()}>
      ID#
    </div>
  );
}

/** The same width, holding nothing: for rows that have no code of their own. */
export function ReferenceSpacer() {
  const { showReference } = useBoardContext();
  if (!showReference) return null;
  return <div aria-hidden className="h-full shrink-0" style={referenceCellStyle()} />;
}
