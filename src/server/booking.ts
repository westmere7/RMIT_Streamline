import { z } from "zod";
import type { BookingForm, BookingReceipt, BookingRequest } from "@/domain";
import { isPlausibleBookingKey } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices, type Services } from "@/services";
import { bookingRequestSchema } from "@/services/booking";
import { HttpError } from "./http";

/**
 * Task booking for the Supabase provider.
 *
 * A stakeholder has no account, and the board a booking lands on is visible to
 * admins alone, so the route handlers under src/app/api/book run the ordinary
 * repositories and services with the service role. Access is the key from the
 * public link, or — for the in-app form — the session of an active member.
 */

export const bookingBodySchema = z.object({
  key: z.string().max(80).nullable().optional(),
  request: bookingRequestSchema,
});

export async function loadBookingForm(request: Request, slug: string, key: string | null): Promise<BookingForm> {
  const { workspaceId } = await authorise(request, slug, key);
  return serverServices().booking.buildForm(workspaceId);
}

export async function submitBooking(request: Request, slug: string, key: string | null, booking: BookingRequest): Promise<BookingReceipt> {
  const { workspaceId, memberId } = await authorise(request, slug, key);
  return serverServices().booking.book(workspaceId, booking, memberId);
}

/** The services, pointed at the service-role client. Built per call; the client underneath is a singleton. */
function serverServices(): Services {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createServices(createSupabaseRepositories());
}

/**
 * Who may book: the holder of the workspace's current key, or a signed-in
 * active member. A member who books (with or without the key) is remembered as
 * `memberId`, so the item is recorded as theirs rather than the owner's.
 */
async function authorise(request: Request, slug: string, key: string | null): Promise<{ workspaceId: string; memberId: string | null }> {
  const admin = getSupabaseAdminClient();
  const found = await admin.from("workspaces").select("id, booking_key").eq("slug", slug).maybeSingle();
  if (found.error) throw new HttpError(500, `workspaces.bySlug: ${found.error.message}`);
  const workspace = found.data as { id: string; booking_key: string | null } | null;
  if (!workspace) throw new HttpError(404, "This booking link does not point at a workspace.");

  const keyOk = !!key && isPlausibleBookingKey(key) && !!workspace.booking_key && key === workspace.booking_key;
  if (key && !keyOk) throw new HttpError(403, "This booking link is no longer valid. Ask the team for the current one.");

  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) {
    if (keyOk) return { workspaceId: workspace.id, memberId: null };
    throw new HttpError(401, "Open the booking link the team sent you, or sign in to book from inside the app.");
  }
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) {
    if (keyOk) return { workspaceId: workspace.id, memberId: null };
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  const membership = await admin.from("workspace_members").select("status").eq("workspace_id", workspace.id).eq("user_id", data.user.id).maybeSingle();
  if (membership.error) throw new HttpError(500, `workspace_members.lookup: ${membership.error.message}`);
  const row = membership.data as { status: string } | null;
  const member = !!row && row.status === "ACTIVE";
  if (!member && !keyOk) throw new HttpError(403, "Only members of this workspace can book from inside the app.");
  return { workspaceId: workspace.id, memberId: member ? data.user.id : null };
}
