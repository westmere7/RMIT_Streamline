"use client";

import * as React from "react";
import { formatDateTime, formatRelative } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  // Re-render every minute so "just now" ages naturally.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={cn("whitespace-nowrap", className)}>
      {formatRelative(iso)}
    </time>
  );
}
