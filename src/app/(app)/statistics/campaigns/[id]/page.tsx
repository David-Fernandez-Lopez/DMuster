import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import CampaignSelect from "@/components/statistics/CampaignSelect";
import CampaignView from "@/components/statistics/CampaignView";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { parsePeriod } from "@/lib/statistics/period";
import { getCampaignStats, listMyCampaigns } from "@/lib/statistics/statisticsService";

type CampaignStatisticsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string | string[] }>;
};

/**
 * One campaign's tab (`/statistics/campaigns/[id]`). Only members may see it:
 * the service answers `null` for a non-member or an unknown id, and both give
 * the same 404 so a campaign's existence is not leaked.
 *
 * @param {CampaignStatisticsPageProps} props - Route props with the async params.
 * @returns {Promise<JSX.Element>}
 */
export default async function CampaignStatisticsPage({
  params,
  searchParams,
}: CampaignStatisticsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const period = parsePeriod((await searchParams).period);

  const [{ t, locale }, view, campaigns] = await Promise.all([
    getServerTranslation(),
    getCampaignStats(id, session.user.id, period),
    listMyCampaigns(session.user.id),
  ]);
  if (!view) {
    notFound();
  }

  const periodLabel =
    period === "all" || period === "last12" ? t(`statistics.period.${period}`) : period;

  return (
    <div className="flex flex-col gap-[22px]">
      <Suspense>
        <CampaignSelect campaigns={campaigns} current={id} />
      </Suspense>
      <CampaignView
        stats={view.stats}
        directory={view.directory}
        t={t}
        locale={locale}
        periodLabel={periodLabel}
        showAllHref={`/statistics/campaigns/${id}?period=all`}
      />
    </div>
  );
}
