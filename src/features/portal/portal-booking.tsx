"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";

/**
 * Booking from inside the portal.
 *
 * The same four-step wizard the public link and the in-app page use — its
 * questions, its service types, its validation, its deliverable lines — with
 * two differences that matter.
 *
 * The stakeholder is not a question. It is the one selected at the top of the
 * portal, sent as an id and checked again on the server against the workspace's
 * own departments, so nothing typed here can point a booking at another
 * stakeholder. Until one is chosen there is nothing to book against, and the
 * wizard does not open: a request raised for nobody shows up in nobody's list,
 * which is worse than being asked to choose.
 *
 * The submission key is made once and reused for every attempt of the same
 * booking. That is what makes a double tap or a retry after a dropped
 * connection resolve to one task: the server replays the first receipt rather
 * than booking again. A new key is only minted after one has been accepted.
 */
export function PortalBooking({
  credentials,
  stakeholder,
  onView,
  onBackToTasks,
}: {
  credentials: PortalCredentials;
  /** Who the request will be for. Null while the portal is showing everybody. */
  stakeholder: PortalStakeholderOption | null;
  /** Opens the request that was just booked. */
  onView: (itemId: string) => void;
  onBackToTasks: () => void;
}) {
  const services = useServices();
  // Some stakeholders do have an account here. If they are signed in the wizard
  // takes their name and their email from it and stops asking.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email } : null;
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the receipt can offer somewhere to go. The wizard keeps showing its
  // own ticket; navigating away from it the moment a booking lands would take
  // the reference off the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
    enabled: !!stakeholder,
  });

  if (!stakeholder) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" data-testid="portal-book-gate">
        <h2 className="text-[15px] font-semibold tracking-tight">Who is this request for?</h2>
        <p className="mt-2 max-w-prose text-[13px] text-muted-foreground" data-testid="portal-book-needs-stakeholder">
          Pick a stakeholder at the top of the page first. This one link serves all of them, so while it is showing the whole creative team there is nobody to raise the
          request for.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={onBackToTasks}>
            Back to our tasks
          </Button>
        </div>
      </section>
    );
  }

  if (form.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
      </div>
    );
  }
  if (form.isError || !form.data) {
    return <ErrorState title="Could not load the booking form." error={form.error} onRetry={() => form.refetch()} />;
  }

  return (
    // The card owns the height it is given and scrolls inside itself, so the
    // page behind it stays put and the bar at the foot of the wizard is always
    // on screen — the whole canvas scrolling was what took the button away.
    <section className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm" data-testid="portal-book">
      <div className="scrollbar-thin flex min-h-0 flex-col overflow-y-auto p-5 sm:p-7">
        <p className="mb-4 text-[13px] text-muted-foreground">
          {/* A stakeholder whose name already ends in a full stop ("Comm.") must
              not get a second one. The sentence break belongs to the sentence,
              not to the name. */}
          Booking for <strong className="font-semibold text-foreground">{stakeholder.name}</strong>
          {stakeholder.name.trim().endsWith(".") ? "" : "."} Your request appears in the list as soon as it is in.
        </p>
        {/* No account is needed to book. One just saves answering the two
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
          // The department is context, not an answer: the server takes it from
          // the link either way, and offering a box would imply otherwise.
          defaults={{ department: stakeholder.name }}
          omit={["department"]}
          // Scoped to the link, not to the browser: one machine may be used to
          // book for two departments, and the person doing it is not always the
          // same one. Nothing of this leaves the machine. A signed-in person is
          // known to the app; nobody else's details are kept anywhere but their
          // own browser.
          remember={account ? null : `portal:${credentials.token}`}
          onSubmit={(request) => services.portals.publicBook(credentials, submissionKey, request, stakeholder.id, services.booking)}
          // Nothing here links into the application: a stakeholder has no account
          // and the board is not theirs to open.
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
            <Button variant="outline" onClick={onBackToTasks} data-testid="portal-back-to-tasks">
              Back to our tasks
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
