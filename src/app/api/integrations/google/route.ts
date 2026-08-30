import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  DISCONNECT_PROCESS_LIMIT,
  enqueueDeletionForUser,
  processPending,
} from "@/lib/google/calendarSyncService";
import {
  enqueueReminderDeletionForUser,
  processPendingReminders,
} from "@/lib/google/reminderSyncService";
import { revokeAccess } from "@/lib/google/oauth";

/**
 * DELETE /api/integrations/google — disconnects the caller's Google account.
 * Enqueues deletion of everything this app put in their calendar and processes
 * it **before** revoking — once the token is revoked there is no way left to
 * clean up, so this step runs synchronously rather than via the fire-and-forget
 * `after()` sweep. Then revokes the token at Google (best effort) and deletes
 * the app-managed `Account` row. Idempotent — disconnecting when already
 * disconnected still succeeds.
 *
 * Both queues are drained, not just the session one: the monthly availability
 * reminder is not attached to any session, so nothing else would ever remove
 * it, and it would sit in the person's calendar for good.
 *
 * The response says what actually happened rather than a flat success. Two
 * things here can fail without the disconnect itself failing — the calendar
 * cleanup, and the revoke request to Google — and both leave something behind
 * that only the person can deal with, from their own Google account. Reporting
 * them as success meant nobody ever found out.
 *
 * @returns {Promise<NextResponse>} `200 { data: { disconnected, revokedAtGoogle,
 *   calendarCleanupFailed } }`, or 401.
 */
export async function DELETE(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "integrations.google.errors.unauthorized" },
      { status: 401 },
    );
  }

  await enqueueDeletionForUser(session.user.id);
  await enqueueReminderDeletionForUser(session.user.id);

  // An explicit limit, because the default caps at 25 rows: someone attending
  // more future sessions than that would have had the rest revoked out from
  // under them, left PENDING with a token that no longer works.
  const sessions = await processPending({
    userId: session.user.id,
    limit: DISCONNECT_PROCESS_LIMIT,
  });
  const reminders = await processPendingReminders({ limit: DISCONNECT_PROCESS_LIMIT });
  const calendarCleanupFailed = sessions.failed > 0 || reminders.failed > 0;

  if (calendarCleanupFailed) {
    console.error(
      `[INTEGRATIONS/GOOGLE] Disconnect for user ${session.user.id} left ` +
        `${sessions.failed} session event(s) and ${reminders.failed} reminder(s) behind.`,
    );
  }

  const revoked = await revokeAccess(session.user.id);

  return NextResponse.json({
    data: {
      disconnected: revoked.disconnected,
      revokedAtGoogle: revoked.revokedAtGoogle,
      calendarCleanupFailed,
    },
  });
}
