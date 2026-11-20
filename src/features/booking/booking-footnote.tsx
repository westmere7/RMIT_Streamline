"use client";

import { format } from "date-fns";
import type { BookingForm } from "@/domain";

/**
 * The small print at the foot of a booking page: whose form it is, and under
 * it, smaller still, which form is live and since when, so anyone asked "which
 * version did you fill in?" can say.
 */
export function BookingFootnote({ team, form }: { team: string; form: Pick<BookingForm, "formName" | "publishedAt"> | null }) {
  const published = form?.publishedAt ? new Date(form.publishedAt) : null;
  const when = published && !Number.isNaN(published.getTime()) ? format(published, "d MMM yyyy, HH:mm") : null;
  return (
    <>
      {team} · Streamline
      {when && (
        <span className="mt-0.5 block text-[10px] text-white/35" data-testid="booking-form-version">
          {form?.formName?.trim() || "Booking form"} · {when}
        </span>
      )}
    </>
  );
}
