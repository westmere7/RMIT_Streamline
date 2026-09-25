import { handleRoute, json, readJson } from "@/server/http";
import { lookupRequester, requesterLookupSchema } from "@/server/booking";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** The name the workspace has for an email, so the booking form can fill it in. Same access as booking. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  const body = requesterLookupSchema.parse(await readJson(request));
  return json(await lookupRequester(request, decodeURIComponent(slug), body.key ?? null, body.email));
});
