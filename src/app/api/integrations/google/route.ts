import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { enqueueDeletionForUser, processPending } from "@/lib/google/calendarSyncService";
import { revokeAccess } from "@/lib/google/oauth";

/**
 * DELETE /api/integrations/google — disconnects the caller's Google account.
 * Enqueues deletion of every future active session's event and processes it
 * **before** revoking — once the token is revoked there is no way left to
 * clean up the calendar, so this step runs synchronously rather than via the
 * fire-and-forget `after()` sweep. Then revokes the token at Google (best
 * effort) and deletes the app-managed `Account` row. Idempotent —
 * disconnecting when already disconnected still succeeds.
 *
 * @returns {Promise<NextResponse>} `200 { data: { disconnected: true } }`, or 401.
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
  await processPending({ userId: session.user.id });

  await revokeAccess(session.user.id);

  return NextResponse.json({ data: { disconnected: true } });
}
