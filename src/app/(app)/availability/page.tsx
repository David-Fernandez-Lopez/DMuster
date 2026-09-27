import { redirect } from "next/navigation";

import AvailabilityList from "@/components/availability/AvailabilityList";
import { getServerTranslation } from "@/i18n/server";
import { getUserAvailability } from "@/lib/availabilityService";
import { auth } from "@/lib/auth";
import { listCampaignsForUser } from "@/lib/campaignService";
import { addDays, upcomingEligibleDaysThroughMonth } from "@/lib/date";
import { todayIso } from "@/lib/today";
import { listHolidays } from "@/lib/holidayService";

/** How many days ahead the responding window scans for eligible days. */
const WINDOW_DAYS = 90;

/** Minimum number of upcoming eligible days shown at once. */
const MIN_DAYS = 16;

/**
 * "Mi disponibilidad" page (`/availability`) — the primary flow for a player to
 * respond Sí/Tal vez/No on upcoming eligible days, grouped by month. Lists at
 * least MIN_DAYS eligible days within the next WINDOW_DAYS, extended through
 * the end of the last day's month so no month group is cut short, each day
 * showing the campaigns it affects and a Sí/Tal vez/No toggle. The response is
 * global per day (it applies to every campaign the player belongs to).
 * Requires an authenticated session.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function AvailabilityPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  const start = todayIso();
  const [holidays, campaigns, responses] = await Promise.all([
    listHolidays(),
    listCampaignsForUser(session.user.id),
    getUserAvailability(session.user.id, start, addDays(start, WINDOW_DAYS - 1)),
  ]);

  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const days = upcomingEligibleDaysThroughMonth(
    start,
    WINDOW_DAYS,
    MIN_DAYS,
    holidaySet,
  );
  const tags = campaigns.map((campaign) => campaign.tag);

  return (
    <main className="mx-auto w-full max-w-[420px] flex-1 px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {t("availability.title")}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{t("availability.help")}</p>

      <AvailabilityList days={days} initialResponses={responses} tags={tags} />
    </main>
  );
}
