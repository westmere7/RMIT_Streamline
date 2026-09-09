"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData } from "@/domain";
import { BookingForm } from "@/features/booking/booking-form";
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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" data-testid="portal-book">
      <p className="mb-4 text-[13px] text-muted-foreground">
        Booking as <strong className="font-semibold text-foreground">{departmentName}</strong>. Your request appears under Our tasks as soon as it is in.
      </p>
      <BookingForm
        form={form.data}
        // The department is context, not an answer: the server takes it from
        // the link either way, and offering a box would imply otherwise.
        defaults={{ department: departmentName }}
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
    </section>
  );
}
