"use client";

import { Archive, Inbox, Undo2, type LucideIcon } from "lucide-react";
import type { SpecialStatus } from "@/features/boards/board-context";
import { cn } from "@/lib/utils";

/**
 * The statuses nobody sets: where the task is says them, and while one shows
 * the task's own status is frozen underneath (and comes back when it ends).
 * Only ever drawn, never written into the Status column, so the dashboard and
 * automations keep reading the real one.
 */
export const SPECIAL_STATUSES: Record<SpecialStatus, { label: string; hint: string; icon: LucideIcon; solid: string; ring: string; testId: string }> = {
  waiting_allocation: {
    label: "Waiting allocation",
    hint: "In Booked by Form: waiting for a manager to place it with a team",
    icon: Inbox,
    solid: "bg-sky-600 text-white dark:bg-sky-600/90",
    ring: "ring-sky-300/70 dark:ring-sky-300/40",
    testId: "waiting-allocation-chip",
  },
  sent_back: {
    label: "Sent back",
    hint: "Sent back to the requester for more information",
    icon: Undo2,
    solid: "bg-amber-500 text-white dark:bg-amber-500/90",
    ring: "ring-amber-300/70 dark:ring-amber-300/40",
    testId: "sent-back-chip",
  },
  archived: {
    label: "Archived",
    hint: "Archived. Its own status is kept underneath, and is what the dashboard counts",
    icon: Archive,
    solid: "bg-zinc-500 text-white dark:bg-zinc-600",
    ring: "ring-zinc-300/70 dark:ring-zinc-400/40",
    testId: "archived-chip",
  },
};

/** A special status on a card, where the status would be. */
export function SpecialStatusPill({ kind, className }: { kind: SpecialStatus; className?: string }) {
  const s = SPECIAL_STATUSES[kind];
  const Icon = s.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold shadow-xs ring-1", s.solid, s.ring, className)}
      title={s.hint}
      data-testid={s.testId}
      data-special-status={kind}
    >
      <Icon className="size-3" aria-hidden /> {s.label}
    </span>
  );
}

/** "Sent back" on a card, where the status would be: the task waits on its requester. */
export function SentBackPill({ className }: { className?: string }) {
  return <SpecialStatusPill kind="sent_back" className={className} />;
}
