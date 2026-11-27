import { hmacHex, type TaskLinkSigner } from "@/services";
import { HttpError } from "./http";

/**
 * The server's signer for a booking's task link (src/domain/booking/task-link.ts).
 *
 * BOOKING_LINK_SECRET when it is set; otherwise one derived from the service
 * role key, which every server already holds and no browser ever sees. Links
 * stay the same for as long as the secret does: change it (or rotate the
 * service key without setting BOOKING_LINK_SECRET) and every link changes.
 */
export function serverTaskLinkSigner(): TaskLinkSigner {
  const own = process.env.BOOKING_LINK_SECRET?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const secret = own || (key ? `streamline-booking-task-link|${key}` : "");
  return async (itemId) => {
    if (!secret) throw new HttpError(503, "Task links are not configured on this server.");
    return hmacHex(secret, itemId);
  };
}
