"use client";

import { BrandMark } from "@/features/auth/components/auth-shell";

/**
 * The moment between two screens, when a session or a workspace is still being
 * fetched. A slow pulse behind the brand mark says "working"; the label says on
 * what. Quiet on purpose: it is usually gone within a second.
 */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <BrandMark pulse className="size-12 rounded-2xl text-lg" />
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {label}
          <span aria-hidden className="inline-flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
