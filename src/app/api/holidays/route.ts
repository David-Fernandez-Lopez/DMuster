import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { addHoliday, listHolidays } from "@/lib/holidayService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { holidaySchema } from "@/lib/validation/holiday";

/**
 * GET /api/holidays — lists every holiday (id + calendar day), oldest first.
 * Any authenticated user may read them (the calendar in #15 consumes this too);
 * 401 otherwise. The proxy excludes `/api`, so this handler guards itself.
 *
 * @returns {Promise<NextResponse>} 200 with the list, 401, or 500.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "holidays.errors.unauthorized" },
      { status: 401 },
    );
  }

  try {
    const holidays = await listHolidays();
    return NextResponse.json({ data: holidays });
  } catch (error) {
    console.error("[HOLIDAYS/LIST] Failed to list holidays:", error);
    return NextResponse.json(
      { error: "holidays.errors.unknown" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/holidays — adds an extra weekday holiday. Restricted to a user who
 * is DM of at least one campaign (no global admin role — CLAUDE.md §4).
 * Authorization runs before body validation: 401 → 403 (not DM-of-any) → 400.
 * A weekend or malformed date fails validation; a duplicate date is 400. The
 * validation error collapses to the specific field key so the single-field form
 * shows `invalidDate` / `weekend` directly.
 *
 * @param {Request} request - The incoming request with the JSON body.
 * @returns {Promise<NextResponse>} 201, 400, 401, 403, or 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  const body = await request.json().catch(() => null);
  const parsed = holidaySchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return NextResponse.json(
      {
        error: fieldErrors.date ?? "holidays.errors.invalidDate",
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const result = await addHoliday(parsed.data.date, session.user.id);
  if (!result.ok) {
    const status = result.error === "holidays.errors.duplicate" ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { data: { id: result.id, date: parsed.data.date } },
    { status: 201 },
  );
}
