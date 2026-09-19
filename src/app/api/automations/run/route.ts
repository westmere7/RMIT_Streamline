import { handleRoute, json } from "@/server/http";
import { authoriseRunner, runAutomations } from "@/server/automations";

export const dynamic = "force-dynamic";
/**
 * Long enough to drain a real backlog. A tick that hits the wall stops where it
 * is and the next one picks the rest up, because every event is claimed and
 * finished one at a time rather than in one transaction.
 */
export const maxDuration = 60;

/**
 * The runner's own endpoint: a tick of automations.
 *
 * GET and POST do the same thing. Vercel's scheduler only issues GETs, plain
 * `curl` reaches for one, and a scheduled job is not a mutation anybody browses
 * into by accident — the secret is the gate, not the verb.
 */
const tick = handleRoute(async (request: Request) => {
  authoriseRunner(request);
  const url = new URL(request.url);
  // A nudge from the app passes `sweep=0`: it wants its own change acted on,
  // not thirty days of housekeeping.
  const sweep = url.searchParams.get("sweep") !== "0";
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const outcome = await runAutomations({ limit, sweep });
  return json({ ok: true, ...outcome });
});

export const GET = tick;
export const POST = tick;
