"use client";

import { MessageSquare } from "lucide-react";
import * as React from "react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { ItemUpdatesSummary } from "@/features/comments/updates";
import { cn } from "@/lib/utils";

/**
 * What this person has not read yet: a speech bubble and how many, in the muted
 * text colour. A row with nothing new shows nothing at all.
 *
 * It used to count every update on the item and turn the workspace's red when
 * some were new, which put a permanent badge on every task that had ever been
 * discussed and a red one on a good many — a board of rows shouting at once
 * says no more than a board of quiet ones. The count is per person: the same
 * task can be caught up for one member and three behind for another.
 */
export function UpdatesBadge({ summary, onClick, size = "sm", className }: { summary: ItemUpdatesSummary | undefined; onClick?: () => void; size?: "xs" | "sm"; className?: string }) {
  if (!summary || summary.unread === 0) return null;
  const label = `${summary.unread} new ${summary.unread === 1 ? "update" : "updates"}`;
  const content = (
    <>
      <MessageSquare className={size === "xs" ? "size-3" : "size-3.5"} aria-hidden />
      <span className="tabular">{summary.unread}</span>
    </>
  );
  const classes = cn(
    "flex shrink-0 items-center gap-0.5 rounded-full px-1 text-2xs leading-none text-muted-foreground transition-colors",
    onClick && "hover:bg-accent hover:text-foreground",
    className,
  );
  return (
    <SimpleTooltip label={label}>
      {onClick ? (
        <button type="button" aria-label={label} onClick={onClick} onPointerDown={(e) => e.stopPropagation()} className={classes} data-testid="updates-badge" data-unread={summary.unread}>
          {content}
        </button>
      ) : (
        <span aria-label={label} className={classes} data-testid="updates-badge" data-unread={summary.unread}>
          {content}
        </span>
      )}
    </SimpleTooltip>
  );
}
