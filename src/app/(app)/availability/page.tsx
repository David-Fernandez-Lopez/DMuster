import { redirect } from "next/navigation";

import AvailabilityList from "@/components/availability/AvailabilityList";
import { getServerTranslation } from "@/i18n/server";
import { getUserAvailability } from "@/lib/availabilityService";
import { auth } from "@/lib/auth";
import { availabilityDays } from "@/lib/availabilityHorizon";
import { listCampaignsForUser } from "@/lib/campaignService";
import { todayIso } from "@/lib/today";
import { listHolidays } from "@/lib/holidayService";
import { getUserAvailabilityHorizon } from "@/lib/userService";

/**
 * "Mi disponibilidad" page (`/availability`) — the primary flow for a player to
 * respond Sí/Tal vez/No on upcoming eligible days, grouped by month. Lists the
 * default window (at least MIN_DAYS eligible days within WINDOW_DAYS, through
 * the end of the last day's month), widened to the user's saved horizon when
 * that reaches further (see `availabilityDays`). Each day shows the campaigns
 * it affects and a Sí/Tal vez/No toggle. The response is global per day (it
 * applies to every campaign the player belongs to). Requires an authenticated
 * session.
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
  const [holidays, campaigns, horizon] = await Promise.all([
    listHolidays(),
    listCampaignsForUser(session.user.id),
    getUserAvailabilityHorizon(session.user.id),
  ]);

  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const days = availabilityDays(start, horizon, holidaySet);
  const responses = await getUserAvailability(
    session.user.id,
    start,
    days.at(-1) ?? start,
  );
  const tags = campaigns.map((campaign) => campaign.tag);

  return (
    <main className="mx-auto w-full max-w-[420px] flex-1 px-6 py-8 md:max-w-[1100px]">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {t("availability.title")}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{t("availability.help")}</p>

      {/* Keyed by horizon: the list seeds its answers once, at mount, so a
          wider range must remount it to take in the new days' answers. */}
      <AvailabilityList
        key={horizon}
        days={days}
        initialResponses={responses}
        tags={tags}
        horizon={horizon}
      />
    </main>
  );
}
