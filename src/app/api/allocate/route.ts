import { allocateBodySchema, allocateRequest } from "@/server/allocation";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Moves a request off Task Allocation onto a team's board, for anyone who can allocate there. */
export const POST = handleRoute(async (request: Request) => {
  const body = allocateBodySchema.parse(await readJson(request));
  return json(await allocateRequest(request, body));
});
