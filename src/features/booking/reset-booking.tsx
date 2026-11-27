"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Item } from "@/domain";
import { useBoardContext, useItemSentBack } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { publishDataChange } from "@/lib/realtime/local-realtime";

/**
 * Reset booking, for the task's menus (the row's and the panel's): offered on
 * a booked task still on Task Allocation, not while it waits on its requester,
 * and asked first. The work is the server's (BookingSendBackService.reset).
 */
export function useResetBooking(item: Item): { offered: boolean; ask: () => void; dialog: React.ReactNode } {
  const { board, canEdit } = useBoardContext();
  const sentBack = useItemSentBack(item.id);
  const services = useServices();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const offered = canEdit && board.system === "TASK_ALLOCATION" && !!item.bookedVia && !item.parentItemId && !item.archivedAt && !sentBack;
  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={`Reset “${item.name}” to its booking?`}
      description="Its name, description, brief, columns and asset lines go back to what was booked, and its subitems are removed. Updates stay. This cannot be undone."
      confirmLabel="Reset booking"
      destructive
      onConfirm={async () => {
        try {
          await services.bookingSendBacks.reset(item.id, ws.currentUser.id);
          publishDataChange({ kinds: ["items", "board"] });
          await queryClient.invalidateQueries();
          toast.success("Reset to the booking");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not reset the booking");
        }
      }}
    />
  );
  return { offered, ask: () => setOpen(true), dialog };
}
