import { handleRoute, json, readJson } from "@/server/http";
import { reallocateBodySchema, reallocateRequest } from "@/server/reallocation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends a task back to Task Allocation, reset as if just booked, for anyone who can edit both boards. */
export const POST = handleRoute(async (request: Request) => {
  const body = reallocateBodySchema.parse(await readJson(request));
  return json(await reallocateRequest(request, body));
});
