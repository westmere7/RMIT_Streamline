"use client";

import { BrandLogo } from "@/features/auth/components/auth-shell";
import { CURRENT_VERSION } from "@/lib/version";

/**
 * The moment between two screens, when a session or a workspace is still being
 * fetched. One bar sweeps under the brand mark and the label says what is being
 * fetched, with the version on a quiet badge beside the mark so a screenshot of
 * a stuck load says which build it was. Quiet on purpose: it is usually gone
 * within a second, and it holds still under reduced motion.
 */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <div className="flex items-end gap-1.5">
          <BrandLogo className="h-8" />
          <span className="rounded-full bg-surface-strong/70 px-1.5 py-0.5 text-2xs text-muted-foreground tabular" data-testid="loader-version">
            v{CURRENT_VERSION.version}
          </span>
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-border" aria-hidden>
          <span className="gate-bar block h-full w-full rounded-full bg-primary" />
        </div>
        <p className="text-[13px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
