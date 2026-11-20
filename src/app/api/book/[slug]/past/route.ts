import { handleRoute, json, readJson } from "@/server/http";
import { listPastBookings, requesterLookupSchema } from "@/server/booking";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** The bookings made with an email, for the receipt, when the published form lists them. Same access as booking. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  const body = requesterLookupSchema.parse(await readJson(request));
  return json(await listPastBookings(request, decodeURIComponent(slug), body.key ?? null, body.email));
});
