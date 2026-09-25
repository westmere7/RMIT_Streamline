"use client";

import { Check, LoaderCircle } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Covers the whole app while something that changes everything runs on the
 * server — a restore, a wipe. Nothing underneath can be clicked, typed into or
 * reached by a shortcut, and leaving the page asks first: the work carries on
 * on the server either way, and a half-seen app would only mislead. A running
 * clock says it has not stalled.
 */
export function BlockingScreen({ title, detail, done }: { title: string; detail: string; done?: { title: string; detail: string } | null }) {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    // Swallowed before anything else hears it: no shortcut, no Escape, no typing.
    const block = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stay = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("keydown", block, true);
    window.addEventListener("beforeunload", stay);
    (document.activeElement as HTMLElement | null)?.blur();
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("beforeunload", stay);
    };
  }, []);
  const finished = !!done;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/85 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-live="polite" aria-label={finished ? done.title : title} data-testid="blocking-screen">
      <div className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-surface">
          {finished ? <Check className="size-5 text-green-600 dark:text-green-400" /> : <LoaderCircle className="size-5 animate-spin text-primary" />}
        </span>
        <p className="mt-4 text-[15px] font-semibold">{finished ? done.title : title}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{finished ? done.detail : detail}</p>
        {!finished && (
          <>
            <div className="mx-auto mt-5 h-1 w-48 overflow-hidden rounded-full bg-border" aria-hidden>
              <span className="gate-bar block h-full w-full rounded-full bg-primary" />
            </div>
            <p className="mt-2 text-2xs text-muted-foreground tabular">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
