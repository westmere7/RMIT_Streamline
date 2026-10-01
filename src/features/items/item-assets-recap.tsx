"use client";

import type { ColumnLabel, ItemAsset, TagOption } from "@/domain";
import { ASSET_TYPE_OPTIONS } from "@/domain";
import { tagColorFor } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * The chip for an asset type: the colour the workspace gave it in Settings →
 * Lists, and a stable one for a word that is no longer on the list — history
 * keeps its colour when a list changes under it.
 */
export function assetTypeLabel(type: string | null, options: readonly TagOption[] = ASSET_TYPE_OPTIONS): ColumnLabel | null {
  if (!type) return null;
  const option = options.find((o) => o.name.toLowerCase() === type.toLowerCase());
  return { id: type, name: option?.name ?? type, color: option?.color ?? tagColorFor(type) };
}

/**
 * How far the task's deliverables are, as a ring and a percentage in a quiet
 * pill on the panel's line of facts — the place the eye already reads for "who
 * and when". Lines, not units, the way the Progress column counts by default.
 * Nothing at all when the task has no assets. Clicking it opens the Assets tab.
 */
export function AssetProgressPill({ assets, onOpen }: { assets: readonly ItemAsset[]; onOpen?: () => void }) {
  const total = assets.length;
  if (total === 0) return null;
  const done = assets.filter((asset) => asset.completedAt).length;
  const percent = Math.round((done / total) * 100);
  const words = `${done} of ${total} ${total === 1 ? "item" : "items"} done`;
  const r = 5.5;
  const length = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      title={words}
      aria-label={`${words}. Open the Assets tab`}
      className="inline-flex h-5 items-center gap-1.5 rounded-full bg-surface-strong/50 pr-2 pl-1 text-2xs font-medium text-foreground/80 tabular transition-colors enabled:hover:bg-surface-strong disabled:cursor-default"
      data-testid="assets-progress"
    >
      <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden>
        <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-border" />
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - done / total)}
          className={cn("transition-[stroke-dashoffset] duration-500", percent === 100 ? "stroke-emerald-500" : "stroke-emerald-500/90")}
        />
      </svg>
      <span className={cn(percent === 100 && "text-emerald-700 dark:text-emerald-400")}>{percent}%</span>
      <span className="sr-only">{words}</span>
    </button>
  );
}
