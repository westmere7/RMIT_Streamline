"use client";

import { CornerDownRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { PrioritySignal } from "@/components/shared/priority-signal";
import { isStuckLabel, priorityStrength } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import type { MyWorkItem } from "@/services/my-work-service";

/**
 * One task, as a phone lists it: the name first, and one quiet line under it.
 *
 * The line says where the task stands, when it is due and which board it is
 * on — in that order, because that is the order a list is read in. Nothing is
 * said twice: a late date is red, which is what the old "Overdue" badge said
 * again under a section already called Overdue. Priority appears only when it
 * asks for attention (high or critical). Everything else is a tap away.
 */
export function MobileTaskRow({ entry, now, showBoard = true }: { entry: MyWorkItem; now: Date; showBoard?: boolean }) {
  const ws = useWorkspace();
  const late = !entry.isDone && isOverdue(entry.dueDate, now);
  const urgency = !entry.isDone && entry.priority ? priorityStrength(entry.priority.id) : 0;
  const stuck = !!entry.status && isStuckLabel(entry.statusColumn, entry.status.id);
  return (
    <li>
      <Link href={ws.boardPath(entry.board, { itemId: entry.item.id })} className="flex min-h-16 flex-col justify-center gap-1.5 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xs active:bg-accent/70 dark:bg-surface" data-testid="mobile-task-row">
        <span className="flex items-start gap-2">
          {entry.item.parentItemId && <CornerDownRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground/60" />}
          <span className={cn("line-clamp-2 min-w-0 flex-1 text-[16px] leading-snug font-medium", entry.isDone && "text-muted-foreground")}>{entry.item.name}</span>
          {urgency >= 2 && entry.priority && (
            <span className="mt-1 shrink-0" title={`${entry.priority.name} priority`}>
              <PrioritySignal level={urgency} className={cn("size-4", colorClasses(entry.priority.color).text)} />
              <span className="sr-only">{entry.priority.name} priority</span>
            </span>
          )}
        </span>

        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          {entry.status && (
            <LabelPill label={entry.status} striped={stuck} className="shrink-0" data-testid="mobile-task-status" />
          )}
          {entry.dueDate && (
            <>
              {entry.status && <Dot />}
              <span className={cn("shrink-0 tabular", late && "font-semibold text-red-600 dark:text-red-400")} data-testid="mobile-task-due">
                {late && <span className="sr-only">Overdue, </span>}
                {formatShortDate(entry.dueDate, now)}
              </span>
            </>
          )}
          {showBoard && (
            <>
              {(entry.status || entry.dueDate) && <Dot />}
              <span className="min-w-0 truncate">{entry.board.name}</span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/40">
      ·
    </span>
  );
}

/** The list they sit in: each task its own card, spaced apart, so one is never read as part of the next. */
export function MobileTaskList({ children, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul className="flex flex-col gap-2" {...props}>
      {children}
    </ul>
  );
}
