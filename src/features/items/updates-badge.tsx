"use client";

import { MessageSquare } from "lucide-react";
import * as React from "react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { ItemUpdatesSummary } from "@/features/comments/updates";
import { cn } from "@/lib/utils";

/**
 * A quiet count of an item's updates: a speech bubble and a number in the
 * muted text colour. When some of them are new to this person the badge takes
 * the accent colour and a dot, and stays that way until they catch up here or
 * in the Inbox. Nothing is shown for items with no updates.
 */
export function UpdatesBadge({ summary, onClick, size = "sm", className }: { summary: ItemUpdatesSummary | undefined; onClick?: () => void; size?: "xs" | "sm"; className?: string }) {
  if (!summary || summary.count === 0) return null;
  const fresh = summary.unread > 0;
  const label = fresh ? `${summary.count} ${summary.count === 1 ? "update" : "updates"}, ${summary.unread} new` : `${summary.count} ${summary.count === 1 ? "update" : "updates"}`;
  const content = (
    <>
      <MessageSquare className={cn(size === "xs" ? "size-3" : "size-3.5", fresh && "fill-current/10")} aria-hidden />
      <span className="tabular">{summary.count}</span>
    </>
  );
  const classes = cn(
    "flex shrink-0 items-center gap-0.5 rounded-full px-1 text-2xs leading-none transition-colors",
    fresh ? "font-semibold text-primary" : "text-muted-foreground",
    onClick && (fresh ? "hover:bg-primary/10" : "hover:bg-accent hover:text-foreground"),
    className,
  );
  return (
    <SimpleTooltip label={label}>
      {onClick ? (
        <button type="button" aria-label={label} onClick={onClick} onPointerDown={(e) => e.stopPropagation()} className={classes} data-testid="updates-badge" data-unread={fresh ? summary.unread : 0}>
          {content}
        </button>
      ) : (
        <span aria-label={label} className={classes} data-testid="updates-badge" data-unread={fresh ? summary.unread : 0}>
          {content}
        </span>
      )}
    </SimpleTooltip>
  );
}
