import { handleRoute, json } from "@/server/http";
import { authoriseTick, runAutomations } from "@/server/automations";

export const dynamic = "force-dynamic";
/**
 * Long enough to drain a real backlog. A tick that hits the wall stops where it
 * is and the next one picks the rest up, because every event is claimed and
 * finished one at a time rather than in one transaction.
 */
export const maxDuration = 60;

/**
 * How much of the queue one nudge may take.
 *
 * A nudge is about the change the person just made, which is a handful of
 * rows; the scheduler takes the full batch. Fifty is room for a paste of a
 * whole group and still a request that returns before anybody wonders.
 */
const NUDGE_LIMIT = 50;

/**
 * The runner's own endpoint: a tick of automations.
 *
 * GET and POST do the same thing. Vercel's scheduler only issues GETs, plain
 * `curl` reaches for one, and a scheduled job is not a mutation anybody browses
 * into by accident — the credential is the gate, not the verb.
 *
 * Two callers, two shapes of tick. The scheduler, with the secret, gets the
 * whole thing: the queue, the clock, the heartbeat and (unless it says
 * `sweep=0`) the housekeeping. A member, with their session, gets the queue
 * alone: their change acted on, and nothing that is the scheduler's job to do
 * or to be judged by.
 */
const tick = handleRoute(async (request: Request) => {
  const caller = await authoriseTick(request);
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit")) || undefined;
  const outcome =
    caller.kind === "runner"
      ? await runAutomations({ limit: requestedLimit, sweep: url.searchParams.get("sweep") !== "0" })
      : await runAutomations({ limit: Math.min(requestedLimit ?? NUDGE_LIMIT, NUDGE_LIMIT), sweep: false, schedules: false });
  return json({ ok: true, ...outcome });
});

export const GET = tick;
export const POST = tick;
