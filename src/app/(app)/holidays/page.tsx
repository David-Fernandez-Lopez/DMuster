import Link from "next/link";
import { redirect } from "next/navigation";

import AddHolidayForm from "@/components/holidays/AddHolidayForm";
import RemoveHolidayButton from "@/components/holidays/RemoveHolidayButton";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { groupByYear, toUtcDate } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";

/**
 * Holidays management page. Restricted to a user who is DM of at least one
 * campaign (no global admin role — CLAUDE.md §4): anonymous users go to
 * `/login`, and authenticated non-DMs are redirected home. This mirrors the API
 * guard as defense-in-depth — the mutations still return 401/403 regardless.
 *
 * Shows a form to add a holiday at the top, then the extra weekday holidays
 * (weekends are eligible automatically and are never listed) grouped into one
 * section per year — a grid on desktop, a single column on mobile — each with
 * its localized date (the year lives in the section heading) and a remove
 * control. Reads go straight through the service layer; mutations go through
 * the API. Reached from the "Gestionar festivos" link in the calendar header
 * (shown only to DMs).
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
  // rendered calendar day from shifting in negative-offset timezones. No year:
  // each date sits under its year's heading.
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8 md:max-w-[1100px]">
      <Link
        href="/"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">
        {t("holidays.title")}
      </h1>

      {/* Nothing on this screen used to say the list is shared. Every campaign
          in the instance plays by it, and any DM can edit it, so a change here
          is never only the editor's own. */}
      <p className="mt-2 text-sm text-ink-muted">{t("holidays.scope")}</p>

      <AddHolidayForm />

      {holidays.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center text-sm text-ink-muted">
          {t("holidays.empty")}
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {groupByYear(holidays).map((group) => (
            <section key={group.year} aria-labelledby={`year-${group.year}`}>
              <h2
                id={`year-${group.year}`}
                className="font-display text-lg font-semibold text-ink"
              >
                {group.year}
              </h2>
              <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3"
                  >
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink first-letter:uppercase">
                      {dateFormatter.format(toUtcDate(holiday.date))}
                    </p>
                    <RemoveHolidayButton holidayId={holiday.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
