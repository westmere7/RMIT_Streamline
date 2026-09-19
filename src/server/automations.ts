import { z } from "zod";
import { EVENT_BATCH_SIZE, MAX_QUICK_RUN_ITEMS } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { buildPermissionContext, canEditBoard } from "@/lib/permissions/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices, type DrainReport } from "@/services";
import { HttpError } from "./http";

/**
 * The runner, from the outside.
 *
 * This is the whole reason the feature works with nobody signed in. A rule is
 * not carried out by the page that caused it: the page's write raises a row in
 * `automation_events` from a database trigger, and this drains that queue under
 * the service role, on a server, on a timer.
 *
 * Three things call it, and it does not care which:
 *
 *   a cron driver      Vercel's scheduler or the GitHub Actions workflow, every
 *                      few minutes, with the shared secret. This is the one
 *                      that matters: it is what makes "every Monday at 9am"
 *                      and "two days before the due date" true.
 *   pg_cron            optional, and the best of the three where it is
 *                      available — the database calling the app directly, with
 *                      no third party in the loop. See supabase/optional/.
 *   a signed-in member the app nudges this endpoint after a write, so somebody
 *                      watching a board sees a rule fire in a second rather
 *                      than at the next tick. A nudge is an optimisation. Take
 *                      it away and everything still happens, just later.
 */

/** How long the runner is allowed before it stops and leaves the rest for the next tick. */
export const RUN_BUDGET_MS = 50_000;

/** How often processed events and old log rows are cleared out. */
const SWEEP_KEEP_DAYS = 30;

export interface RunOutcome extends DrainReport {
  /** Milliseconds the drain took, so a slow queue is visible in the cron log. */
  tookMs: number;
  swept: number;
}

/**
 * Checks the caller is allowed to set the runner going.
 *
 * A configured secret, and nothing else. `AUTOMATION_SECRET` is the shared one,
 * sent as a bearer token or as `x-automation-secret`; `CRON_SECRET` is the name
 * Vercel's own scheduler uses for the same thing, and it signs its scheduled
 * requests with it, so either name works and either alone is enough.
 *
 * There is deliberately no fallback to Vercel's `x-vercel-cron` header. It is a
 * header, which means anybody can send one, and it is not documented as being
 * stripped from requests arriving off the internet — so trusting it would leave
 * a drain endpoint that any stranger could hold down to make this database work
 * for free. With no secret configured the runner refuses everybody and says so,
 * which is a thing an operator notices and fixes.
 */
export function authoriseRunner(request: Request): void {
  const configured = process.env.AUTOMATION_SECRET || process.env.CRON_SECRET || null;
  if (!configured) {
    throw new HttpError(503, "Automations are not configured on this deployment: set AUTOMATION_SECRET.");
  }
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const offered = bearer ?? request.headers.get("x-automation-secret");
  if (!offered || !timingSafeEqual(offered, configured)) throw new HttpError(401, "Not allowed.");
}

/** Constant-time compare, so a wrong secret cannot be found one character at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differences === 0;
}

/**
 * One pass of the runner.
 *
 * Everything it writes goes through the ordinary services, under the service
 * role, so an automation setting a value propagates along task links and raises
 * the same notifications a person would have raised doing it by hand.
 */
export async function runAutomations(options: { limit?: number; sweep?: boolean } = {}): Promise<RunOutcome> {
  const started = Date.now();
  routeRepositoriesThrough(getSupabaseAdminClient());
  const repos = createSupabaseRepositories();
  const services = createServices(repos, { automationTimezone: process.env.AUTOMATION_TIMEZONE });

  const report = await services.automationEngine.drain(options.limit ?? EVENT_BATCH_SIZE);
  // Housekeeping on the same tick, but only when asked: the cron driver sweeps,
  // a nudge from a browser does not, so somebody clicking about a board never
  // pays for a delete of thirty days of log rows.
  const swept = options.sweep ? await repos.automations.sweep(SWEEP_KEEP_DAYS) : 0;

  return { ...report, swept, tookMs: Date.now() - started };
}

// ---------------------------------------------------------------------------
// Quick runs: a saved group of actions, fired by hand
// ---------------------------------------------------------------------------

export const runNowSchema = z.object({
  ruleId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).max(MAX_QUICK_RUN_ITEMS),
});

/**
 * Fires a quick run for the signed-in person who asked for it.
 *
 * Authorisation is the caller's own session, not the runner secret: this is a
 * thing a member does, not a thing the clock does. The permission check is the
 * very same `canEditBoard` the browser uses to decide whether to show the Run
 * button, built from the same three membership lists — so the server and the
 * screen cannot disagree about who may press it.
 *
 * Only a `manual` rule can be run this way. A rule that fires itself has a
 * trigger with meaning, and "run it now" against an arbitrary task would be a
 * different feature wearing this one's clothes.
 */
export async function runQuickRunForMember(request: Request, body: z.infer<typeof runNowSchema>): Promise<DrainReport> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to run this.");

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");

  routeRepositoriesThrough(admin);
  const repos = createSupabaseRepositories();
  const services = createServices(repos, { automationTimezone: process.env.AUTOMATION_TIMEZONE });

  const rule = await repos.automations.getRule(body.ruleId);
  if (!rule) throw new HttpError(404, "That quick run no longer exists.");
  if (rule.trigger.kind !== "manual") throw new HttpError(400, "Only a quick run can be started by hand.");
  const board = await repos.boards.getById(rule.boardId);
  if (!board) throw new HttpError(404, "That board no longer exists.");

  const [workspaceMembers, teamMembers, boardMembers] = await Promise.all([
    repos.workspaces.listMembers(board.workspaceId),
    repos.teams.listMembersByWorkspace(board.workspaceId),
    repos.boards.listMembersByWorkspace(board.workspaceId),
  ]);
  const permissions = buildPermissionContext({ userId: data.user.id, workspaceMembers, teamMembers, boardMembers });
  if (!canEditBoard(permissions, board)) throw new HttpError(403, "Only somebody who can edit this board can run its quick runs.");

  return services.automationEngine.runNow(rule.id, body.itemIds, data.user.id);
}
