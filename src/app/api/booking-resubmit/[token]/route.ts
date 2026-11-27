import { handleRoute, json, readJson } from "@/server/http";
import { openResubmit, resubmitBodySchema, resubmitRequest } from "@/server/send-back";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** What the requester's link opens: the form, their answers, and what the team asked for. No session: the token is the key. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json(await openResubmit(decodeURIComponent(token)));
});

/** The requester sends the form again. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = resubmitBodySchema.parse(await readJson(request));
  return json(await resubmitRequest(decodeURIComponent(token), body));
});
