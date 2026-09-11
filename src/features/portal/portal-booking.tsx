"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LogIn } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData } from "@/domain";
import { BookingForm } from "@/features/booking/booking-form";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";

/**
 * Booking from inside a department's portal.
 *
 * The same form the public link and the in-app page use — its questions, its
 * validation, its templates, its deliverable lines — with two differences that
 * matter.
 *
 * The department is not a question. It is settled by the link, shown as context,
 * and resolved again on the server from the credential, so nothing typed here
 * can point a booking at another department.
 *
 * The submission key is made once and reused for every attempt of the same
 * booking. That is what makes a double tap or a retry after a dropped
 * connection resolve to one task: the server replays the first receipt rather
 * than booking again. A new key is only minted after one has been accepted.
 */
export function PortalBooking({
  credentials,
  departmentName,
  onView,
  onBackToTasks,
}: {
  credentials: PortalCredentials;
  departmentName: string;
  /** Opens the request that was just booked. */
  onView: (itemId: string) => void;
  onBackToTasks: () => void;
}) {
  const services = useServices();
  // Some stakeholders do have an account here. If they are signed in the form
  // takes their name and their email from it and stops asking.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email } : null;
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the receipt can offer somewhere to go. The form keeps showing its
  // own receipt; navigating away from it the moment a booking lands would take
  // the reference off the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
  });

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
    // page behind it stays put and the bar at the foot of the form is always
    // on screen — the whole canvas scrolling was what took the button away.
    // As tall as the form is, and no taller than the window: a card stretched
    // to the full height left a hand's width of empty card under the last
    // question, and the bar sitting at the bottom of that looked adrift.
    <section className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm" data-testid="portal-book">
      <div className="scrollbar-thin flex min-h-0 flex-col overflow-y-auto p-5 sm:p-7">
      <p className="mb-4 text-[13px] text-muted-foreground">
        {/* A department whose name already ends in a full stop ("Comm.") must
            not get a second one. The sentence break belongs to the sentence,
            not to the name. */}
        Booking as <strong className="font-semibold text-foreground">{departmentName}</strong>
        {departmentName.trim().endsWith(".") ? "" : "."} Your request appears under Our tasks as soon as it is in.
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
      <BookingForm
        form={form.data}
        // The department is context, not an answer: the server takes it from
        // the link either way, and offering a box would imply otherwise. The
        // default is still set, so a template that shows the department
        // somewhere other than a question has the right value to show.
        account={account}
        signInHref={account ? null : signInHref}
        defaults={{ department: departmentName }}
        omit={["department"]}
        // Scoped to the link, not to the browser: one machine may be used to
        // book for two departments, and the person doing it is not always the
        // same one. Nothing of this leaves the machine.
        // A signed-in person is known to the app; nobody else's details are
        // kept anywhere but their own browser.
        remember={account ? null : `portal:${credentials.token}`}
        onSubmit={(request) => services.portals.publicBook(credentials, submissionKey, request, services.booking)}
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
