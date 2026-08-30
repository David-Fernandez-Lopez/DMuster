import { NextResponse } from "next/server";

import { CronJob, CronRunStatus, SyncTrigger } from "@/generated/prisma/enums";
import { hasValidCronSecret } from "@/lib/cronAuth";
import { finishCronRun, pruneCronRuns, startCronRun } from "@/lib/cronRunLog";
import { env } from "@/lib/env";
import { processPendingReminders, reconcileReminders } from "@/lib/google/reminderSyncService";

/**
 * POST /api/cron/availability-reminders — daily sweep for the monthly
 * "REVISAR CALENDARIO ROL" reminder (roadmap #23.4): reconciles which
 * Google-sync-enabled users still have unanswered eligible days next month
 * (creating or clearing their `AvailabilityReminderEvent` row accordingly),
 * then processes whatever is due against the Google Calendar API. Authorized
 * by the same shared secret header as `calendar-sync`, not a user session —
 * this route has no browser-facing caller. Entirely inert (404) when
 * `CRON_SECRET` is unset. Every execution is logged to `CronRun`, and each
 * real Google API call it makes is logged to `CalendarEventLog`. Response
 * strings here are not i18n keys: nothing renders this route's output, it is
 * machine-to-machine.
 *
 * A tick arriving while the previous one is still going is skipped rather than
 * run alongside it.
 *
 * @param {Request} request - Must carry the `x-cron-secret` header.
 * @returns {Promise<NextResponse>} `200 { data: { runId, evaluated, enqueued,
 *   cleared, processed, failed } }`, `200 { data: { skipped: true } }`, 401, or 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!hasValidCronSecret(request, env.CRON_SECRET)) {
    // See the same guard in the calendar-sync route: without this line a
    // scheduler whose secret stopped matching fails silently.
    console.warn("[CRON/AVAILABILITY-REMINDERS] Rejected a call with a missing or wrong secret.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = await startCronRun(CronJob.AVAILABILITY_REMINDERS);
  if (!started.started) {
    console.warn(
      `[CRON/AVAILABILITY-REMINDERS] Skipped: a sweep has been running since ${started.runningSince.toISOString()}.`,
    );
    return NextResponse.json({
      data: { skipped: true, runningSince: started.runningSince.toISOString() },
    });
  }
  const runId = started.runId;

  try {
    const reconcileResult = await reconcileReminders();
    const processResult = await processPendingReminders({
      trigger: SyncTrigger.CRON,
      cronRunId: runId ?? undefined,
    });

    await finishCronRun(runId, {
      status: CronRunStatus.SUCCESS,
      processed: processResult.processed,
      failed: processResult.failed,
      details: reconcileResult,
    });
    await pruneCronRuns();

    return NextResponse.json({ data: { runId, ...reconcileResult, ...processResult } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON/AVAILABILITY-REMINDERS] Sweep failed:", error);
    await finishCronRun(runId, { status: CronRunStatus.FAILED, processed: 0, failed: 0, error: message });
    await pruneCronRuns();
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
