import { NextResponse } from "next/server";

import { CronJob, CronRunStatus, SyncTrigger } from "@/generated/prisma/enums";
import { hasValidCronSecret } from "@/lib/cronAuth";
import { finishCronRun, pruneCronRuns, startCronRun } from "@/lib/cronRunLog";
import { env } from "@/lib/env";
import { processPending } from "@/lib/google/calendarSyncService";

/** Rows the cron sweep processes per run — larger than the post-mutation sweep since it runs far less often. */
const CRON_SWEEP_LIMIT = 200;

/**
 * POST /api/cron/calendar-sync — optional sweeper for `SessionCalendarEvent`
 * rows left PENDING or FAILED when no session mutation has happened recently
 * to trigger the opportunistic post-response sweep (e.g. a connection that
 * was broken and just got reconnected, or a row that hit a transient failure
 * with nobody using the app to retrigger it). Authorized by a shared secret
 * header, not a user session — this route has no browser-facing caller.
 * Entirely inert (404) when `CRON_SECRET` is unset, so no deployment is
 * forced to wire up a scheduler. Every execution is logged to `CronRun`
 * (roadmap #23.3), and each real Google API call it makes is logged to
 * `CalendarEventLog` by `processPending` itself. Response strings here are
 * not i18n keys: nothing renders this route's output, it is
 * machine-to-machine.
 *
 * @param {Request} request - Must carry the `x-cron-secret` header.
 * @returns {Promise<NextResponse>} `200 { data: { runId, processed, failed } }`, 401, or 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!hasValidCronSecret(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun(CronJob.CALENDAR_SYNC);

  try {
    const result = await processPending({
      limit: CRON_SWEEP_LIMIT,
      trigger: SyncTrigger.CRON,
      cronRunId: runId ?? undefined,
    });

    await finishCronRun(runId, {
      status: CronRunStatus.SUCCESS,
      processed: result.processed,
      failed: result.failed,
    });
    await pruneCronRuns();

    return NextResponse.json({ data: { runId, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON/CALENDAR-SYNC] Sweep failed:", error);
    await finishCronRun(runId, { status: CronRunStatus.FAILED, processed: 0, failed: 0, error: message });
    await pruneCronRuns();
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
