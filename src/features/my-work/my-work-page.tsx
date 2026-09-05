"use client";

import { Link2, ListTodo } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LabelPill } from "@/components/shared/label-pill";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isStuckLabel } from "@/domain";
import { useMyWork } from "@/features/my-work/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate } from "@/lib/dates/dates";
import { cn, groupBy } from "@/lib/utils";
import { MY_WORK_SECTION_LABELS, MY_WORK_SECTIONS, sectionFor, type MyWorkItem, type MyWorkSection } from "@/services/my-work-service";

export function MyWorkPage() {
  const ws = useWorkspace();
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const now = React.useMemo(() => new Date(), []);

  const grouped = React.useMemo(() => groupBy(myWork.data ?? [], (entry) => sectionFor(entry, now)), [myWork.data, now]);
  const openCount = (myWork.data ?? []).filter((e) => !e.isDone).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="My Work"
        description={`${openCount} open ${openCount === 1 ? "item" : "items"} assigned to you across ${ws.workspace.name}.`}
        actions={
          <div className="flex items-center gap-2">
            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="show-completed" className="text-[13px] font-normal">
              Show completed
            </Label>
          </div>
        }
      />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8"><div className="mx-auto w-full max-w-5xl">
        {myWork.isLoading && (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        )}
        {myWork.isError && <ErrorState title="Could not load your work." error={myWork.error} onRetry={() => myWork.refetch()} />}
        {myWork.data && myWork.data.length === 0 && (
          <EmptyState icon={ListTodo} title="Nothing assigned to you" description="Items where you are set as an owner will appear here, grouped by due date." />
        )}
        {myWork.data &&
          MY_WORK_SECTIONS.filter((s) => s !== "completed" || showCompleted).map((section) => {
            const entries = grouped.get(section) ?? [];
            if (entries.length === 0) return null;
            return <WorkSection key={section} section={section} entries={entries} now={now} />;
          })}
      </div>
      </div>
    </div>
  );
}

function WorkSection({ section, entries, now }: { section: MyWorkSection; entries: MyWorkItem[]; now: Date }) {
  const ws = useWorkspace();
  return (
    <section className="mt-5" data-testid={`my-work-${section}`}>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-muted-foreground">
        <span className={cn(section === "overdue" && "text-red-600 dark:text-red-400")}>{MY_WORK_SECTION_LABELS[section]}</span>
        <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs font-medium tabular">{entries.length}</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="hidden h-9 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_110px_90px] items-center gap-3 border-b border-border/70 bg-surface/70 px-4 text-2xs font-medium text-muted-foreground md:grid">
          <span>Item</span>
          <span>Board · Group</span>
          <span>Status</span>
          <span>Priority</span>
          <span className="text-right">Due</span>
        </div>
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => (
            <li key={entry.item.id}>
              <Link
                href={ws.boardPath(entry.board, { itemId: entry.item.id })}
                className={cn(
                  "grid min-h-10 grid-cols-[minmax(0,1fr)_90px] items-center gap-3 px-3 py-1.5 text-[13px] hover:bg-accent md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_110px_90px]",
                  entry.isDone && "text-muted-foreground",
                )}
              >
                <span className={cn("truncate font-medium", entry.isDone && "line-through decoration-muted-foreground/50")}>
                  {entry.item.parentItemId && <span className="mr-1 text-2xs text-muted-foreground">Subitem ·</span>}
                  {entry.item.name}
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 text-muted-foreground md:flex">
                  <DynamicIcon name={entry.board.icon} className={cn("size-3.5 shrink-0", colorClasses(entry.board.color).text)} />
                  <span className="truncate">
                    {entry.board.name}
                    {entry.group ? <span className="text-muted-foreground/70"> · {entry.group.name}</span> : null}
                  </span>
                  {entry.linkedBoards.length > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground/70" title={`Also on ${entry.linkedBoards.map((b) => b.name).join(", ")}`}>
                      <Link2 className="size-3" /> +{entry.linkedBoards.length}
                    </span>
                  )}
                </span>
                <span className="hidden md:block">
                  <LabelPill label={entry.status} size="sm" emptyText="—" striped={isStuckLabel(entry.statusColumn, entry.status?.id)} />
                </span>
                <span className="hidden md:block">
                  <LabelPill label={entry.priority} appearance="soft" size="sm" emptyText="—" />
                </span>
                <span className={cn("text-right text-xs tabular", section === "overdue" ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  {entry.dueDate ? formatShortDate(entry.dueDate, now) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
