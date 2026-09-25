import { handleRoute, json } from "@/server/http";
import { CHANGELOG, changesSince } from "@/lib/changelog";

export const dynamic = "force-dynamic";

/**
 * What changed since `?since=<version>`, from this build's changelog. A page
 * still running an older build asks here, because its own copy of the
 * changelog stops at the version it was built as. Without `since`, all of it.
 */
export const GET = handleRoute(async (request: Request) => {
  const since = new URL(request.url).searchParams.get("since");
  return json({ entries: since ? changesSince(since) : CHANGELOG });
});
