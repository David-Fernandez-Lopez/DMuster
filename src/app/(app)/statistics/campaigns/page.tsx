import { redirect } from "next/navigation";

import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { listMyCampaigns } from "@/lib/statistics/statisticsService";

type CampaignsStatisticsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

/**
 * `/statistics/campaigns` lands on the user's first campaign, keeping the
 * period. A user without campaigns sees a short note instead.
 *
 * @param {CampaignsStatisticsPageProps} props - Route props with the async search params.
 * @returns {Promise<JSX.Element>}
 */
export default async function CampaignsStatisticsPage({
  searchParams,
}: CampaignsStatisticsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const campaigns = await listMyCampaigns(session.user.id);
  if (campaigns.length > 0) {
    const { period } = await searchParams;
    const value = Array.isArray(period) ? period[0] : period;
    redirect(
      `/statistics/campaigns/${campaigns[0].id}${value ? `?period=${encodeURIComponent(value)}` : ""}`,
    );
  }

  const { t } = await getServerTranslation();
  return <p className="text-sm text-ink-muted">{t("statistics.campaign.noCampaigns")}</p>;
}
