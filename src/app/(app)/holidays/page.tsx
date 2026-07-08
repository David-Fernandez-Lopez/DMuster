import Link from "next/link";
import { redirect } from "next/navigation";

import AddHolidayForm from "@/components/holidays/AddHolidayForm";
import RemoveHolidayButton from "@/components/holidays/RemoveHolidayButton";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { toUtcDate } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";

/**
 * Holidays management page. Restricted to a user who is DM of at least one
 * campaign (no global admin role — CLAUDE.md §4): anonymous users go to
 * `/login`, and authenticated non-DMs are redirected home. This mirrors the API
 * guard as defense-in-depth — the mutations still return 401/403 regardless.
 *
 * Lists the extra weekday holidays (weekends are eligible automatically and are
 * never listed) with a long localized date and a remove control, plus a form to
 * add a new one. Reads go straight through the service layer; mutations go
 * through the API. Reached from the "Gestionar festivos" link in the calendar
 * header (shown only to DMs).
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function HolidaysPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!(await isDmOfAnyCampaign(session.user.id))) {
    redirect("/");
  }

  const { t, locale } = await getServerTranslation();
  const holidays = await listHolidays();

  // Dates are stored at UTC midnight, so format them in UTC to keep the
  // rendered calendar day from shifting in negative-offset timezones.
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <Link
        href="/"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">
        {t("holidays.title")}
      </h1>

      {holidays.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center text-sm text-ink-muted">
          {t("holidays.empty")}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {holidays.map((holiday) => (
            <li
              key={holiday.id}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3"
            >
              <p className="min-w-0 flex-1 truncate font-semibold text-ink first-letter:uppercase">
                {dateFormatter.format(toUtcDate(holiday.date))}
              </p>
              <RemoveHolidayButton holidayId={holiday.id} />
            </li>
          ))}
        </ul>
      )}

      <AddHolidayForm />
    </main>
  );
}
