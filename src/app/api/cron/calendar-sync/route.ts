import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { processPending } from "@/lib/google/calendarSyncService";

/** Rows the cron sweep processes per run — larger than the post-mutation sweep since it runs far less often. */
const CRON_SWEEP_LIMIT = 200;

/**
 * Reports whether the `x-cron-secret` header matches `env.CRON_SECRET`,
 * comparing in constant time so response timing can't leak the secret one
 * byte at a time.
 *
 * @param {Request} request - The incoming request.
 * @param {string} secret - The configured `CRON_SECRET`.
 * @returns {boolean} True when the header matches.
 */
function hasValidCronSecret(request: Request, secret: string): boolean {
  const provided = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * POST /api/cron/calendar-sync — optional sweeper for `SessionCalendarEvent`
 * rows left PENDING or FAILED when no session mutation has happened recently
 * to trigger the opportunistic post-response sweep (e.g. a connection that
 * was broken and just got reconnected, or a row that hit a transient failure
 * with nobody using the app to retrigger it). Authorized by a shared secret
 * header, not a user session — this route has no browser-facing caller.
 * Entirely inert (404) when `CRON_SECRET` is unset, so no deployment is
 * forced to wire up a scheduler. Response strings here are not i18n keys:
 * nothing renders this route's output, it is machine-to-machine.
 *
 * @param {Request} request - Must carry the `x-cron-secret` header.
 * @returns {Promise<NextResponse>} `200 { data: { processed, failed } }`, 401, or 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!hasValidCronSecret(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processPending({ limit: CRON_SWEEP_LIMIT });

  return NextResponse.json({ data: result });
}
