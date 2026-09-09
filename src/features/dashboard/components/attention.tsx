"use client";

import { CalendarClock } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { User } from "@/domain";
import type { TaskFact } from "@/features/dashboard/analytics";
import { ATTENTION_REASONS, type AttentionRow } from "@/features/dashboard/metrics";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * The work that needs a decision this morning.
 *
 * The reason is the point of the row, so it leads and it is a word, not a
 * colour: "Overdue", "Blocked", "Nobody assigned". Colour repeats the reason
 * for the one case that is genuinely bad news, and no row depends on colour to
 * be understood.
 *
 * Ordered, never scored. `attention()` sorts by reason then deadline then name,
 * which anybody can check against the list; an opaque risk number would be a
 * judgement this data cannot support.
 */
export function AttentionList({
  rows,
  users,
  onOpen,
  limit = 12,
  emptyMessage = "Nothing is overdue, blocked or waiting for an owner.",
}: {
  rows: AttentionRow[];
  users: Map<string, User>;
  onOpen?: (task: TaskFact) => void;
  limit?: number;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? rows : rows.slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground" data-testid="dashboard-attention-empty">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div data-testid="dashboard-attention">
      <ul className="divide-y divide-border/50">
        {shown.map(({ task, reason, daysLate }) => {
          const meta = ATTENTION_REASONS[reason];
          const owners = task.owners.map((id) => users.get(id)).filter((u): u is User => !!u);
          const Row = onOpen ? "button" : "div";
          return (
            <li key={task.id}>
              <Row
                {...(onOpen ? { type: "button" as const, onClick: () => onOpen(task) } : {})}
                className={cn("flex w-full items-start gap-3 py-2.5 text-left", onOpen && "hover:bg-surface/60")}
              >
                <span
                  title={meta.explain}
                  className={cn(
                    "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium",
                    reason === "overdue" ? "bg-destructive/12 text-destructive" : "bg-surface-strong/70 text-muted-foreground",
                  )}
                >
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{task.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                    {task.reference && <span className="tabular">{task.reference}</span>}
                    <span>{task.team.name}</span>
                    {task.department && <span>{task.department.name}</span>}
                    {task.priority && <span>{task.priority}</span>}
                    {task.dueDate ? (
                      <span className={cn(reason === "overdue" && "text-destructive")}>
                        {reason === "overdue" && daysLate !== null ? `${daysLate}d late · ` : ""}
                        {formatShortDate(task.dueDate)}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 -space-x-1.5 pt-0.5">
                  {owners.slice(0, 3).map((user) => (
                    <UserAvatar key={user.id} user={user} size="xs" />
                  ))}
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs font-medium text-foreground/80 underline-offset-4 hover:underline">
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * What is due in the next few weeks, by date.
 *
 * A list, not a calendar grid: four weeks of a marketing team's deadlines is a
 * dozen dates, and a month grid drawn for them is mostly empty squares. These
 * are due dates and the heading says so — nothing here knows about a campaign
 * launch, because no launch date exists in the schema.
 */
export function UpcomingList({ tasks, onOpen, limit = 10 }: { tasks: TaskFact[]; onOpen?: (task: TaskFact) => void; limit?: number }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-muted-foreground" data-testid="dashboard-upcoming-empty">
        Nothing due in the next few weeks.
      </p>
    );
  }
  const groups = new Map<string, TaskFact[]>();
  for (const task of tasks.slice(0, limit)) {
    const key = task.dueDate!;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return (
    <ul className="flex flex-col gap-2.5" data-testid="dashboard-upcoming">
      {[...groups.entries()].map(([date, group]) => (
        <li key={date}>
          <p className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
            <CalendarClock className="size-3" aria-hidden /> {formatShortDate(date)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {group.map((task) => {
              const Row = onOpen ? "button" : "div";
              return (
                <li key={task.id}>
                  <Row
                    {...(onOpen ? { type: "button" as const, onClick: () => onOpen(task) } : {})}
                    className={cn("flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left", onOpen && "hover:bg-surface/70")}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{task.name}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{task.team.name}</span>
                  </Row>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
