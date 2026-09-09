import { z } from "zod";
import type { BoardShareGate, PublicBoardPayload, PublicItemPayload } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gateShare, loadSharedBoard, ShareAccessError, type ShareViewer } from "@/services/board-share-service";
import { gateItemShare, loadSharedItem } from "@/services/item-share-service";

/**
 * Shared boards for the Supabase provider.
 *
 * A visitor has no account, so RLS has nobody to reason about and the read runs
 * with the service role. The token is the whole of the authorisation, and it
 * only ever reaches loadSharedBoard, which returns one board and refuses
 * everything else. Nothing here writes.
 */

export const sharePasswordSchema = z.object({ password: z.string().max(200).nullable().optional() });

export async function loadShareGate(token: string): Promise<BoardShareGate> {
  return gateShare(serviceRoleRepositories(), token);
}

export async function loadShareBoard(token: string, password: string | null, viewer: ShareViewer | null): Promise<PublicBoardPayload> {
  return loadSharedBoard(serviceRoleRepositories(), token, password, viewer);
}

export async function loadShareItemGate(token: string): Promise<BoardShareGate> {
  return gateItemShare(serviceRoleRepositories(), token);
}

export async function loadShareItem(token: string, password: string | null, viewer: ShareViewer | null): Promise<PublicItemPayload> {
  return loadSharedItem(serviceRoleRepositories(), token, password, viewer);
}

/**
 * Who is knocking, when anyone says so.
 *
 * A public link needs nobody; a private one needs a signed-in member of the
 * workspace the link belongs to. The bearer token is verified with the admin
 * client — the same way the onboarding routes identify their caller — and a
 * missing or stale one simply means "not signed in", which the caller turns
 * into the sign-in message.
 */
export async function shareViewer(request: Request): Promise<ShareViewer | null> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return null;
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  const membership = await admin.from("workspace_members").select("status").eq("user_id", data.user.id).eq("status", "ACTIVE").limit(1);
  return { userId: data.user.id, isWorkspaceMember: (membership.data?.length ?? 0) > 0 };
}

/** The status a refused visit deserves: a wrong password or a missing sign-in is 401, a dead link is 404. */
export function shareErrorStatus(error: ShareAccessError): number {
  return error.reason === "password" || error.reason === "signin" ? 401 : 404;
}

function serviceRoleRepositories() {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createSupabaseRepositories();
}
