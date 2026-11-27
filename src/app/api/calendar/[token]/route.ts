import { handleRoute } from "@/server/http";
import { calendarFeedIcs } from "@/server/calendar-feed";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** A private calendar feed: /api/calendar/<token>.ics, for Google, Outlook or Apple Calendar. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  const body = await calendarFeedIcs(decodeURIComponent(token).replace(/\.ics$/i, ""));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="streamline.ics"',
      "cache-control": "private, max-age=900",
    },
  });
});
