"use client";

import * as React from "react";
import { create } from "zustand";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { DateWrite } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";

/**
 * Asked when a date change would overwrite another date the task already has:
 * Start day and Due date are the two ends of the Timeline, and a change to one
 * offers to bring the others in line. Empty ones are filled without asking.
 */
interface DateSyncState {
  open: { item: string; writes: DateWrite[]; resolve: (yes: boolean) => void } | null;
  ask: (item: string, writes: DateWrite[]) => Promise<boolean>;
  answer: (yes: boolean) => void;
}

const useDateSyncStore = create<DateSyncState>((set, get) => ({
  open: null,
  ask: (item, writes) =>
    new Promise<boolean>((resolve) => {
      get().open?.resolve(false);
      set({ open: { item, writes, resolve } });
    }),
  answer: (yes) => {
    const open = get().open;
    set({ open: null });
    open?.resolve(yes);
  },
}));

/** Asks whether to bring the task's other dates in line. Resolves false when kept. */
export function askDateSync(item: string, writes: DateWrite[]): Promise<boolean> {
  return writes.length ? useDateSyncStore.getState().ask(item, writes) : Promise.resolve(false);
}

const shown = (iso: string | null) => (iso ? iso.split(" – ").map((d) => (d === "…" ? "…" : formatShortDate(d))).join(" – ") : "empty");

export function DateSyncConfirm() {
  const open = useDateSyncStore((s) => s.open);
  const answer = useDateSyncStore((s) => s.answer);
  const names = open?.writes.map((w) => w.column.name) ?? [];
  return (
    <ConfirmDialog
      open={!!open}
      onOpenChange={(o) => !o && answer(false)}
      title={`Update ${names.join(" and ")}?`}
      description={
        <span className="grid gap-1" data-testid="date-sync-confirm">
          {open?.writes.map((w) => (
            <span key={w.column.id}>
              {w.column.name}: {shown(w.from)} → <strong>{shown(w.to)}</strong>
            </span>
          ))}
        </span>
      }
      confirmLabel="Update"
      cancelLabel="Keep"
      onConfirm={() => answer(true)}
    />
  );
}
