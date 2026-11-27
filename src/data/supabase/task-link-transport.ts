import type { ItemOpenings, PublicItemPayload } from "@/domain";
import type { TaskLinkTransport } from "@/services";
import { callApi } from "./api-call";

/** A booking's task link against Supabase: the server checks the signature and reads the task (src/app/api/booking-link). */
export class HttpTaskLinkTransport implements TaskLinkTransport {
  async open(token: string): Promise<PublicItemPayload> {
    return callApi<PublicItemPayload>(`/api/booking-link/${encodeURIComponent(token)}`, { method: "GET" }, { auth: "optional" });
  }

  /** Signed in or not: the server answers for whoever's session comes with it. */
  async openings(token: string): Promise<ItemOpenings> {
    return callApi<ItemOpenings>(`/api/booking-link/${encodeURIComponent(token)}/openings`, { method: "GET" }, { auth: "optional" });
  }
}
