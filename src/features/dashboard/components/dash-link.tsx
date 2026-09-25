"use client";

import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Where a name on the dashboard leads. Only the signed-in page passes these; a
 * public link gets none, so nothing on it leads anywhere its visitor cannot go.
 */
export interface DashboardLinks {
  person: (userId: string) => string;
  team: (teamId: string) => string;
}

/** A name that goes to its page when there is one, and plain text when there is not. */
export function DashLink({ href, className, children }: { href: string | null | undefined; className?: string; children: React.ReactNode }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={cn("underline-offset-2 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none", className)}>
      {children}
    </Link>
  );
}
