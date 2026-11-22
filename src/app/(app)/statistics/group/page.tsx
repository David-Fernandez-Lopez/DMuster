import GroupView from "@/components/statistics/GroupView";
import { getServerTranslation } from "@/i18n/server";
import { parsePeriod } from "@/lib/statistics/period";
import { getGroupStats } from "@/lib/statistics/statisticsService";

type GroupStatisticsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

/**
 * Group tab (`/statistics/group`): visible to every signed-in user (the layout
 * already enforces the session). The period comes from `?period=`.
 *
 * @param {GroupStatisticsPageProps} props - Route props with the async search params.
 * @returns {Promise<JSX.Element>}
 */
export default async function GroupStatisticsPage({
  searchParams,
}: GroupStatisticsPageProps) {
  const period = parsePeriod((await searchParams).period);
  const [{ t, locale }, { stats, directory }] = await Promise.all([
    getServerTranslation(),
    getGroupStats(period),
  ]);

  const periodLabel =
    period === "all" || period === "last12" ? t(`statistics.period.${period}`) : period;

  return (
    <GroupView
      stats={stats}
      directory={directory}
      t={t}
      locale={locale}
      periodLabel={periodLabel}
      showAllHref="/statistics/group?period=all"
    />
  );
}
