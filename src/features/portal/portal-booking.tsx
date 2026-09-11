"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";

/**
 * Booking from inside the portal, over the top of it.
 *
 * An overlay rather than a second page, because booking is something done and
 * then finished with: the work the visitor was reading is still behind it, and
 * closing puts them back exactly where they were. It is the same wizard the
 * public link serves, with two differences that matter.
 *
 * Who the request is for is a question inside step one — a dropdown beside the
 * other things about the requester — and not a gate in front of the form.
 * Whatever is chosen is sent as an id and checked again on the server against
 * this workspace's own departments, so nothing here can point a booking at
 * another stakeholder.
 *
 * The submission key is made once and reused for every attempt of the same
 * booking. That is what makes a double tap or a retry after a dropped
 * connection resolve to one task: the server replays the first receipt rather
 * than booking again. A new key is only minted after one has been accepted.
 */
export function PortalBookingDialog({
  open,
  onOpenChange,
  credentials,
  stakeholder,
  stakeholders,
  onView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: PortalCredentials;
  /** Who the request will be for, as the portal currently has it. */
  stakeholder: PortalStakeholderOption | null;
  /** Everyone this link serves, for step one's own question. */
  stakeholders: PortalStakeholderOption[];
  /** Opens the request that was just booked. */
  onView: (itemId: string) => void;
}) {
  const services = useServices();
  // Some stakeholders do have an account here. If they are signed in the wizard
  // fills their details in, and they can still type over them.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email } : null;
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the ticket can offer somewhere to go. The wizard keeps showing its
  // own ticket; closing the moment a booking lands would take the reference off
  // the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);
  /**
   * Who this particular request is for.
   *
   * The form's own answer, not the portal's filter: changing it here must not
   * quietly re-filter the board the visitor was reading behind the dialog. It
   * starts on whichever stakeholder the portal is showing — the Marketing
   * portal opens the form on Marketing — and in time will start instead on the
   * department recorded against the requester's own account.
   */
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const forId = chosenId ?? stakeholder?.id ?? null;
  const forStakeholder = stakeholders.find((s) => s.id === forId) ?? null;

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
    enabled: open,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setBooked(null);
          // Next time it opens it starts on whoever the portal is showing.
          setChosenId(null);
        }
      }}
    >
      <DialogContent size="xl" className="flex max-h-[92vh] flex-col p-0" overlayClassName="booking-ground backdrop-blur-sm" data-testid="portal-book">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-3">
          <DialogTitle>Book a task</DialogTitle>
          <DialogDescription>Tell us what you need. Your request appears in the list as soon as it is in.</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-card px-5 py-4">
          {form.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
            </div>
          ) : form.isError || !form.data ? (
            <ErrorState title="Could not load the booking form." error={form.error} onRetry={() => form.refetch()} />
          ) : (
            <>
              {/* No account is needed to book. One just saves answering the
                  questions the app can answer for itself. */}
              {!account && (
                <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground" data-testid="portal-signin-hint">
                  <LogIn className="size-3.5 shrink-0" aria-hidden />
                  Work here and have a Streamline account?
                  <a href={signInHref} className="font-medium text-foreground underline-offset-4 hover:underline">
                    Sign in
                  </a>
                  and we will fill your details in.
                </p>
              )}
              <BookingWizard
                form={form.data}
                account={account}
                signInHref={account ? null : signInHref}
                // The free-text department is not a question here: the server
                // takes it from the stakeholder either way, and a box for it
                // invited an answer that was then thrown away.
                omit={["department"]}
                stakeholders={stakeholders}
                stakeholderId={forId}
                onStakeholder={setChosenId}
                // Scoped to the link, not to the browser: one machine may be
                // used to book for two departments, and the person doing it is
                // not always the same one. Nothing of this leaves the machine.
                remember={account ? null : `portal:${credentials.token}`}
                onSubmit={async (request) => {
                  if (!forStakeholder) throw new Error("Say who this request is for.");
                  return services.portals.publicBook(credentials, submissionKey, request, forStakeholder.id, services.booking);
                }}
                // Nothing here links into the application: a stakeholder has no
                // account and the board is not theirs to open.
                itemHref={() => null}
                onBooked={(receipt) => {
                  // The booking is in, so the next one is a different booking.
                  setSubmissionKey(newSubmissionKey());
                  setBooked(receipt.itemId);
                }}
              />
              {booked && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      onView(booked);
                      setBooked(null);
                    }}
                    data-testid="portal-view-request"
                  >
                    View request
                  </Button>
                  <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="portal-back-to-tasks">
                    Back to our tasks
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
