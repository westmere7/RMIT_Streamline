"use client";

import { CalendarClock, ChevronRight, Inbox, Package, SearchX } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalTask } from "@/domain";
import type { PortalTasksResponse } from "@/features/portal/portal-client";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn, pluralize } from "@/lib/utils";

type Grouping = "none" | "status" | "person" | "source";

/**
 * A department's requests.
 *
 * The figures above the list are the department's, not the page's — the server
 * computes them over every authorised request, so "3 overdue" stays true when
 * only twenty of sixty are on screen. Grouping by person may show a request in
 * two groups, because two people are carrying it; the total above never
 * double-counts.
 */
export function PortalTaskList({
  page,
  loading,
  searching,
  onOpen,
  onLoadMore,
}: {
  page: PortalTasksResponse | null;
  loading: boolean;
  searching: boolean;
  onOpen: (itemId: string) => void;
  onLoadMore: (() => Promise<PortalTask[]>) | null;
}) {
  const [grouping, setGrouping] = React.useState<Grouping>("none");
  const [extra, setExtra] = React.useState<PortalTask[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // A new page of results replaces anything loaded on top of the old one.
  const [seenAt, setSeenAt] = React.useState(page?.servedAt ?? null);
  if (page && seenAt !== page.servedAt) {
    setSeenAt(page.servedAt);
    if (extra.length > 0) setExtra([]);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!page) return null;

  const tasks = [...page.tasks, ...extra];
  if (tasks.length === 0) {
    return searching ? (
      <EmptyState icon={SearchX} title="Nothing matches" description="No request in this department matches what you typed. Try part of a title, or the ID from your receipt." />
    ) : (
      <EmptyState icon={Inbox} title="No requests yet" description="Anything this department books through the portal shows up here, with its progress." />
    );
  }

  const groups = groupTasks(tasks, grouping);

  return (
    <div data-testid="portal-tasks">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Figure value={page.totals.requests} label="requests" />
        <Figure value={page.totals.done} label="done" tone="good" />
        <Figure value={page.totals.overdue} label="overdue" tone={page.totals.overdue > 0 ? "warn" : undefined} />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-muted-foreground">Group by</span>
          <div role="radiogroup" aria-label="Group requests by" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
            {(
              [
                ["none", "None"],
                ["status", "Status"],
                ["person", "Person"],
                ["source", "Team"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={grouping === id}
                onClick={() => setGrouping(id)}
                className={cn("h-8 rounded-full px-2.5 text-2xs font-medium transition-colors", grouping === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                data-testid={`portal-group-${id}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.key}>
            {group.label && (
              <h2 className="mb-1.5 flex items-center gap-2 px-1 text-[13px] font-semibold tracking-tight">
                {group.color && <span aria-hidden className={cn("size-2.5 rounded-full", colorClasses(group.color).dot)} />}
                {group.label}
                <span className="rounded-full bg-surface-strong/70 px-2 py-0.5 text-2xs font-medium text-muted-foreground tabular">{group.tasks.length}</span>
              </h2>
            )}
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {group.tasks.map((task) => (
                <TaskRow key={`${group.key}:${task.id}`} task={task} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {onLoadMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              try {
                const more = await onLoadMore();
                setExtra((current) => [...current, ...more]);
              } finally {
                setLoadingMore(false);
              }
            }}
            data-testid="portal-load-more"
          >
            {loadingMore ? "Loading…" : `Show more (${tasks.length} of ${page.totals.requests})`}
          </Button>
        </div>
      )}
    </div>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: "good" | "warn" }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[13px] text-muted-foreground">
      <span className={cn("text-base font-semibold tabular", tone === "warn" && "text-red-600 dark:text-red-400", tone === "good" && "text-green-700 dark:text-green-400", !tone && "text-foreground")}>{value}</span>
      {label}
    </span>
  );
}

function TaskRow({ task, onOpen }: { task: PortalTask; onOpen: (itemId: string) => void }) {
  const done = task.status?.role === "done";
  const late = !done && isOverdue(task.dueDate);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex min-h-16 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        data-testid="portal-task"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={cn("min-w-0 flex-1 text-[15px] leading-snug font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.name}</span>
            {task.dueDate && (
              <span className={cn("shrink-0 text-[13px] tabular", late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(task.dueDate)}</span>
            )}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
            {task.status && (
              <span className={cn("rounded-full px-2 py-0.5 font-medium", colorClasses(task.status.color).soft)} data-testid="portal-task-status">
                {task.status.name}
              </span>
            )}
            {task.priority && <span className="text-muted-foreground">{task.priority.name}</span>}
            {late && <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">Overdue</span>}
            {task.reference && <span className="font-mono text-muted-foreground/80 tabular">{task.reference}</span>}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
            {task.deliverables.total > 0 && (
              <span className="flex items-center gap-1">
                <Package className="size-3" aria-hidden />
                {task.deliverables.done} of {task.deliverables.total} {pluralize(task.deliverables.total, "deliverable", "deliverables").replace(/^\d+\s/, "")}
              </span>
            )}
            {task.timeline?.start && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3" aria-hidden />
                from {formatShortDate(task.timeline.start)}
              </span>
            )}
            {task.people.length > 0 && <span className="truncate">{task.people.map((p) => p.displayName).join(", ")}</span>}
            {task.sourceName && <span className="truncate">{task.sourceName}</span>}
          </span>
        </span>
        <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground/70" />
      </button>
    </li>
  );
}

interface TaskGroup {
  key: string;
  label: string | null;
  color: PortalTask["status"] extends null ? never : NonNullable<PortalTask["status"]>["color"] | null;
  tasks: PortalTask[];
}

/**
 * Grouping, deterministic about the awkward cases.
 *
 * A request with two people appears under both, because both are carrying it. A
 * request with none appears under "Unassigned" rather than vanishing, and one
 * with no status under "No status" — a group that swallows rows is worse than
 * an untidy list.
 */
function groupTasks(tasks: readonly PortalTask[], grouping: Grouping): TaskGroup[] {
  if (grouping === "none") return [{ key: "all", label: null, color: null, tasks: [...tasks] }];

  const groups = new Map<string, TaskGroup>();
  const push = (key: string, label: string, color: TaskGroup["color"], task: PortalTask) => {
    const existing = groups.get(key) ?? { key, label, color, tasks: [] };
    existing.tasks.push(task);
    groups.set(key, existing);
  };

  for (const task of tasks) {
    if (grouping === "status") {
      push(task.status?.name ?? "__none__", task.status?.name ?? "No status", task.status?.color ?? null, task);
    } else if (grouping === "person") {
      if (task.people.length === 0) push("__none__", "Unassigned", null, task);
      else for (const person of task.people) push(person.id, person.displayName, null, task);
    } else {
      push(task.sourceName ?? "__none__", task.sourceName ?? "Not yet placed", null, task);
    }
  }

  return [...groups.values()].sort((a, b) => {
    // Unnamed groups sink; the rest read biggest first, then alphabetically.
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return b.tasks.length - a.tasks.length || (a.label ?? "").localeCompare(b.label ?? "");
  });
}
