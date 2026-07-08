import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { removeHoliday } from "@/lib/holidayService";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/holidays/[id] — removes a holiday. Restricted to a user who is DM
 * of at least one campaign (no global admin role — CLAUDE.md §4). Ladder:
 * 401 → 403 (not DM-of-any) → 404 when the holiday does not exist.
 *
 * @param {Request} _request - The incoming request (unused).
 * @param {RouteContext} context - Route context with the async `params`.
 * @returns {Promise<NextResponse>} 200, 401, 403, 404, or 500.
 */
export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "holidays.errors.unauthorized" },
      { status: 401 },
    );
  }

  if (!(await isDmOfAnyCampaign(session.user.id))) {
    return NextResponse.json(
      { error: "holidays.errors.forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const result = await removeHoliday(id);
  if (!result.ok) {
    const status = result.error === "holidays.errors.notFound" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: { id: result.id } });
}
