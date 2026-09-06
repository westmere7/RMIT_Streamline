import { handleRoute, json, readJson } from "@/server/http";
import { bookingBodySchema, loadBookingForm, submitBooking } from "@/server/booking";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** The booking form for a workspace: `?key=` from the public link, or a member's session. */
export const GET = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  const key = new URL(request.url).searchParams.get("key");
  return json(await loadBookingForm(request, decodeURIComponent(slug), key));
});

/** Books a task. Same access rule as GET; the key travels in the body. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  const body = bookingBodySchema.parse(await readJson(request));
  return json(await submitBooking(request, decodeURIComponent(slug), body.key ?? null, body.request), 201);
});
