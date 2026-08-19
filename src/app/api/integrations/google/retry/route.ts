import { NextResponse } from "next/server";

import { SyncStatus } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { isGoogleSyncConfigured } from "@/lib/env";
import { processPending } from "@/lib/google/calendarSyncService";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/integrations/google/retry — the profile's "Reintentar" button.
 * Resets the caller's FAILED rows' attempt counters to 0 first, since this is
 * an explicit human action and should not be blocked by the automatic
 * 5-attempt cap or the exponential backoff schedule the way the opportunistic
 * post-mutation sweep is.
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

  await prisma.sessionCalendarEvent.updateMany({
    where: { userId: session.user.id, status: SyncStatus.FAILED },
    data: { attempts: 0 },
  });

  const result = await processPending({ userId: session.user.id });

  return NextResponse.json({ data: result });
}
