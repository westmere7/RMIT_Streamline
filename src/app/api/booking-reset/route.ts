import { handleRoute, json, readJson } from "@/server/http";
import { resetBodySchema, resetBookingRequest } from "@/server/send-back";

export const dynamic = "force-dynamic";

/** Puts a booked task on Task Allocation back the way its booking made it. */
export const POST = handleRoute(async (request: Request) => {
  const body = resetBodySchema.parse(await readJson(request));
  return json(await resetBookingRequest(request, body));
});
