import { handleRoute, json, readJson } from "@/server/http";
import { runNowSchema, runQuickRunForMember } from "@/server/automations";

export const dynamic = "force-dynamic";
/** Fifty tasks with a few actions each is well inside this; the schema caps the count. */
export const maxDuration = 60;

/**
 * A quick run, fired by the signed-in person against the tasks they chose.
 *
 * The caller's session is the authorisation (see runQuickRunForMember), not the
 * runner secret: this is a member doing something, not the clock.
 */
export const POST = handleRoute(async (request: Request) => {
  const body = runNowSchema.parse(await readJson(request));
  return json(await runQuickRunForMember(request, body));
});
