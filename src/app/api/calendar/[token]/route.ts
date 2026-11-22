import { getFeedForToken } from "@/lib/calendarFeedService";

type RouteContext = { params: Promise<{ token: string }> };

/** Plain 404 shared by every "no such feed" case, so none can be told apart from another. */
function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * GET /api/calendar/<token>.ics — the user's personal iCalendar subscription.
 *
 * Authenticated by the token alone, since calendar apps cannot hold a session:
 * the URL is the credential. Unknown tokens, malformed ones and disabled
 * accounts all answer the same 404. `Cache-Control: private` keeps shared
 * caches from storing someone's sessions; the short max-age only spares the
 * database a rebuild when a client polls twice in quick succession.
 *
 * @param {Request} _request - Incoming request (unused).
 * @param {RouteContext} context - Carries the `token` path segment, `.ics` suffix included.
 * @returns {Promise<Response>} `200 text/calendar`, `404` or `500`.
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { token: rawToken } = await params;
    const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -".ics".length) : rawToken;

    const feed = await getFeedForToken(token);
    if (feed === null) {
      return notFound();
    }

    return new Response(feed, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="dmuster.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[CALENDAR-FEED/GET] Failed to build the calendar feed:", error);
    return new Response("Internal error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
