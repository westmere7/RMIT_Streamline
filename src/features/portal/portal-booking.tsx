"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { AuthShell, BrandMark } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";

/**
 * Booking from the portal, on the booking page.
 *
 * The same page a stakeholder's direct booking link opens and a member's "book
 * a task" opens: the brand frame, the form in the card. It used to be a dialog
 * over the board, which made a third look for the same form; now the board
 * steps aside and comes back when the booking is done or abandoned.
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
export function PortalBookingScreen({
  credentials,
  portalName,
  creativeTeamName,
  stakeholder,
  stakeholders,
  onView,
  onClose,
}: {
  credentials: PortalCredentials;
  portalName: string;
  creativeTeamName: string;
  /** Who the request will be for, as the portal currently has it. */
  stakeholder: PortalStakeholderOption | null;
  /** Every department this link serves, for step one's own question. Null until the portal has read them. */
  stakeholders: PortalStakeholderOption[] | null;
  /** Opens the request that was just booked, on the board. */
  onView: (itemId: string) => void;
  /** Back to the board without booking, or once the ticket has been read. */
  onClose: () => void;
}) {
  const services = useServices();
  // Some stakeholders do have an account here. If they are signed in the wizard
  // fills their details in, and they can still type over them.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email, title: auth.user.jobTitle, avatar: auth.user } : null;
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the ticket can offer somewhere to go. The wizard keeps showing its
  // own ticket; leaving the moment a booking lands would take the reference off
  // the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);
  /**
   * Who this particular request is for.
   *
   * The form's own answer, not the portal's filter: changing it here must not
   * quietly re-filter the board the visitor was reading. It starts on whichever
   * stakeholder the portal is showing — the Marketing portal opens the form on
   * Marketing.
   */
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const forId = chosenId ?? stakeholder?.id ?? null;
  const forStakeholder = stakeholders?.find((s) => s.id === forId) ?? null;

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <AuthShell headline="Book a task with the creative team." lead="Tell us what you need and when. We route it to the right people and keep you posted — no account needed." footnote={`${creativeTeamName} · Streamline`} cardTestId="portal-book" progress={form.isLoading || stakeholders === null} width="2xl" fill>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-7 py-4 sm:px-8">
        <BrandMark className="size-9 rounded-lg text-sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight">{portalName}</p>
          <p className="text-xs text-muted-foreground">Task booking{account ? ` · signed in as ${account.name}` : ""}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="portal-book-close">
          <ArrowLeft /> Back to our tasks
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6 sm:px-8">
        {/* The frame is on screen at once; the form waits inside it until both
            the questions and the departments are known, so nothing pops in
            under a visitor who has started reading. */}
        {form.isLoading || (stakeholders === null && !form.isError) ? (
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
              // The department is not a free question here: who the request is
              // for is asked as a stakeholder, and the server takes the
              // department from that.
              omit={["department"]}
              stakeholders={stakeholders ?? []}
              stakeholderId={forId}
              onStakeholder={setChosenId}
              // Scoped to the link, not to the browser: one machine may be
              // used to book for two departments, and the person doing it is
              // not always the same one. Nothing of this leaves the machine.
              remember={account ? null : `portal:${credentials.token}`}
              onSubmit={async (request) => {
                if (!forStakeholder) throw new Error("Say which department this is for.");
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
                <Button onClick={() => onView(booked)} data-testid="portal-view-request">
                  View request
                </Button>
                <Button variant="outline" onClick={onClose} data-testid="portal-back-to-tasks">
                  Back to our tasks
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
