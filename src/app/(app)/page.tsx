import Link from "next/link";
import { redirect } from "next/navigation";

import CalendarGrid from "@/components/calendar/CalendarGrid";
import MonthNav from "@/components/calendar/MonthNav";
import { getServerTranslation } from "@/i18n/server";
import { getUserAvailability } from "@/lib/availabilityService";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { getCalendarViability } from "@/lib/calendarService";
import { isValidIsoMonth, monthGridDays, todayIso } from "@/lib/date";
import { listHolidays } from "@/lib/holidayService";

/**
 * Calendar home (`/`). Renders the monthly grid with eligibility styling and
 * month navigation via the `?month=YYYY-MM` search param (SSR, shareable). An
 * invalid or missing param falls back silently to the current month. DMs of any
 * campaign also get a "Gestionar festivos" entry point in the header. Requires
 * an authenticated session (verified here; the proxy also gates anonymous
 * users). Per-campaign viability chips are computed server-side via
 * `getCalendarViability` and rendered on each eligible day.
 *
 * @param {{ searchParams: Promise<{ month?: string }> }} props
 * @returns {Promise<JSX.Element>}
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const currentMonth = todayIso().slice(0, 7);
  const { month: rawMonth } = await searchParams;
  const month = rawMonth && isValidIsoMonth(rawMonth) ? rawMonth : currentMonth;

  const { t, locale } = await getServerTranslation();
  const days = monthGridDays(month);

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const [canManageHolidays, holidays, responses] = await Promise.all([
    isDmOfAnyCampaign(session.user.id),
    listHolidays(),
    getUserAvailability(session.user.id, rangeStart, rangeEnd),
  ]);
  const holidayDates = holidays.map((holiday) => holiday.date);
  const { campaigns, byDate } = await getCalendarViability(
    session.user.id,
    rangeStart,
    rangeEnd,
    new Set(holidayDates),
  );
  const tags = campaigns.map((campaign) => campaign.tag);

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {t("calendar.title")}
        </h1>
        {canManageHolidays ? (
          <Link
            href="/holidays"
            className="shrink-0 text-sm font-semibold text-brand hover:underline"
          >
            {t("holidays.manage")}
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-s" />
          {t("calendar.legend.yes")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-n" />
          {t("calendar.legend.no")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-t" />
          {t("calendar.legend.maybe")}
        </span>
        <span className="italic">{t("calendar.legend.note")}</span>
      </div>

      <div className="mt-6">
        <MonthNav
          month={month}
          currentMonth={currentMonth}
          locale={locale}
          prevLabel={t("calendar.prevMonth")}
          nextLabel={t("calendar.nextMonth")}
          todayLabel={t("calendar.today")}
        />
      </div>

      <div className="mt-4">
        <CalendarGrid
          key={month}
          month={month}
          days={days}
          holidays={holidayDates}
          today={todayIso()}
          locale={locale}
          tags={tags}
          initialResponses={responses}
          campaigns={campaigns}
          viabilityByDate={byDate}
        />
      </div>

      <p className="mt-4 text-center text-sm text-ink-muted md:hidden">
        {t("calendar.help")}
      </p>
    </main>
  );
}
