"use client";

import { ListTodo } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyWork } from "@/features/my-work/hooks";
import { MobileTaskList, MobileTaskRow } from "@/features/mobile/task-row";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { cn, groupBy } from "@/lib/utils";
import { MY_WORK_SECTION_LABELS, MY_WORK_SECTIONS, sectionFor, type MyWorkItem, type MyWorkSection } from "@/services/my-work-service";

/**
 * My Work on a phone: the same six sections, the same grouping, in cards that
 * say what the desktop table's columns say.
 *
 * The data, the grouping and the deduplication are the existing service's —
 * only the presentation is new.
 */
export function MyWorkMobile() {
  const ws = useWorkspace();
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const now = React.useMemo(() => new Date(), []);

  const grouped = React.useMemo(() => groupBy(myWork.data ?? [], (entry) => sectionFor(entry, now)), [myWork.data, now]);
  const openCount = (myWork.data ?? []).filter((e) => !e.isDone).length;
  const completed = grouped.get("completed") ?? [];

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="text-lg font-semibold tracking-tight">My Work</h1>
        <p className="mb-4 text-[13px] text-muted-foreground">
          {openCount} open {openCount === 1 ? "item" : "items"} assigned to you.
        </p>

        {myWork.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {myWork.isError && <ErrorState title="Could not load your work." error={myWork.error} onRetry={() => myWork.refetch()} />}
        {myWork.data && myWork.data.length === 0 && (
          <EmptyState icon={ListTodo} title="Nothing assigned to you" description="Items where you are set as an owner appear here, grouped by when they are due." />
        )}

        {myWork.data &&
          MY_WORK_SECTIONS.filter((s) => s !== "completed").map((section) => {
            const entries = grouped.get(section) ?? [];
            if (entries.length === 0) return null;
            return <Section key={section} section={section} entries={entries} now={now} />;
          })}

        {completed.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
              className="mt-5 flex h-11 w-full items-center justify-between rounded-xl border border-border/70 px-3 text-[13px] font-medium active:bg-accent/70"
              data-testid="my-work-toggle-completed"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
              <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs tabular">{completed.length}</span>
            </button>
            {showCompleted && <Section section="completed" entries={completed} now={now} />}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ section, entries, now }: { section: MyWorkSection; entries: MyWorkItem[]; now: Date }) {
  return (
    <section className="mt-5" data-testid={`my-work-${section}`}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold tracking-tight">
        <span className={cn(section === "overdue" && "text-red-600 dark:text-red-400")}>{MY_WORK_SECTION_LABELS[section]}</span>
        <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs font-medium text-muted-foreground tabular">{entries.length}</span>
      </h2>
      <MobileTaskList>
        {entries.map((entry) => (
          <MobileTaskRow key={entry.item.id} entry={entry} now={now} />
        ))}
      </MobileTaskList>
    </section>
  );
}
