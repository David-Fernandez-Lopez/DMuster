// Read-only aggregation of a user's Google Calendar connection state for the
// /profile UI (roadmap #23). Every field here comes from a DB read — the
// actual OAuth and sync mechanics live in oauth.ts / calendarSyncService.ts.

import { CronRunStatus, SyncStatus } from "@/generated/prisma/enums";
import { env, isGoogleSyncConfigured } from "@/lib/env";
import { decodeIdTokenPayload } from "@/lib/google/oauth";
import { prisma } from "@/lib/prisma";

const GOOGLE_PROVIDER = "google";

/** The profile's Google Calendar section state, one shape per rendered case. */
export type GoogleConnectionStatus =
  | { configured: false }
  | { configured: true; connected: false }
  | {
      configured: true;
      connected: true;
      googleEmail: string | null;
      enabled: boolean;
      brokenAt: Date | null;
      pendingCount: number;
      failedCount: number;
      lastSyncAt: Date | null;
      /**
       * When the scheduled sweep last completed. `null` with cron configured
       * means it has never finished a run — which is what a cron whose secret
       * stopped matching looks like, since a rejected call leaves no other
       * trace anywhere.
       */
      lastCronSuccessAt: Date | null;
      /** Whether this deployment runs the scheduled sweep at all. */
      cronConfigured: boolean;
    };

/**
 * Loads everything the profile's Google Calendar section needs to render:
 * whether the integration is configured at the deployment level, whether
 * this user has connected an account, and — when connected — the enabled/
 * paused state, a broken-connection flag, and a compact sync summary
 * (pending/failed counts, last successful sync). At most three queries, none
 * of them repeated per row.
 *
 * @param {string} userId - The user viewing their profile.
 * @returns {Promise<GoogleConnectionStatus>} The connection state to render.
 */
export async function getConnectionStatus(userId: string): Promise<GoogleConnectionStatus> {
  if (!isGoogleSyncConfigured) {
    return { configured: false };
  }

  const [account, user] = await Promise.all([
    prisma.account.findFirst({
      where: { userId, provider: GOOGLE_PROVIDER },
      select: { id_token: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { googleSyncEnabled: true, googleSyncBrokenAt: true },
    }),
  ]);

  if (!account || !user) {
    return { configured: true, connected: false };
  }

  const googleEmail = account.id_token ? decodeIdTokenPayload(account.id_token)?.email ?? null : null;

  const outstanding = { status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] } };

  const [statusCounts, reminderCounts, lastSynced, lastCronSuccess] = await Promise.all([
    prisma.sessionCalendarEvent.groupBy({
      by: ["status"],
      where: { userId, ...outstanding },
      _count: { _all: true },
    }),
    // Counted alongside the session rows rather than left out of the picture.
    // The reminder queue can stall exactly like the session one, and nothing
    // rendered it — so a reminder ledger that stopped moving was invisible,
    // and the "Reintentar" button that would have unstuck it never appeared.
    prisma.availabilityReminderEvent.groupBy({
      by: ["status"],
      where: { userId, ...outstanding },
      _count: { _all: true },
    }),
    prisma.sessionCalendarEvent.findFirst({
      where: { userId, status: SyncStatus.SYNCED },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    }),
    prisma.cronRun.findFirst({
      where: { status: CronRunStatus.SUCCESS },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true, startedAt: true },
    }),
  ]);

  /**
   * Adds up one status across both queues.
   *
   * @param {SyncStatus} status - The status to total.
   * @returns {number} How many rows are in it.
   */
  const countOf = (status: SyncStatus): number =>
    (statusCounts.find((row) => row.status === status)?._count._all ?? 0) +
    (reminderCounts.find((row) => row.status === status)?._count._all ?? 0);

  return {
    configured: true,
    connected: true,
    googleEmail,
    enabled: user.googleSyncEnabled,
    brokenAt: user.googleSyncBrokenAt,
    pendingCount: countOf(SyncStatus.PENDING),
    failedCount: countOf(SyncStatus.FAILED),
    lastSyncAt: lastSynced?.syncedAt ?? null,
    lastCronSuccessAt: lastCronSuccess?.finishedAt ?? lastCronSuccess?.startedAt ?? null,
    cronConfigured: Boolean(env.CRON_SECRET),
  };
}
