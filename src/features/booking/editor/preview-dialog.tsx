"use client";

import { Eye, X } from "lucide-react";
import * as React from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      {/* Square, under a striped green header like a site's barrier tape: plainly not the real thing. */}
      <DialogContent size="xl" hideClose className="flex max-h-[90vh] flex-col gap-0 rounded-none p-0" overlayClassName="booking-ground backdrop-blur-sm" data-testid="booking-preview">
        {/* A strip rather than a heading: the point of this dialog is to look
            like the form, and a title block of its own is the first thing that
            would stop it doing that. The title and description are still here
            for a screen reader, which has nothing else to go on. */}
        <DialogHeader className="sr-only">
          <DialogTitle>The form, as they will meet it</DialogTitle>
          <DialogDescription>Every step is open and nothing is required: this is for reading the form, not answering it. Nothing is sent and nothing is saved.</DialogDescription>
        </DialogHeader>
        <div className="relative flex h-11 shrink-0 items-center justify-center px-12" style={{ backgroundColor: "#15803d", backgroundImage: "repeating-linear-gradient(-45deg, #15803d 0 14px, #166534 14px 28px)" }}>
          <p className="flex min-w-0 items-center gap-1.5 bg-[#15803d] px-3 py-1 text-xs font-semibold text-white shadow-sm" data-testid="booking-preview-badge">
            <Eye className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Previewing {label} · nothing is sent or saved</span>
          </p>
          <DialogClose className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white" data-testid="booking-preview-close">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-card px-5 py-4">
          <BookingWizard form={preview} onSubmit={pretend} remember={null} preview />
        </div>
      </DialogContent>
    </Dialog>
  );
}
