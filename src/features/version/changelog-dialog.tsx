"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { formatShortDate } from "@/lib/dates/dates";
import { CURRENT_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

/**
 * Every release, newest first, as a dialog opened from About. A new build is
 * announced by UpdateCard instead, in the corner, with the same entries.
 */
export function ChangelogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="gap-0 overflow-hidden p-0 shadow-[0_24px_80px_-20px_rgba(0,0,84,0.55)]" data-testid="changelog-dialog">
        {/* The brand, on the navy the About dialog and sign-in wear. */}
        <div className="relative overflow-hidden bg-navy px-6 pt-6 pb-5 text-white">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-primary/35 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-56 rounded-full bg-sky-400/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_75%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/85 uppercase backdrop-blur">
              <Sparkles className="size-3 text-amber-300" />
              Changelog
            </span>
            <DialogTitle className="mt-3 text-[22px] leading-tight font-semibold tracking-tight text-white">What&apos;s new in Streamline</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-white/65">You&apos;re on v{CURRENT_VERSION.version}.</DialogDescription>
          </div>
        </div>

        <div className="scrollbar-thin max-h-[min(52vh,440px)] overflow-y-auto px-6 py-5" data-testid="changelog-entries">
          <ol className="relative space-y-6">
            {CHANGELOG.map((entry, index) => (
              <ChangelogEntryItem key={entry.version} entry={entry} newest={index === 0} />
            ))}
          </ol>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-surface/50 px-6 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChangelogEntryItem({ entry, newest, compact = false }: { entry: ChangelogEntry; newest: boolean; compact?: boolean }) {
  // Compact, for the corner card: the version as plain text, smaller type.
  if (compact) {
    return (
      <li>
        <div className="flex items-baseline gap-2">
          <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{entry.title}</h3>
          <span className="shrink-0 text-2xs text-muted-foreground tabular">
            v{entry.version} · {formatShortDate(entry.date)}
          </span>
        </div>
        <ul className="mt-1 space-y-1">
          {entry.changes.map((change) => (
            <li key={change} className="text-xs leading-relaxed text-muted-foreground">
              {change}
            </li>
          ))}
        </ul>
      </li>
    );
  }
  return (
    <li>
      <div className="flex items-baseline gap-2">
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular", newest ? "bg-primary text-primary-foreground" : "bg-surface-strong text-foreground/80")}>
          v{entry.version}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{entry.title}</h3>
        <time dateTime={entry.date} className="shrink-0 text-2xs text-muted-foreground tabular">
          {formatShortDate(entry.date)}
        </time>
      </div>
      <ul className="mt-2 space-y-1.5 pl-0.5">
        {entry.changes.map((change) => (
          <li key={change} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
            <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{change}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The server's entries since `since`, read from the new build (this page's own
 * changelog stops where it was built); null while loading or when not asked.
 */
export function useChangelogSince(since: string | null): ChangelogEntry[] | null {
  const [entries, setEntries] = React.useState<ChangelogEntry[] | null>(null);
  React.useEffect(() => {
    if (since === null) return;
    let live = true;
    fetch(`/api/changelog?since=${encodeURIComponent(since)}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((body: { entries?: ChangelogEntry[] }) => {
        if (live) setEntries(Array.isArray(body.entries) ? body.entries : []);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, [since]);
  return entries;
}
