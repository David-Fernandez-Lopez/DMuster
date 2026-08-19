import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isGoogleSyncConfigured } from "@/lib/env";
import {
  backfillForUser,
  enqueueDeletionForUser,
  processPending,
} from "@/lib/google/calendarSyncService";
import { prisma } from "@/lib/prisma";

const syncPreferenceSchema = z.object({ enabled: z.boolean() });

/**
 * PUT /api/integrations/google/sync — pauses or resumes Google Calendar sync
 * for the caller without disconnecting (the `Account` row and its tokens are
 * untouched, so re-enabling never requires a fresh consent screen). Enabling
 * backfills every future active session the user attends; disabling enqueues
 * deletion of those same events. Both then process synchronously before
 * responding — this is a deliberate, watched action, unlike the fire-and-
 * forget sweep after an ordinary session mutation.
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
  await processPending({ userId: session.user.id });

  return NextResponse.json({ data: { enabled: parsed.data.enabled } });
}
