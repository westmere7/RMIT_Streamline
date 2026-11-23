import type { Board, BookingForm, BookingPastSummary, BookingReceipt, Item } from "@/domain";
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

  async lookupRequester(input: { workspaceSlug: string; key: string | null; email: string }): Promise<string | null> {
    const found = await callApi<{ name: string | null }>(
      `/api/book/${encodeURIComponent(input.workspaceSlug)}/requester`,
      { method: "POST", body: JSON.stringify({ key: input.key, email: input.email }) },
      { auth: "optional" },
    );
    return found.name;
  }

  async pastBookings(input: { workspaceSlug: string; key: string | null; email: string }): Promise<BookingPastSummary[]> {
    const found = await callApi<{ bookings: BookingPastSummary[] }>(
      `/api/book/${encodeURIComponent(input.workspaceSlug)}/past`,
      { method: "POST", body: JSON.stringify({ key: input.key, email: input.email }) },
      { auth: "optional" },
    );
    return found.bookings;
  }

  /** Allocating goes through src/app/api/allocate (src/server/allocation.ts), with the member's session. */
  async allocate(input: { itemId: string; boardId: string; groupId?: string | null }): Promise<{ item: Item; board: Board }> {
    return callApi<{ item: Item; board: Board }>("/api/allocate", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }

  async submit(input: BookingSubmission): Promise<BookingReceipt> {
    return callApi<BookingReceipt>(
      `/api/book/${encodeURIComponent(input.workspaceSlug)}`,
      { method: "POST", body: JSON.stringify({ key: input.key, request: input.request }) },
      { auth: "optional" },
    );
  }
}
