"use client";

import { BrandLogo } from "@/features/auth/components/auth-shell";

/**
 * The moment between two screens, when a session or a workspace is still being
 * fetched. One bar sweeps under the brand mark and the label says what is being
 * fetched. Quiet on purpose: it is usually gone within a second, and it holds
 * still under reduced motion.
 */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <BrandLogo className="h-8" />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-border" aria-hidden>
          <span className="gate-bar block h-full w-full rounded-full bg-primary" />
        </div>
        <p className="text-[13px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
