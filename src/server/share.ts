import { z } from "zod";
import type { BoardShareGate, PublicBoardPayload } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gateShare, loadSharedBoard, ShareAccessError } from "@/services/board-share-service";

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

export async function loadShareBoard(token: string, password: string | null): Promise<PublicBoardPayload> {
  return loadSharedBoard(serviceRoleRepositories(), token, password);
}

/** The status a refused visit deserves: a wrong password is 401, a dead link is 404. */
export function shareErrorStatus(error: ShareAccessError): number {
  return error.reason === "password" ? 401 : 404;
}

function serviceRoleRepositories() {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createSupabaseRepositories();
}
