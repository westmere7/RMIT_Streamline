"use client";

import * as React from "react";
import { create } from "zustand";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * Asked before a task leaves Booked by Form, because nothing can be put back
 * into it (v0.168.1, 0159). Two questions: allocating sends the request to a
 * team's board; a move only takes it to another group here.
 */
export type LeaveIntakeQuestion = { kind: "allocate"; count: number; to: string } | { kind: "move"; count: number; to: string };

interface LeaveIntakeState {
  open: (LeaveIntakeQuestion & { resolve: (yes: boolean) => void }) | null;
  ask: (question: LeaveIntakeQuestion) => Promise<boolean>;
  answer: (yes: boolean) => void;
}

const useLeaveIntakeStore = create<LeaveIntakeState>((set, get) => ({
  open: null,
  ask: (question) =>
    new Promise<boolean>((resolve) => {
      // A question already showing is answered no: the newer one is what the person did last.
      get().open?.resolve(false);
      set({ open: { ...question, resolve } });
    }),
  answer: (yes) => {
    const open = get().open;
    set({ open: null });
    open?.resolve(yes);
  },
}));

/** Ask, and wait for the answer. Resolves false when the dialog is dismissed. */
export function askLeaveIntake(question: LeaveIntakeQuestion): Promise<boolean> {
  return useLeaveIntakeStore.getState().ask(question);
}

/** The dialog itself, mounted once with the app. */
export function LeaveIntakeConfirm() {
  const open = useLeaveIntakeStore((s) => s.open);
  const answer = useLeaveIntakeStore((s) => s.answer);
  const many = (open?.count ?? 1) > 1;
  const what = many ? `${open?.count} requests` : "this request";
  const copy =
    open?.kind === "allocate"
      ? {
          title: `Allocate ${what} to ${open.to}?`,
          description: `${many ? "They leave" : "It leaves"} the allocation queue for the team's board. Booked by Form takes new bookings only, so ${many ? "they" : "it"} cannot come back to it.`,
          confirm: "Allocate",
        }
      : {
          title: `Move ${what} out of Booked by Form?`,
          description: `${many ? "They go" : "It goes"} to ${open?.to ?? "another group"}. Booked by Form takes new bookings only, so this cannot be undone.`,
          confirm: "Move",
        };
  return (
    <ConfirmDialog
      open={open !== null}
      onOpenChange={(next) => {
        if (!next && useLeaveIntakeStore.getState().open) answer(false);
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      onConfirm={() => answer(true)}
    />
  );
}
