import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Board, Item } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { buildPermissionContext, canEditBoard } from "@/lib/permissions/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices } from "@/services";
import { HttpError } from "./http";

/**
 * Allocating a request for the Supabase provider.
 *
 * Allocating moves a task off Task Allocation onto a team's board, and writes
 * its values, assets and activity there. Someone an admin added to Task
 * Allocation can allocate (policies/0031) without being able to edit every
 * team's board, so the route under src/app/api/allocate checks two things as
 * the caller and then runs the ordinary allocate with the service role:
 *
 *   - they can edit Task Allocation (the app's own rule, boardRoleFor), and
 *   - they can see the board it is going to (read with their own session).
 */

export const allocateBodySchema = z.object({ itemId: z.uuid(), boardId: z.uuid(), groupId: z.uuid().nullable().optional() });

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

export async function allocateRequest(request: Request, input: z.infer<typeof allocateBodySchema>): Promise<{ item: Item; board: Board }> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to allocate.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const userId = data.user.id;

  const item = await admin.from("items").select("id, board_id").eq("id", input.itemId).maybeSingle();
  if (item.error) throw new HttpError(500, `items.lookup: ${item.error.message}`);
  if (!item.data) throw new HttpError(404, "That request no longer exists.");
  const source = await admin
    .from("boards")
    .select("id, workspace_id, team_id, owner_id, visibility, follows_team, edit_scope, system")
    .eq("id", (item.data as { board_id: string }).board_id)
    .maybeSingle();
  if (source.error) throw new HttpError(500, `boards.lookup: ${source.error.message}`);
  const board = source.data as BoardRow | null;
  if (!board || board.system !== "TASK_ALLOCATION") throw new HttpError(400, "Only requests on the Task Allocation board can be allocated.");

  // The caller's say on Task Allocation, worked out by the app's own rule.
  const [members, teamMembers, seats] = await Promise.all([
    admin.from("workspace_members").select("id, workspace_id, user_id, role, status").eq("workspace_id", board.workspace_id).eq("user_id", userId),
    admin.from("team_members").select("id, team_id, user_id, role").eq("user_id", userId),
    admin.from("board_members").select("id, board_id, user_id, role").eq("board_id", board.id).eq("user_id", userId),
  ]);
  for (const result of [members, teamMembers, seats]) if (result.error) throw new HttpError(500, `allocation.access: ${result.error.message}`);
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
  const allowed = canEditBoard(ctx, {
    id: board.id,
    ownerId: board.owner_id,
    visibility: board.visibility,
    teamId: board.team_id,
    system: board.system,
    followsTeam: board.follows_team ?? undefined,
    editScope: board.edit_scope ?? undefined,
  });
  if (!allowed) throw new HttpError(403, "Only the people allocating on Task Allocation can allocate.");

  // The board it goes to has to be one they can see: asked with their own session.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new HttpError(503, "Supabase is not configured on this server.");
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const target = await asCaller.from("boards").select("id").eq("id", input.boardId).maybeSingle();
  if (target.error) throw new HttpError(500, `boards.target: ${target.error.message}`);
  if (!target.data) throw new HttpError(403, "You can't see that board, so you can't allocate to it.");

  routeRepositoriesThrough(admin);
  const services = createServices(createSupabaseRepositories());
  return services.booking.allocate(input.itemId, input.boardId, userId, { groupId: input.groupId ?? null });
}
