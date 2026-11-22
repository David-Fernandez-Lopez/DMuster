import { redirect } from "next/navigation";

import MeView from "@/components/statistics/MeView";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { parsePeriod } from "@/lib/statistics/period";
import { getMeStats } from "@/lib/statistics/statisticsService";

type MeStatisticsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

/**
 * "Yo" tab (`/statistics/me`): the signed-in user's own statistics. It only
 * ever reads the session user, so there is no id in the URL to tamper with.
 *
 * @param {MeStatisticsPageProps} props - Route props with the async search params.
 * @returns {Promise<JSX.Element>}
 */
export default async function MeStatisticsPage({ searchParams }: MeStatisticsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const period = parsePeriod((await searchParams).period);
  const [{ t, locale }, { stats, directory }] = await Promise.all([
    getServerTranslation(),
    getMeStats(session.user.id, period),
  ]);

  const periodLabel =
    period === "all" || period === "last12" ? t(`statistics.period.${period}`) : period;

  return (
    <MeView
      stats={stats}
      directory={directory}
      name={session.user.name ?? ""}
      t={t}
      locale={locale}
      periodLabel={periodLabel}
      showAllHref="/statistics/me?period=all"
    />
  );
}
