import { handleRoute, json, readJson } from "@/server/http";
import { sendBackBodySchema, sendBackRequest } from "@/server/send-back";

export const dynamic = "force-dynamic";

/** Sends a booked task back to its requester, for someone who can edit it. */
export const POST = handleRoute(async (request: Request) => {
  const body = sendBackBodySchema.parse(await readJson(request));
  return json(await sendBackRequest(request, body));
});
