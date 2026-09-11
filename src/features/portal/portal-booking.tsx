"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LogIn, TriangleAlert } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { BookingForm } from "@/features/booking/booking-form";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";

/**
 * Booking from inside the portal.
 *
 * The same form the public link and the in-app page use — its questions, its
 * validation, its templates, its deliverable lines — with two differences that
 * matter.
 *
 * The stakeholder is not a question. It is the one selected at the top of the
 * portal, sent as an id and checked again on the server against the workspace's
 * own departments, so nothing typed here can point a booking at another
 * stakeholder.
 *
 * The submission key is made once and reused for every attempt of the same
 * booking. That is what makes a double tap or a retry after a dropped
 * connection resolve to one task: the server replays the first receipt rather
 * than booking again. A new key is only minted after one has been accepted.
 *
 * The form itself is still the one written for a portal that served a single
 * department, which is why it is behind a warning: it asks its questions as
 * though the stakeholder were settled by the link, and it is the next thing to
 * be rebuilt. The gate is deliberately in the way rather than a banner beside
 * it — a warning nobody has to act on is a warning nobody reads.
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
  const [acknowledged, setAcknowledged] = React.useState(false);
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

  // Nothing may be booked until it is clear who it is for. One portal serves
  // every stakeholder, so with none selected there is no answer to write on the
  // request — and a booking that landed against nobody would show up in nobody's
  // list, which is worse than being asked to choose.
  if (!stakeholder || !acknowledged) {
    return (
      <section className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 text-amber-950 sm:p-7 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" data-testid="portal-book-gate">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          This form is being rebuilt
        </h2>
        <p className="mt-2 max-w-prose text-[13px]">
          The portal now shows every stakeholder&rsquo;s work in one place, and the booking form has not caught up: it still asks its questions as though one link meant one
          stakeholder. It works, and what you send will reach the team — but expect it to look different shortly.
        </p>
        {stakeholder ? (
          <p className="mt-3 text-[13px]">
            This request will be booked for <strong className="font-semibold">{stakeholder.name}</strong>.
          </p>
        ) : (
          <p className="mt-3 text-[13px]" data-testid="portal-book-needs-stakeholder">
            Pick a stakeholder at the top of the page first, so the request is raised for somebody. While the portal is showing the full creative team there is nobody to
            book it for.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!stakeholder} onClick={() => setAcknowledged(true)} data-testid="portal-book-continue">
            Continue to the form
          </Button>
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
    // page behind it stays put and the bar at the foot of the form is always
    // on screen — the whole canvas scrolling was what took the button away.
    // As tall as the form is, and no taller than the window: a card stretched
    // to the full height left a hand's width of empty card under the last
    // question, and the bar sitting at the bottom of that looked adrift.
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
      <BookingForm
        form={form.data}
        // The department is context, not an answer: the server takes it from
        // the link either way, and offering a box would imply otherwise. The
        // default is still set, so a template that shows the department
        // somewhere other than a question has the right value to show.
        account={account}
        signInHref={account ? null : signInHref}
        defaults={{ department: stakeholder.name }}
        omit={["department"]}
        // Scoped to the link, not to the browser: one machine may be used to
        // book for two departments, and the person doing it is not always the
        // same one. Nothing of this leaves the machine.
        // A signed-in person is known to the app; nobody else's details are
        // kept anywhere but their own browser.
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
