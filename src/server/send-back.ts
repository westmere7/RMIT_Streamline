import { z } from "zod";
import type { Board, BookingReceipt, BookingSendBack } from "@/domain";
import { RESUBMIT_REPLY_MAX, SEND_BACK_NOTE_MAX, isSendBackToken } from "@/domain";
import { buildPermissionContext, canEditBoard } from "@/lib/permissions/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SendBackLinkError, type ResubmitForm } from "@/services";
import { BookingValidationError } from "@/services/booking-service";
import { bookingRequestSchema } from "@/services/booking";
import { HttpError } from "./http";
import { portalServices } from "./portal";

/**
 * Sending a booked task back to its requester, for the Supabase provider.
 *
 * Nobody's session writes booking_sendbacks (policies/0040), so these run the
 * ordinary service with the service role:
 *
 *   - the team's two (send, cancel) after checking, as the app's own rule
 *     does, that the caller can edit the task's board;
 *   - the requester's two (open, resubmit) on the token alone. It is 32
 *     random characters, works once, and runs out after 14 days.
 */

export const sendBackBodySchema = z.object({ itemId: z.uuid(), note: z.string().max(SEND_BACK_NOTE_MAX + 200) });
export const cancelBodySchema = z.object({ itemId: z.uuid() });
export const resubmitBodySchema = z.object({ request: bookingRequestSchema, reply: z.string().max(RESUBMIT_REPLY_MAX + 200).optional() });

/** The signed-in caller, from their bearer token. */
async function caller(request: Request, doing: string): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, `Sign in to ${doing}.`);
  const { data, error } = await getSupabaseAdminClient().auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  return data.user.id;
}

interface BoardRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  owner_id: string;
  visibility: Board["visibility"];
  follows_team: boolean | null;
  edit_scope: Board["editScope"] | null;
  system: Board["system"] | null;
}

/** Refuses unless the caller can edit the board the task is on, by the app's own rule (as src/server/allocation.ts). */
async function requireEditor(userId: string, itemId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const item = await admin.from("items").select("id, board_id").eq("id", itemId).maybeSingle();
  if (item.error) throw new HttpError(500, `items.lookup: ${item.error.message}`);
  if (!item.data) throw new HttpError(404, "That task no longer exists.");
  const found = await admin.from("boards").select("id, workspace_id, team_id, owner_id, visibility, follows_team, edit_scope, system").eq("id", (item.data as { board_id: string }).board_id).maybeSingle();
  if (found.error) throw new HttpError(500, `boards.lookup: ${found.error.message}`);
  const board = found.data as BoardRow | null;
  if (!board) throw new HttpError(404, "That board no longer exists.");
  const [members, teamMembers, seats] = await Promise.all([
    admin.from("workspace_members").select("id, workspace_id, user_id, role, status").eq("workspace_id", board.workspace_id).eq("user_id", userId),
    admin.from("team_members").select("id, team_id, user_id, role").eq("user_id", userId),
    admin.from("board_members").select("id, board_id, user_id, role").eq("board_id", board.id).eq("user_id", userId),
  ]);
  for (const result of [members, teamMembers, seats]) if (result.error) throw new HttpError(500, `send-back.access: ${result.error.message}`);
  const ctx = buildPermissionContext({
    userId,
    workspaceMembers: ((members.data ?? []) as Array<{ id: string; workspace_id: string; user_id: string; role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST"; status: "ACTIVE" | "INVITED" | "DEACTIVATED" | "AWAITING_APPROVAL" }>).map((m) => ({
      id: m.id,
      workspaceId: m.workspace_id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      joinedAt: "",
    })),
    teamMembers: ((teamMembers.data ?? []) as Array<{ id: string; team_id: string; user_id: string; role: "LEAD" | "MEMBER" }>).map((m) => ({ id: m.id, teamId: m.team_id, userId: m.user_id, role: m.role })),
    boardMembers: ((seats.data ?? []) as Array<{ id: string; board_id: string; user_id: string; role: "OWNER" | "EDITOR" | "VIEWER" }>).map((m) => ({ id: m.id, boardId: m.board_id, userId: m.user_id, role: m.role })),
  });
  const allowed = canEditBoard(ctx, { id: board.id, ownerId: board.owner_id, visibility: board.visibility, teamId: board.team_id, system: board.system, followsTeam: board.follows_team ?? undefined, editScope: board.edit_scope ?? undefined });
  if (!allowed) throw new HttpError(403, "Only people who can edit this task can send it back.");
}

export async function sendBackRequest(request: Request, input: z.infer<typeof sendBackBodySchema>): Promise<BookingSendBack> {
  const userId = await caller(request, "send a task back");
  await requireEditor(userId, input.itemId);
  return portalServices().bookingSendBacks.send(input.itemId, input.note, userId);
}

export async function cancelSendBackRequest(request: Request, input: z.infer<typeof cancelBodySchema>): Promise<{ ok: true }> {
  const userId = await caller(request, "change this task");
  await requireEditor(userId, input.itemId);
  await portalServices().bookingSendBacks.cancel(input.itemId, userId);
  return { ok: true };
}

/** The requester's side: the status a link problem becomes, so the page can word it. */
function asLinkError(error: unknown): never {
  if (error instanceof SendBackLinkError) throw new HttpError(error.reason === "unknown" ? 404 : 410, error.message);
  if (error instanceof BookingValidationError) throw new HttpError(400, error.message);
  throw error;
}

export async function openResubmit(token: string): Promise<ResubmitForm> {
  if (!isSendBackToken(token)) throw new HttpError(404, "This link isn't valid. Check you have the whole address.");
  return portalServices().bookingSendBacks.open(token).catch(asLinkError);
}

export async function resubmitRequest(token: string, input: z.infer<typeof resubmitBodySchema>): Promise<BookingReceipt> {
  if (!isSendBackToken(token)) throw new HttpError(404, "This link isn't valid. Check you have the whole address.");
  return portalServices().bookingSendBacks.resubmit(token, input.request, input.reply ?? "").catch(asLinkError);
}
