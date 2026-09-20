"use client";

import { Undo2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useUndoStore } from "@/stores/undo-store";

/**
 * The standing offer to undo the last thing, wherever the person is looking.
 *
 * It is not a toast: a toast leaves on its own, and the point of this is that
 * it does not. It stays until the offer is taken, dismissed, retired by the
 * next action, or the person leaves the page it was made on. On a desktop it
 * sits at the foot of the screen, centred, clear of the panel and the sidebar;
 * on a phone it sits above the New item button and the bottom bar.
 */
export function UndoBar() {
  const offer = useUndoStore((s) => s.offer);
  const busy = useUndoStore((s) => s.busy);
  const perform = useUndoStore((s) => s.perform);
  const clear = useUndoStore((s) => s.clear);
  const isMobile = useIsMobile();
  const pathname = usePathname();

  // An offer belongs to the screen it was made on. Leaving retires it, so a
  // bar saying "Status set to Done" never follows somebody to the inbox.
  const madeOn = React.useRef(pathname);
  React.useEffect(() => {
    if (madeOn.current !== pathname) {
      madeOn.current = pathname;
      clear();
    }
  }, [pathname, clear]);
  React.useEffect(() => {
    if (offer) madeOn.current = pathname;
    // The path at the moment the offer was made is what matters; a later
    // navigation is the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  if (!offer) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed z-40 flex items-center gap-2 rounded-xl border border-border/70 bg-popover pl-3.5 pr-1.5 text-[13px] text-foreground shadow-lg",
        isMobile ? "inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+4.75rem)] h-12" : "bottom-6 left-1/2 h-11 max-w-[calc(100vw-2rem)] -translate-x-1/2",
      )}
      data-testid="undo-bar"
    >
      <span className="min-w-0 flex-1 truncate">{offer.label}</span>
      <button
        type="button"
        onClick={() => void perform()}
        disabled={busy}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold text-primary hover:bg-accent/70 active:bg-accent/70 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="undo-button"
      >
        <Undo2 className="size-4" aria-hidden /> {busy ? "Undoing…" : "Undo"}
      </button>
      <button
        type="button"
        onClick={clear}
        aria-label="Dismiss"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/70 active:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="undo-dismiss"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
