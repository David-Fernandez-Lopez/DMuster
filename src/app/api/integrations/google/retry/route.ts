import { NextResponse } from "next/server";

import { SyncStatus, SyncTrigger } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { isGoogleSyncConfigured } from "@/lib/env";
import { processPending } from "@/lib/google/calendarSyncService";
import { processPendingReminders } from "@/lib/google/reminderSyncService";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/integrations/google/retry — the profile's "Reintentar" button.
 * Resets the caller's FAILED rows' attempt counters to 0 first, since this is
 * an explicit human action and should not be blocked by the automatic
 * 5-attempt cap or the exponential backoff schedule the way the opportunistic
 * post-mutation sweep is.
 *
 * Covers both queues. The button appears from a count that now includes stuck
 * reminders, so retrying only the session queue would leave the person pressing
 * a button that could never clear what it was offered for.
 *
 * @returns {Promise<NextResponse>} `200 { data: { processed, failed } }`, or 401/404.
 */
export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "integrations.google.errors.unauthorized" },
      { status: 401 },
    );
  }

  if (!isGoogleSyncConfigured) {
    return NextResponse.json(
      { error: "integrations.google.errors.notConfigured" },
      { status: 404 },
    );
  }

  const failedByCaller = { userId: session.user.id, status: SyncStatus.FAILED };
  await Promise.all([
    prisma.sessionCalendarEvent.updateMany({ where: failedByCaller, data: { attempts: 0 } }),
    prisma.availabilityReminderEvent.updateMany({ where: failedByCaller, data: { attempts: 0 } }),
  ]);

  const sessions = await processPending({
    userId: session.user.id,
    trigger: SyncTrigger.MANUAL_RETRY,
  });
  const reminders = await processPendingReminders({
    userId: session.user.id,
    trigger: SyncTrigger.MANUAL_RETRY,
  });

  return NextResponse.json({
    data: {
      processed: sessions.processed + reminders.processed,
      failed: sessions.failed + reminders.failed,
    },
  });
}
