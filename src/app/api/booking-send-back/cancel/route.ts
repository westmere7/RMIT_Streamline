import { handleRoute, json, readJson } from "@/server/http";
import { cancelBodySchema, cancelSendBackRequest } from "@/server/send-back";

export const dynamic = "force-dynamic";

/** Takes a send-back back before the requester answers. */
export const POST = handleRoute(async (request: Request) => {
  const body = cancelBodySchema.parse(await readJson(request));
  return json(await cancelSendBackRequest(request, body));
});
