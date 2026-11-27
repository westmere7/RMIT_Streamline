import type { PublicItemPayload } from "@/domain";
import type { TaskLinkTransport } from "@/services";
import { callApi } from "./api-call";

/** A booking's task link against Supabase: the server checks the signature and reads the task (src/app/api/booking-link). */
export class HttpTaskLinkTransport implements TaskLinkTransport {
  async open(token: string): Promise<PublicItemPayload> {
    return callApi<PublicItemPayload>(`/api/booking-link/${encodeURIComponent(token)}`, { method: "GET" }, { auth: "optional" });
  }
}
