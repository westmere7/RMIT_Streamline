import type { BookingForm, BookingReceipt } from "@/domain";
import type { BookingSubmission, BookingTransport } from "@/services/booking-service";
import { callApi } from "./api-call";

/**
 * Booking against Supabase goes through the app's route handlers
 * (src/app/api/book/[slug]/route.ts, backed by src/server/booking.ts): a public
 * booking has no session, and writing to a board admins alone can see needs the
 * service role anyway. The key from the public link, when there is one, travels
 * in the query string / body; a signed-in member's session travels as a bearer
 * token instead, so the in-app form works without the key.
 */
export class HttpBookingTransport implements BookingTransport {
  async getForm(input: { workspaceSlug: string; key: string | null }): Promise<BookingForm> {
    const query = input.key ? `?key=${encodeURIComponent(input.key)}` : "";
    return callApi<BookingForm>(`/api/book/${encodeURIComponent(input.workspaceSlug)}${query}`, { method: "GET" }, { auth: "optional" });
  }

  async submit(input: BookingSubmission): Promise<BookingReceipt> {
    return callApi<BookingReceipt>(
      `/api/book/${encodeURIComponent(input.workspaceSlug)}`,
      { method: "POST", body: JSON.stringify({ key: input.key, request: input.request }) },
      { auth: "optional" },
    );
  }
}
