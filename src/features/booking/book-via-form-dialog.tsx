"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPen, LoaderCircle } from "lucide-react";
import * as React from "react";
import { InlineRichText } from "@/components/shared/inline-rich-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { bookingHeaderOf } from "@/domain";
import { RmitPixel } from "@/features/auth/components/auth-shell";
import { useCurrentUser } from "@/features/auth/auth-context";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useServices } from "@/features/data/data-context";
import { usePortalOverview } from "@/features/portal/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

/**
 * Whether the workspace's booking form is taking requests: its own switch,
 * whether or not the portal is open. Null until that is known, so a button that depends on it waits
 * rather than showing the other choice first; false if it cannot be read.
 */
export function useBookingFormOpen(): boolean | null {
  const overview = usePortalOverview();
  if (overview.isPending) return null;
  const portal = overview.data?.portal;
  return !!portal && portal.allowBooking;
}

/**
 * The booking form as a pop-up over the page, for a member: the same form the
 * booking page shows (the same wizard, filled in from their account), without
 * the brand panel beside it. Closing it leaves the page as it was; a booking
 * made in it lands where any booking would, and the board behind refreshes.
 */
export function BookViaFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0" data-testid="book-via-form">
        {open && <BookViaFormBody />}
      </DialogContent>
    </Dialog>
  );
}

function BookViaFormBody() {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const slug = ws.slug;
  const form = useQuery({
    queryKey: queryKeys.bookingForm(slug, null),
    queryFn: () => services.booking.getForm({ workspaceSlug: slug, key: null }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const header = form.data ? bookingHeaderOf(form.data.template, form.data.workspaceName) : null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-6 py-4 pr-12">
        <RmitPixel className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <DialogTitle className="truncate text-[15px] font-semibold tracking-tight">{header?.title ?? "Booking form"}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            <InlineRichText text={header?.subtitle ?? ""} />
            {header ? ` · signed in as ${user.firstName}` : ""}
          </DialogDescription>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {form.isLoading ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
          </p>
        ) : form.isError || !form.data ? (
          <p className="text-[13px] text-destructive">{form.error instanceof Error ? form.error.message : "The form could not be opened."}</p>
        ) : (
          <BookingWizard
            key={user.id}
            form={form.data}
            account={{ name: user.displayName, email: user.email, title: user.jobTitle, avatar: user }}
            signInHref={null}
            defaults={{ requesterName: user.displayName, requesterEmail: user.email, department: user.stakeholderGroup ?? user.department ?? "" }}
            remember={null}
            onSubmit={(request) => services.booking.submit({ workspaceSlug: slug, key: null, request, actorId: user.id })}
            lookupRequester={(email) => services.booking.lookupRequester({ workspaceSlug: slug, key: null, email })}
            pastBookings={(email) => services.booking.pastBookings({ workspaceSlug: slug, key: null, email })}
            itemHref={(receipt) => routes.board(slug, receipt.boardSlug, { itemId: receipt.itemId })}
            // The board behind shows the new task as soon as it exists, and the
            // sidebar counts it (on Task Allocation, or the team's board it skipped to).
            onBooked={() => {
              void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
              void queryClient.invalidateQueries({ queryKey: ["board-item-count"] });
            }}
          />
        )}
      </div>
    </>
  );
}

/** Holds the button's place while it is not yet known which one shows, so the toolbar does not jump. */
export function BookViaFormPlaceholder() {
  return (
    <Button size="sm" className="invisible" aria-hidden tabIndex={-1} data-testid="book-via-form-pending">
      <ClipboardPen /> Book via form
    </Button>
  );
}

/** "Book via form" in place of New Item, on Task Allocation while the form takes requests. */
export function BookViaFormButton({ size = "sm", className, testId = "book-via-form-button" }: { size?: "sm" | "default"; className?: string; testId?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size={size} className={className} onClick={() => setOpen(true)} data-testid={testId}>
        <ClipboardPen /> Book via form
      </Button>
      <BookViaFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
