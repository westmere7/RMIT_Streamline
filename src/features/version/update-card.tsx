"use client";

import { ChevronDown, RotateCw, Sparkles, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ChangelogEntryItem, useChangelogSince } from "@/features/version/changelog-dialog";
import { CURRENT_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

/** Room for the toasts above a card in the corner, however tall it is at the moment. */
export function useToastRoom(ref: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const reserve = () => root.style.setProperty("--update-card-space", `${node.offsetHeight + 12}px`);
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--update-card-space");
    };
  }, [ref]);
}

/**
 * A new build, announced in the corner.
 *
 * Compact until asked: the version and two ways out, Refresh and Later, with
 * "What's new" opening the changelog in place. It never takes focus or covers
 * the page, but it is the brand's navy and it stays until answered, so it is
 * not missed either. While it is up, toasts stack above it rather than on it.
 */
export function UpdateCard({ latest, onRefresh, onLater }: { latest: string; onRefresh: () => void; onLater: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const entries = useChangelogSince(CURRENT_VERSION.version);
  const ref = React.useRef<HTMLDivElement>(null);
  useToastRoom(ref);

  const count = entries?.length ?? 0;
  return (
    <div
      ref={ref}
      role="region"
      aria-label={`Streamline v${latest} is ready`}
      // Clear of the corner, so it reads as a card and not as part of the window's edge.
      className="fixed right-8 bottom-8 z-50 w-[30rem] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in slide-in-from-bottom-3 duration-200 max-md:right-4 max-md:left-4 max-md:w-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+5rem)]"
      data-testid="update-card"
    >
      <div className="flex items-start gap-4 p-5">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold tracking-tight">v{latest} is ready</p>
          <p className="mt-1 text-[13px] text-muted-foreground">You&apos;re on v{CURRENT_VERSION.version}. Refreshing keeps your place.</p>
        </div>
        <SimpleTooltip label="Later">
          <Button variant="ghost" size="icon-sm" onClick={onLater} aria-label="Later" className="-mt-1 -mr-1 shrink-0 text-muted-foreground" data-testid="update-later">
            <X />
          </Button>
        </SimpleTooltip>
      </div>

      {expanded && (
        <div className="scrollbar-thin max-h-[min(50vh,420px)] overflow-y-auto border-t border-border/70 px-5 py-4" data-testid="changelog-entries">
          {entries === null ? (
            <div className="space-y-2.5">
              <SkeletonLine className="w-40" />
              <SkeletonLine className="w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Refresh to see what changed.</p>
          ) : (
            <ol className="space-y-5">
              {entries.map((entry, index) => (
                <ChangelogEntryItem key={entry.version} entry={entry} newest={index === 0} />
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-surface/40 px-5 py-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded text-[13px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="update-whats-new"
        >
          What&apos;s new{count > 1 ? ` · ${count} updates` : ""}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
        <Button onClick={onRefresh} className="shrink-0 px-4" data-testid="update-refresh">
          <RotateCw /> Refresh
        </Button>
      </div>
    </div>
  );
}
