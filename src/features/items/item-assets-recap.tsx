"use client";

import { CalendarDays, ChevronRight, TriangleAlert } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { ColumnLabel, ItemAsset, User } from "@/domain";
import { ASSET_TYPE_OPTIONS, countByType, recapAssets } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { tagColorFor } from "@/lib/colors";
import { formatShortDate, todayISO } from "@/lib/dates/dates";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/** The chip for an asset type: the shared palette's colour when it is one of theirs, a stable colour otherwise. */
export function assetTypeLabel(type: string | null): ColumnLabel | null {
  if (!type) return null;
  const option = ASSET_TYPE_OPTIONS.find((o) => o.name.toLowerCase() === type.toLowerCase());
  return { id: type, name: option?.name ?? type, color: option?.color ?? tagColorFor(type) };
}

/** Past this many types the rest are counted rather than listed, so a long list cannot swamp the strip. */
const TYPES_SHOWN = 5;
/** Same for the faces: enough to recognise who is on it, not a second row of avatars. */
const PEOPLE_SHOWN = 4;

/**
 * What the task's deliverables add up to, read above the tabs so it is there
 * whichever tab is open, and nothing at all when the task has no assets.
 *
 * Folded up — how it starts, and how it stays until someone opens it — it is one
 * line: how many are done, and the bar. Opened, it adds what the list is made of
 * and when it is wanted, in rows that only grow downwards, so a task with twenty
 * items and six types cannot reflow the strip. The bar wears moving stripes
 * while the list is part way through, so a glance separates "started" from "not
 * started" and "finished" without reading it.
 */
export function AssetsRecapStrip({ assets }: { assets: readonly ItemAsset[] }) {
  const ws = useWorkspace();
  const today = todayISO();
  const expanded = useUiStore((s) => s.assetRecapExpanded);
  const toggle = useUiStore((s) => s.toggleAssetRecap);
  const recap = React.useMemo(() => recapAssets(assets, today), [assets, today]);
  const byType = React.useMemo(() => countByType(assets), [assets]);
  const people = recap.assigneeIds.map((id) => ws.userById(id)).filter((u): u is User => !!u);

  if (recap.lines === 0) return null;

  // Items, not units: ticking three of four should look like three of four,
  // whatever the print run on the fourth.
  const percent = Math.round((recap.done / recap.lines) * 100);
  const midway = percent > 0 && percent < 100;
  const shownTypes = byType.slice(0, TYPES_SHOWN);
  const restTypes = byType.slice(TYPES_SHOWN);
  const restQuantity = restTypes.reduce((sum, t) => sum + t.quantity, 0);

  const bar = (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-strong", expanded ? "w-full" : "min-w-16 flex-1")}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${recap.done} of ${recap.lines} asset items done`}
      data-testid="assets-progress-bar"
    >
      <div className={cn("h-full rounded-full bg-emerald-500 transition-[width] duration-300", midway && "progress-stripes")} style={{ width: `${percent}%` }} />
    </div>
  );

  return (
    <section aria-label="Asset progress" className={cn("mt-3", expanded && "space-y-2")} data-testid="assets-summary">
      {/* ---- The line that is always there. Folded up, the bar rides beside it. */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide the asset breakdown" : "Show the asset breakdown"}
          className="-ml-1 flex min-w-0 shrink-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-1 text-[13px] font-medium tabular transition-colors hover:bg-accent/70"
          data-testid="assets-recap-toggle"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          <span data-testid="assets-progress">
            {recap.done} of {recap.lines} {recap.lines === 1 ? "item" : "items"} done
          </span>
        </button>

        {!expanded && bar}

        {expanded && (
          <>
            <span className="shrink-0 text-xs text-muted-foreground tabular" data-testid="assets-quantity">
              {recap.quantity} {recap.quantity === 1 ? "asset" : "assets"}
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular" data-testid="assets-due">
                {recap.overdue > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-red-600 dark:text-red-400" title={`${recap.overdue} overdue`}>
                    <TriangleAlert className="size-3" /> {recap.overdue}
                  </span>
                )}
                <span className="inline-flex min-w-0 items-center gap-1">
                  <CalendarDays className="size-3 shrink-0" />
                  <span className="truncate">{recap.nextDue ? `Next due ${formatShortDate(recap.nextDue)}` : "No due dates"}</span>
                </span>
              </span>
              {people.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5" aria-label={`In charge: ${people.map((u) => u.displayName).join(", ")}`} data-testid="assets-people">
                  {people.slice(0, PEOPLE_SHOWN).map((u) => (
                    <UserAvatar key={u.id} user={u} size="xs" />
                  ))}
                  {people.length > PEOPLE_SHOWN && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-surface-strong text-[9px] font-medium text-muted-foreground ring-2 ring-card">
                      +{people.length - PEOPLE_SHOWN}
                    </span>
                  )}
                </span>
              )}
            </span>
          </>
        )}
      </div>

      {expanded && bar}

      {/* ---- And what it is made of. Its own row, so more types only make it taller. */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="assets-breakdown">
          {shownTypes.map(({ type, quantity }) => (
            <span key={type ?? "none"} className="inline-flex items-center gap-1">
              <LabelPill label={assetTypeLabel(type)} appearance="soft" size="sm" emptyText="No type" />
              <span className="tabular">×{quantity}</span>
            </span>
          ))}
          {restTypes.length > 0 && (
            <span className="tabular" title={restTypes.map((t) => `${t.type ?? "No type"} ×${t.quantity}`).join(", ")}>
              +{restTypes.length} more ×{restQuantity}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
