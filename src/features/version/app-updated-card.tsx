"use client";

import { ChevronDown, PartyPopper, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ChangelogDialog, ChangelogEntryItem } from "@/features/version/changelog-dialog";
import { useToastRoom } from "@/features/version/update-card";
import { releaseBefore, releasesAfter, type ChangelogEntry } from "@/lib/changelog";
import { CURRENT_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { selectUpdateAvailable, useVersionStore } from "@/stores/version-store";

/** The last version this browser was shown, once the person has read what changed. */
const SEEN_KEY = "streamline.version.seen";
/** Saved by anyone who has used the app: the UI preferences. */
const USED_KEY = "streamline.ui";
/** "on" once the person has asked for the notice; it is off until then. */
const ENABLED_KEY = "streamline.version.notice";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Read in another tab, gone from this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === SEEN_KEY || event.key === ENABLED_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The version this browser last ran. One that never said, but has been used,
 * was on the release before this one: the notice arrived with it. One that has
 * never been used is new, and has nothing to catch up on.
 */
function seenVersion(): string {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen) return seen;
    if (localStorage.getItem(USED_KEY) !== null) return releaseBefore(CURRENT_VERSION.version) ?? CURRENT_VERSION.version;
  } catch {
    // Storage refused: say nothing rather than the same thing on every visit.
  }
  return CURRENT_VERSION.version;
}

function enabledNow(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "on";
  } catch {
    return false;
  }
}

/** Whether this device shows the notice, and the switch for it (Settings → Appearance). */
export function useAppUpdatedNoticeSetting(): [boolean, (on: boolean) => void] {
  return [React.useSyncExternalStore(subscribe, enabledNow, () => false), setAppUpdatedNotice];
}

function setAppUpdatedNotice(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "on");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Not kept; it stays as it was.
  }
  listeners.forEach((listener) => listener());
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION.version);
  } catch {
    // Not remembered; the notice simply comes back next time.
  }
  listeners.forEach((listener) => listener());
}

/**
 * What changed, once the app is on a newer version than this browser last
 * ran. The other card in the corner (UpdateCard) says a newer build is waiting
 * and offers to refresh; this one comes after, and says what arrived. It waits
 * while that one is up, since refreshing brings a newer version still. It stays
 * until read, and is shown once per version.
 *
 * Off unless switched on in Settings → Appearance. While it is off the version
 * is still recorded, so switching it on brings the next release, not a backlog.
 */
export function AppUpdatedNotice() {
  const [enabled] = useAppUpdatedNoticeSetting();
  const seen = React.useSyncExternalStore(subscribe, seenVersion, () => CURRENT_VERSION.version);
  const updateWaiting = useVersionStore((s) => selectUpdateAvailable(s) && s.latest !== null && s.dismissedBuildId !== s.latest.buildId);
  // Not before the server has been asked, so it never shows for a moment and then gives way.
  const asked = useVersionStore((s) => s.checkedAt !== null || s.failed);
  const releases = React.useMemo(() => releasesAfter(seen, CURRENT_VERSION.version), [seen]);

  // Someone new starts from this version, so the next one is the first news;
  // and while the notice is off, every version counts as read.
  React.useEffect(() => {
    try {
      const fresh = localStorage.getItem(SEEN_KEY) === null && localStorage.getItem(USED_KEY) === null;
      if (fresh || !enabled) localStorage.setItem(SEEN_KEY, CURRENT_VERSION.version);
    } catch {
      // nothing to remember with
    }
  }, [enabled]);

  if (!enabled || releases.length === 0 || !asked || updateWaiting) return null;
  return <AppUpdatedCard releases={releases} onDone={markSeen} />;
}

function AppUpdatedCard({ releases, onDone }: { releases: ChangelogEntry[]; onDone: () => void }) {
  const [showEarlier, setShowEarlier] = React.useState(false);
  const [allOpen, setAllOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useToastRoom(ref);

  const [newest, ...earlier] = releases;
  if (!newest) return null;
  return (
    <>
      <div
        ref={ref}
        role="region"
        aria-label={`App updated to v${CURRENT_VERSION.version}`}
        className="fixed right-8 bottom-8 z-50 flex max-h-[min(70dvh,560px)] w-[30rem] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in slide-in-from-bottom-3 duration-200 max-md:right-4 max-md:left-4 max-md:max-h-[min(55dvh,560px)] max-md:w-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+5rem)]"
        data-testid="app-updated"
      >
        <div className="flex shrink-0 items-start gap-4 p-5 pb-4">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PartyPopper className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold tracking-tight">App updated</p>
            <p className="mt-1 text-[13px] text-muted-foreground">You&apos;re on v{CURRENT_VERSION.version}. Here&apos;s what changed.</p>
          </div>
          <SimpleTooltip label="Close">
            <Button variant="ghost" size="icon-sm" onClick={onDone} aria-label="Close" className="-mt-1 -mr-1 shrink-0 text-muted-foreground" data-testid="app-updated-close">
              <X />
            </Button>
          </SimpleTooltip>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/70 px-5 py-4" data-testid="app-updated-entries">
          <ol className="space-y-5">
            <ChangelogEntryItem entry={newest} newest />
            {showEarlier && earlier.map((entry) => <ChangelogEntryItem key={entry.version} entry={entry} newest={false} />)}
          </ol>
          {earlier.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier((open) => !open)}
              aria-expanded={showEarlier}
              className="mt-4 inline-flex min-h-9 items-center gap-1 rounded text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              data-testid="app-updated-earlier"
            >
              {showEarlier ? "Hide earlier updates" : `${earlier.length} earlier ${earlier.length === 1 ? "update" : "updates"}`}
              <ChevronDown className={cn("size-4 transition-transform", showEarlier && "rotate-180")} />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-surface/40 px-5 py-3">
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="inline-flex min-h-9 items-center rounded text-[13px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="app-updated-all"
          >
            All changes
          </button>
          <Button onClick={onDone} className="shrink-0 px-4" data-testid="app-updated-done">
            Got it
          </Button>
        </div>
      </div>
      <ChangelogDialog open={allOpen} onOpenChange={setAllOpen} />
    </>
  );
}
