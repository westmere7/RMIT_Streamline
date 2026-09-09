"use client";

import { CornerDownRight, Link2, MessageSquare } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { LabelPill } from "@/components/shared/label-pill";
import { PriorityPill } from "@/components/shared/priority-signal";
import { isStuckLabel } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import type { MyWorkItem } from "@/services/my-work-service";

/**
 * One task, as a phone shows it.
 *
 * The desktop row hides status and priority below md and leaves a title and a
 * date — which is the least useful half. Here everything that decides what to do
 * next is on the card: what it is, which board it came from, where it stands,
 * how urgent it is, and when it is due, with overdue said in words as well as
 * colour.
 */
export function MobileTaskRow({ entry, now, showBoard = true }: { entry: MyWorkItem; now: Date; showBoard?: boolean }) {
  const ws = useWorkspace();
  const late = !entry.isDone && isOverdue(entry.dueDate, now);
  return (
    <li>
      <Link
        href={ws.boardPath(entry.board, { itemId: entry.item.id })}
        className="flex min-h-16 flex-col justify-center gap-1.5 px-3 py-2.5 active:bg-accent/70"
        data-testid="mobile-task-row"
      >
        <span className="flex items-start gap-2">
          {entry.item.parentItemId && <CornerDownRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />}
          <span className={cn("min-w-0 flex-1 text-[15px] leading-snug font-medium", entry.isDone && "text-muted-foreground line-through decoration-muted-foreground/50")}>
            {entry.item.name}
          </span>
          {entry.dueDate && (
            <span className={cn("shrink-0 text-[13px] tabular", late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              {formatShortDate(entry.dueDate, now)}
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {entry.status && <LabelPill label={entry.status} size="sm" striped={isStuckLabel(entry.statusColumn, entry.status.id)} />}
          {entry.priority && <PriorityPill label={entry.priority} />}
          {late && (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-2xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" data-testid="mobile-overdue">
              Overdue
            </span>
          )}
        </span>

        {showBoard && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <DynamicIcon name={entry.board.icon} className={cn("size-3.5 shrink-0", colorClasses(entry.board.color).text)} />
            <span className="truncate">
              {entry.board.name}
              {entry.group ? ` · ${entry.group.name}` : ""}
            </span>
            {entry.linkedBoards.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5" aria-label={`Also on ${entry.linkedBoards.map((b) => b.name).join(", ")}`}>
                <Link2 className="size-3" />+{entry.linkedBoards.length}
              </span>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}

/** The card list they sit in, so every screen frames them the same way. */
export function MobileTaskList({ children, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card" {...props}>
      {children}
    </ul>
  );
}

export { MessageSquare };
