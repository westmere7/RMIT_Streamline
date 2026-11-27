import type { BookingReceipt, BookingRequest, BookingSendBack } from "@/domain";
import type { ResubmitForm, SendBackTransport } from "@/services";
import { callApi } from "./api-call";

/**
 * Send-backs against Supabase go through the app's route handlers
 * (src/server/send-back.ts): the team's with their session, the requester's
 * with the token from their link and no session at all.
 */
export class HttpSendBackTransport implements SendBackTransport {
  async send(input: { itemId: string; note: string }): Promise<BookingSendBack> {
    return callApi<BookingSendBack>("/api/booking-send-back", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }

  async cancel(input: { itemId: string }): Promise<void> {
    await callApi<{ ok: true }>("/api/booking-send-back/cancel", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }

  async reset(input: { itemId: string }): Promise<void> {
    await callApi<{ ok: true }>("/api/booking-reset", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }

  async open(input: { token: string }): Promise<ResubmitForm> {
    return callApi<ResubmitForm>(`/api/booking-resubmit/${encodeURIComponent(input.token)}`, { method: "GET" }, { auth: "optional" });
  }

  async resubmit(input: { token: string; request: BookingRequest; reply: string }): Promise<BookingReceipt> {
    return callApi<BookingReceipt>(`/api/booking-resubmit/${encodeURIComponent(input.token)}`, { method: "POST", body: JSON.stringify({ request: input.request, reply: input.reply }) }, { auth: "optional" });
  }
}
