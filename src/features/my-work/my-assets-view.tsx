"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { assetTypeLabel } from "@/features/items/item-assets-recap";
import type { useMyAssets } from "@/features/my-work/hooks";
import { MyWorkMobileSkeleton, MyWorkSkeleton } from "@/features/my-work/my-work-skeleton";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate } from "@/lib/dates/dates";
import { cn, groupBy } from "@/lib/utils";
import { MY_WORK_SECTION_LABELS, MY_WORK_SECTIONS, sectionFor, type MyWorkAsset, type MyWorkSection } from "@/services/my-work-service";

export type MyWorkTab = "tasks" | "assets";

/** Tasks or assets: the same person's work, counted two ways. */
export function MyWorkTabs({ tab, onTab, tasks, assets, className }: { tab: MyWorkTab; onTab: (tab: MyWorkTab) => void; tasks: number | null; assets: number | null; className?: string }) {
  const options: Array<{ id: MyWorkTab; label: string; count: number | null }> = [
    { id: "tasks", label: "Tasks", count: tasks },
    { id: "assets", label: "Assets", count: assets },
  ];
  return (
    <div role="tablist" aria-label="What to list" className={cn("inline-flex items-center rounded-full border border-border/70 p-0.5", className)} data-testid="my-work-tabs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={tab === option.id}
          onClick={() => onTab(option.id)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors max-md:h-9",
            tab === option.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`my-work-tab-${option.id}`}
        >
          {option.label}
          {option.count !== null && option.count > 0 && <span className={cn("text-2xs tabular", tab === option.id ? "opacity-70" : "opacity-80")}>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** How many asset lines on the reader are still open, once they have been read. */
export function openAssetCount(entries: readonly MyWorkAsset[] | undefined): number | null {
  return entries ? entries.filter((e) => !e.isDone).length : null;
}

/**
 * The Assets tab: every asset line the reader is in charge of, in the same
 * due-date sections as the tasks, each with the task it belongs to. A row
 * opens that task.
 */
export function MyAssetsView({ query, showCompleted, mobile = false }: { query: ReturnType<typeof useMyAssets>; showCompleted: boolean; mobile?: boolean }) {
  const now = React.useMemo(() => new Date(), []);
  const entries = React.useMemo(() => query.data ?? [], [query.data]);
  const grouped = React.useMemo(() => groupBy(entries, (entry) => sectionFor(entry, now)), [entries, now]);

  if (query.isLoading) return mobile ? <MyWorkMobileSkeleton /> : <MyWorkSkeleton />;
  if (query.isError) return <ErrorState title="Could not load your assets." error={query.error} onRetry={() => query.refetch()} />;
  if (entries.length === 0) return <EmptyState icon={Package} title="No assets on you" description="Asset lines you are in charge of appear here, grouped by due date." />;

  const sections = MY_WORK_SECTIONS.filter((s) => s !== "completed" || showCompleted).filter((s) => (grouped.get(s) ?? []).length > 0);
  if (sections.length === 0) return <EmptyState icon={Package} title="All done" description="Every asset on you is ticked off." />;
  return (
    <div data-testid="my-assets">
      {sections.map((section) => (
        <AssetSection key={section} section={section} entries={grouped.get(section)!} now={now} mobile={mobile} />
      ))}
    </div>
  );
}

function AssetSection({ section, entries, now, mobile }: { section: MyWorkSection; entries: MyWorkAsset[]; now: Date; mobile: boolean }) {
  const ws = useWorkspace();
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const late = section === "overdue";
  const heading = (
    <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-muted-foreground">
      <span className={cn(late && "text-red-600 dark:text-red-400")}>{MY_WORK_SECTION_LABELS[section]}</span>
      <span className="rounded-full bg-surface-strong/80 px-2 py-0.5 text-2xs font-medium tabular">{entries.length}</span>
    </h2>
  );

  if (mobile) {
    return (
      <section className="mt-5" data-testid={`my-assets-${section}`}>
        {heading}
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const type = assetTypeLabel(entry.asset.assetType, assetTypes);
            const meta = [entry.board.name, entry.asset.quantity !== null ? `×${entry.asset.quantity}` : null, type?.name ?? null].filter(Boolean).join(" · ");
            return (
              <li key={entry.asset.id}>
                <Link href={ws.boardPath(entry.board, { itemId: entry.item.id })} className="flex flex-col gap-1 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xs active:bg-accent/70 dark:bg-surface" data-testid="my-asset-row">
                  <span className="flex items-start gap-2">
                    <span className={cn("line-clamp-2 min-w-0 flex-1 text-[16px] leading-snug font-medium", entry.isDone && "text-muted-foreground line-through")}>{entry.asset.name}</span>
                    {entry.dueDate && <span className={cn("mt-0.5 shrink-0 text-[13px] tabular text-muted-foreground", late && "font-medium text-red-600 dark:text-red-400")}>{formatShortDate(entry.dueDate, now)}</span>}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">{entry.item.name}</span>
                  <span className="truncate text-xs text-muted-foreground/80">{meta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="mt-5" data-testid={`my-assets-${section}`}>
      {heading}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="grid h-9 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_120px_60px_90px] items-center gap-3 border-b border-border/70 bg-surface/70 px-4 text-2xs font-medium text-muted-foreground">
          <span>Asset</span>
          <span>Task</span>
          <span>Board · Group</span>
          <span>Type</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Due</span>
        </div>
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const type = assetTypeLabel(entry.asset.assetType, assetTypes);
            return (
              <li key={entry.asset.id}>
                <Link
                  href={ws.boardPath(entry.board, { itemId: entry.item.id })}
                  className={cn("grid min-h-10 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_120px_60px_90px] items-center gap-3 px-4 py-1.5 text-[13px] hover:bg-accent", entry.isDone && "text-muted-foreground")}
                  data-testid="my-asset-row"
                >
                  <span className={cn("truncate font-medium", entry.isDone && "line-through")} title={entry.asset.name}>
                    {entry.asset.blockName && <span className="mr-1 text-2xs font-normal text-muted-foreground">{entry.asset.blockName} ·</span>}
                    {entry.asset.name}
                  </span>
                  <span className="truncate" title={entry.item.name}>
                    {entry.item.name}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <DynamicIcon name={entry.board.icon} className={cn("size-3.5 shrink-0", colorClasses(entry.board.color).text)} />
                    <span className="truncate">
                      {entry.board.name}
                      {entry.group ? <span className="text-muted-foreground/70"> · {entry.group.name}</span> : null}
                    </span>
                  </span>
                  <span className="truncate text-muted-foreground" title={type?.name}>{type?.name ?? "—"}</span>
                  <span className="text-right text-xs tabular text-muted-foreground">{entry.asset.quantity ?? "—"}</span>
                  <span className={cn("text-right text-xs tabular", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{entry.dueDate ? formatShortDate(entry.dueDate, now) : "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
