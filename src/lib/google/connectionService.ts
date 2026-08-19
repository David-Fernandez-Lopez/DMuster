// Read-only aggregation of a user's Google Calendar connection state for the
// /profile UI (roadmap #23). Every field here comes from a DB read — the
// actual OAuth and sync mechanics live in oauth.ts / calendarSyncService.ts.

import { SyncStatus } from "@/generated/prisma/enums";
import { isGoogleSyncConfigured } from "@/lib/env";
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

  const [statusCounts, lastSynced] = await Promise.all([
    prisma.sessionCalendarEvent.groupBy({
      by: ["status"],
      where: { userId, status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] } },
      _count: { _all: true },
    }),
    prisma.sessionCalendarEvent.findFirst({
      where: { userId, status: SyncStatus.SYNCED },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    }),
  ]);

  const pendingCount =
    statusCounts.find((row) => row.status === SyncStatus.PENDING)?._count._all ?? 0;
  const failedCount =
    statusCounts.find((row) => row.status === SyncStatus.FAILED)?._count._all ?? 0;

  return {
    configured: true,
    connected: true,
    googleEmail,
    enabled: user.googleSyncEnabled,
    brokenAt: user.googleSyncBrokenAt,
    pendingCount,
    failedCount,
    lastSyncAt: lastSynced?.syncedAt ?? null,
  };
}
