"use client";

import { ChevronDown, RotateCw, Sparkles, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ChangelogEntryItem, useChangelogSince } from "@/features/version/changelog-dialog";
import { CURRENT_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

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

  // Room for the toasts above it, however tall it is at the moment.
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
  }, []);

  const count = entries?.length ?? 0;
  return (
    <div
      ref={ref}
      role="region"
      aria-label={`Streamline v${latest} is ready`}
      className="fixed right-4 bottom-4 z-50 w-[21rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 max-md:left-4 max-md:w-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]"
      data-testid="update-card"
    >
      <div className="flex items-center gap-2.5 py-2.5 pr-2.5 pl-3.5">
        <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">v{latest} is ready</p>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="mt-0.5 inline-flex items-center gap-0.5 rounded text-2xs whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="update-whats-new"
          >
            What&apos;s new{count > 1 ? ` · ${count} updates` : ""}
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
        <SimpleTooltip label="Refreshing keeps your place">
          <Button size="sm" onClick={onRefresh} className="h-7 shrink-0 px-2.5 text-xs" data-testid="update-refresh">
            <RotateCw /> Refresh
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Later">
          <Button variant="ghost" size="icon-xs" onClick={onLater} aria-label="Later" className="shrink-0 text-muted-foreground" data-testid="update-later">
            <X />
          </Button>
        </SimpleTooltip>
      </div>

      {expanded && (
        <div className="scrollbar-thin max-h-[min(50vh,360px)] overflow-y-auto border-t border-border/70 px-3.5 py-3" data-testid="changelog-entries">
          {entries === null ? (
            <div className="space-y-2">
              <SkeletonLine className="w-32" />
              <SkeletonLine className="w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Refresh to see what changed.</p>
          ) : (
            <ol className="space-y-4">
              {entries.map((entry) => (
                <ChangelogEntryItem key={entry.version} entry={entry} newest={false} compact />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
