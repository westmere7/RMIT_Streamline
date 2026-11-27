"use client";

import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Sent back" on a card, where the status would be: the task waits on its requester. */
export function SentBackPill({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-2xs font-semibold text-white shadow-xs ring-1 ring-amber-300/70 dark:bg-amber-500/90", className)}
      title="Sent back to the requester for more information"
      data-testid="sent-back-chip"
    >
      <Undo2 className="size-3" aria-hidden /> Sent back
    </span>
  );
}
