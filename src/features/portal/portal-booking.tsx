"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { usePageZoom, useVisitorScale, ViewControls } from "@/components/shared/view-controls";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { DEFAULT_BOOKING_HEADLINE, DEFAULT_BOOKING_LEAD, bookingHeaderOf } from "@/domain";
import { AuthShell, RmitPixel } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { BookingFootnote } from "@/features/booking/booking-footnote";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";
import { usePortalThemeControl } from "@/features/portal/portal-shell";

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
  headline,
  lead,
  offerSignIn = true,
  scale: teamScale = 100,
  scaleSwitch = true,
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
  /** The team's own words for the brand panel; null keeps the built-in ones. */
  headline?: string | null;
  lead?: string | null;
  /** Whether staff are offered a sign-in that fills their details in. */
  offerSignIn?: boolean;
  /** The interface size the team set for this form, in percent. */
  scale?: number;
  /** Whether the visitor may change that size for themselves. */
  scaleSwitch?: boolean;
  /** Opens the request that was just booked, on the board. */
  onView: (itemId: string) => void;
  /** Back to the board without booking, or once the ticket has been read. */
  onClose: () => void;
}) {
  const services = useServices();
  const queryClient = useQueryClient();
  // The size the team set for this form, or the visitor's own where the link lets them choose.
  const scaleControl = useVisitorScale(`streamline.portal-scale:${credentials.token}`, teamScale, scaleSwitch);
  const scale = scaleControl.value;
  usePageZoom(scale);
  const themeControl = usePortalThemeControl();
  // Some stakeholders do have an account here. If they are signed in the wizard
  // fills their details in, and they can still type over them.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email, title: auth.user.jobTitle, avatar: auth.user } : null;
  // The account's own department is not offered as a default here: this link
  // is somebody else's, and the request is for whoever it is showing.
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the ticket can offer somewhere to go. The wizard keeps showing its
  // own receipt; leaving the moment a booking lands would take the ticket off
  // the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);
  /**
   * Who the request is for is the form's own department question — the same
   * control, from the same list, as every other booking page — and it starts
   * on whichever department the portal was showing. The chosen name goes with
   * the id the portal has for it. A department with no work yet is not among
   * the portal's filters and has no id here; the server finds it on the list
   * by name instead.
   */
  const stakeholderFor = (name: string | null) => stakeholders?.find((s) => s.name === (name ?? "").trim()) ?? null;

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <AuthShell
      headline={headline || DEFAULT_BOOKING_HEADLINE}
      lead={lead || DEFAULT_BOOKING_LEAD}
      footnote={<BookingFootnote team={creativeTeamName} form={form.data ?? null} />}
      cardTestId="portal-book"
      progress={form.isLoading || stakeholders === null}
      width="2xl"
      fill
      scale={scale / 100}
      extras={(tone) => <ViewControls tone={tone} theme={themeControl} scale={scaleSwitch ? scaleControl : null} />}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-7 py-4 sm:px-8">
        <RmitPixel className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight">{bookingHeaderOf(form.data?.template, portalName).title}</p>
          <p className="text-xs text-muted-foreground">
            {bookingHeaderOf(form.data?.template, portalName).subtitle}
            {account ? ` · signed in as ${account.name}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="portal-book-close">
          <ArrowLeft /> Back to Portal
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
            {!account && offerSignIn && (
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
              signInHref={account || !offerSignIn ? null : signInHref}
              // Opens on the department the portal was showing; the visitor may change it.
              defaults={{ department: stakeholder?.name ?? "" }}
              // Scoped to the link, not to the browser: one machine may be
              // used to book for two departments, and the person doing it is
              // not always the same one. Nothing of this leaves the machine.
              remember={account ? null : `portal:${credentials.token}`}
              lookupRequester={(email) => services.portals.publicLookupRequester(credentials, email, services.booking)}
              onSubmit={async (request) => {
                if (!request.department?.trim()) throw new Error("Pick which department this is for.");
                return services.portals.publicBook(credentials, submissionKey, request, stakeholderFor(request.department)?.id ?? null, services.booking);
              }}
              // Nothing here links into the application: a stakeholder has no
              // account and the board is not theirs to open.
              itemHref={() => null}
              onBooked={(receipt) => {
                // The booking is in, so the next one is a different booking.
                setSubmissionKey(newSubmissionKey());
                setBooked(receipt.itemId);
                // The board this page read before the booking does not have it.
                // Read it again now, while the receipt is being read, so that
                // "View request" opens on a board the new task is already on.
                void queryClient.invalidateQueries({ queryKey: ["portal-board", credentials.token] });
              }}
            />
            {booked && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button onClick={() => onView(booked)} data-testid="portal-view-request">
                  View request
                </Button>
                <Button variant="outline" onClick={onClose} data-testid="portal-back-to-tasks">
                  Back to Portal
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
