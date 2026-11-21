import postgres from "postgres";
import { z } from "zod";
import type { Board, Item } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices } from "@/services";
import { HttpError } from "./http";

/**
 * Re-allocating a task for the Supabase provider.
 *
 * It deletes the task's activity and every update on it, which no member's
 * session may do, so it runs with the service role, after the database's own
 * rules have said, for the caller, that they can edit the board the task is on
 * and Task Allocation (private.can_edit_board, asked as them).
 */

export const reallocateBodySchema = z.object({
  itemId: z.uuid(),
  groupId: z.uuid().optional(),
  newGroupName: z.string().trim().min(1).max(60).optional(),
});

/** A database on this machine (a disposable local stack) speaks no TLS; every other one must. */
function sslFor(url: string): "require" | false {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ? false : "require";
  } catch {
    return "require";
  }
}
let client: postgres.Sql | null = null;
function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new HttpError(503, "Re-allocating is not configured on this server: set SUPABASE_DB_URL.");
  client = postgres(url, { prepare: false, ssl: sslFor(url), max: 1, idle_timeout: 20, connect_timeout: 15 });
  return client;
}

export async function reallocateRequest(request: Request, input: z.infer<typeof reallocateBodySchema>): Promise<{ item: Item; board: Board }> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to re-allocate.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const userId = data.user.id;

  // Where things are, read past every policy: the caller may not even see Task Allocation.
  const [place] = await db()<{ board_id: string; queue_id: string | null }[]>`
    select i.board_id, q.id as queue_id
    from public.items i
    join public.boards b on b.id = i.board_id
    left join public.boards q on q.workspace_id = b.workspace_id and q.system = 'TASK_ALLOCATION' and q.archived_at is null
    where i.id = ${input.itemId}`;
  if (!place) throw new HttpError(404, "That task no longer exists.");
  if (!place.queue_id) throw new HttpError(400, "This workspace has no Task Allocation board.");
  // Then the caller's rights on each, by the database's own rules, asked as them.
  const rights = await db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    const [row] = await tx<{ edit_board: boolean; edit_queue: boolean }[]>`
      select private.can_edit_board(${place.board_id}::uuid) as edit_board, private.can_edit_board(${place.queue_id}::uuid) as edit_queue`;
    return row!;
  });
  if (!rights.edit_board) throw new HttpError(403, "You can't edit the board this task is on.");
  if (!rights.edit_queue) throw new HttpError(403, "Only the people allocating on Task Allocation can re-allocate.");

  routeRepositoriesThrough(admin);
  const services = createServices(createSupabaseRepositories());
  return services.reallocation.reallocate(input.itemId, userId, { groupId: input.groupId, newGroupName: input.newGroupName });
}
