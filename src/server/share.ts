import { z } from "zod";
import type { BoardShare, BoardShareGate, PublicBoardPayload, PublicItemPayload } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gateShare, loadSharedBoardIfChanged, ShareAccessError, type ShareRefreshAnswer, type ShareViewer } from "@/services/board-share-service";
import { gateItemShare, loadSharedItemIfChanged } from "@/services/item-share-service";
import { readWorkspaceRevision } from "./workspace-revision";

/**
 * Shared boards for the Supabase provider.
 *
 * A visitor has no account, so RLS has nobody to reason about and the read runs
 * with the service role. The token is the whole of the authorisation, and it
 * only ever reaches loadSharedBoard, which returns one board and refuses
 * everything else. Nothing here writes.
 */

export const sharePasswordSchema = z.object({
  password: z.string().max(200).nullable().optional(),
  /** The revision of what the page already holds, if anything; the answer may then be "unchanged". */
  revision: z.string().max(300).nullable().optional(),
});

/**
 * What a shared board or task depends on, as one string the page hands back
 * with its next refresh: the workspace's revision, which every table these
 * pages read bumps (0109, 0116, 0117), and the link itself (its row and its
 * last edit, expiry and access), so a link changed in Settings is read afresh.
 * The link's own checks run on every refresh whatever this says.
 */
async function shareRevision(workspaceId: string, share: Pick<BoardShare, "id" | "updatedAt" | "expiresAt" | "access">): Promise<string | null> {
  const revision = await readWorkspaceRevision(workspaceId);
  if (revision === null) return null;
  return [revision, `${share.id}:${share.updatedAt}`, share.expiresAt ?? "-", share.access].join("|");
}

export async function loadShareGate(token: string): Promise<BoardShareGate> {
  return gateShare(serviceRoleRepositories(), token);
}

export async function loadShareBoard(token: string, password: string | null, viewer: ShareViewer | null, known: string | null): Promise<ShareRefreshAnswer<PublicBoardPayload>> {
  return loadSharedBoardIfChanged(serviceRoleRepositories(), token, password, viewer, { known, current: shareRevision });
}

export async function loadShareItemGate(token: string): Promise<BoardShareGate> {
  return gateItemShare(serviceRoleRepositories(), token);
}

export async function loadShareItem(token: string, password: string | null, viewer: ShareViewer | null, known: string | null): Promise<ShareRefreshAnswer<PublicItemPayload>> {
  return loadSharedItemIfChanged(serviceRoleRepositories(), token, password, viewer, { known, current: shareRevision });
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
  // Every workspace they are active in: a private link opens only for members of its own.
  const membership = await admin.from("workspace_members").select("workspace_id").eq("user_id", data.user.id).eq("status", "ACTIVE");
  const workspaceIds = ((membership.data ?? []) as Array<{ workspace_id: string }>).map((row) => row.workspace_id);
  return { userId: data.user.id, isWorkspaceMember: workspaceIds.length > 0, workspaceIds };
}

/** The status a refused visit deserves: a wrong password or a missing sign-in is 401, a dead link is 404. */
export function shareErrorStatus(error: ShareAccessError): number {
  return error.reason === "password" || error.reason === "signin" ? 401 : 404;
}

function serviceRoleRepositories() {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createSupabaseRepositories();
}
