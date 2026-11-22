"use client";

import { Eye } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingReceipt, BookingRequest } from "@/domain";
import { bookingDestination, formatTicket, serviceById } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId } from "@/lib/ids";
import { BookingWizard } from "../wizard/booking-wizard";

/**
 * The form as a stakeholder will meet it, run on the draft.
 *
 * The editor draws every part of the form in place, but what it cannot show is
 * the *shape* of the thing: how long a step feels, whether a required question
 * stops you where you expected, what the recap reads like once everything is
 * answered. So this runs the real wizard on the draft — the same component the
 * public link serves, with the same validation and the same recap.
 *
 * Nothing it does leaves the dialog. The booking is not sent: `onSubmit`
 * invents the receipt the ticket would show, so the last step can be seen
 * without a task appearing on anybody's board. Nothing is remembered either
 * (`remember` is null), so trying the form out cannot overwrite the draft a
 * stakeholder left half-written in this browser.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  form,
  template,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: BookingFormData;
  template: BookingFormTemplate;
  /** Which form this is, for the strip: the published one, or the one open in the editor. */
  label: string;
}) {
  // The dialog's content is unmounted while it is shut, so every look starts on
  // step one with a blank form. Nothing here has to reset anything.
  // The draft's rules may name boards the published form does not: the editor is in the app, so it knows them all.
  const ws = useWorkspace();
  const preview = React.useMemo(
    () => ({
      ...form,
      template,
      boards: ws.boards.filter((b) => !b.system && b.archivedAt === null).map((b) => ({ id: b.id, name: b.name, teamName: ws.teamById(b.teamId)?.name ?? null })),
    }),
    [form, template, ws],
  );

  const pretend = React.useCallback(
    async (request: BookingRequest): Promise<BookingReceipt> => {
      const itemId = request.itemId ?? newId();
      const service = serviceById(template, request.serviceTypeId);
      const where = service ? bookingDestination(service, request.subServices, preview) : null;
      return {
        itemId,
        itemName: request.title,
        boardId: "preview",
        boardName: where?.kind === "board" ? where.boardName : "Task Allocation",
        boardSlug: "preview",
        teamName: where?.kind === "board" ? (where.teamName ?? where.boardName) : null,
        // Nothing is written, so nothing is issued: the receipt shows the shape
        // of a ticket rather than taking a number out of the real series.
        ticket: formatTicket(form.ticketPrefix, 14),
        submittedAt: new Date().toISOString(),
        assetCount: request.assets.length,
      };
    },
    [form.ticketPrefix, preview, template],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-[90vh] flex-col p-0" overlayClassName="booking-ground backdrop-blur-sm" data-testid="booking-preview">
        {/* A strip rather than a heading: the point of this dialog is to look
            like the form, and a title block of its own is the first thing that
            would stop it doing that. The title and description are still here
            for a screen reader, which has nothing else to go on. */}
        <DialogHeader className="sr-only">
          <DialogTitle>The form, as they will meet it</DialogTitle>
          <DialogDescription>Every step is open and nothing is required: this is for reading the form, not answering it. Nothing is sent and nothing is saved.</DialogDescription>
        </DialogHeader>
        <p className="flex shrink-0 items-center justify-center gap-1.5 rounded-t-2xl bg-green-600/15 px-10 py-1.5 text-2xs font-medium text-green-700 dark:text-green-400" data-testid="booking-preview-badge">
          <Eye className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Previewing {label} · nothing is sent or saved</span>
        </p>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-card px-5 py-4">
          <BookingWizard form={preview} onSubmit={pretend} remember={null} preview />
        </div>
      </DialogContent>
    </Dialog>
  );
}
