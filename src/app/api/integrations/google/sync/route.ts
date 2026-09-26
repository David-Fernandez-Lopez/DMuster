import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isGoogleSyncConfigured } from "@/lib/env";
import {
  backfillForUser,
  enqueueDeletionForUser,
  scheduleSyncSweep,
} from "@/lib/google/calendarSyncService";
import { prisma } from "@/lib/prisma";

const syncPreferenceSchema = z.object({ enabled: z.boolean() });

/**
 * PUT /api/integrations/google/sync — pauses or resumes Google Calendar sync
 * for the caller without disconnecting (the `Account` row and its tokens are
 * untouched, so re-enabling never requires a fresh consent screen). Enabling
 * backfills every future active session the user attends; disabling enqueues
 * deletion of those same events. Either way the queue is written before
 * responding and drained afterwards, via `after()`: the preference is what the
 * caller is waiting on, and holding the response open for one Google call per
 * session gave them a spinner and a proxy timeout instead of an answer.
 *
 * @param {Request} request - The incoming request with `{ enabled: boolean }`.
 * @returns {Promise<NextResponse>} `200 { data: { enabled } }`, or 400/401/404.
 */
export async function PUT(request: Request): Promise<NextResponse> {
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

  const body = await request.json().catch(() => null);
  const parsed = syncPreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "integrations.google.errors.unknown" },
      { status: 400 },
    );
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { providerAccountId: true },
  });
  if (!account) {
    return NextResponse.json(
      { error: "integrations.google.errors.notConnected" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { googleSyncEnabled: parsed.data.enabled },
  });

  if (parsed.data.enabled) {
    await backfillForUser(session.user.id);
  } else {
    await enqueueDeletionForUser(session.user.id);
  }

  // Queued, not awaited. The preference is already persisted above, and the
  // sweep is idempotent, so there is nothing the caller gains by waiting for
  // it — and plenty to lose: one Google call per future session, serially, held
  // the response open for as long as that took, with the interface showing
  // nothing but a disabled button and a reverse proxy free to time out first,
  // leaving the person unsure whether their change had applied. It had.
  //
  // The disconnect route is the deliberate exception: there the work must
  // finish before the token is revoked, because afterwards nothing can.
  scheduleSyncSweep(session.user.id);

  return NextResponse.json({ data: { enabled: parsed.data.enabled } });
}
