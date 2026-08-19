import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { revokeAccess } from "@/lib/google/oauth";

/**
 * DELETE /api/integrations/google — disconnects the caller's Google account:
 * revokes the token at Google (best effort) and deletes the app-managed
 * `Account` row. Idempotent — disconnecting when already disconnected still
 * succeeds. Cleaning up `SessionCalendarEvent` rows / future Google events is
 * wired in once the sync ledger exists (roadmap #23 phase 5); this endpoint
 * only tears down the connection itself.
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

  await revokeAccess(session.user.id);

  return NextResponse.json({ data: { disconnected: true } });
}
