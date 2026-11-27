import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CampaignBadge from "@/components/campaigns/CampaignBadge";
import DiceEventsView from "@/components/dice/DiceEventsView";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { getCampaignForUser } from "@/lib/campaignService";

type CampaignRollsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A campaign's critical/fumble log. Any member may open it; non-members (and
 * unknown ids) get the not-found page, hiding the campaign's existence.
 *
 * @param {CampaignRollsPageProps} props - Route props with the async `params` and `searchParams`.
 * @returns {Promise<JSX.Element>}
 */
export default async function CampaignRollsPage({ params, searchParams }: CampaignRollsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const campaign = await getCampaignForUser(id, session.user.id);
  if (!campaign) {
    notFound();
  }

  const { t } = await getServerTranslation();

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8 md:max-w-[1100px]">
      <Link href="/campaigns" className="text-sm font-semibold text-brand hover:underline">
        ← {t("common.back")}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <CampaignBadge
          tag={campaign.tag}
          colorSlot={campaign.colorSlot}
          className="h-10 w-10 rounded-full text-sm"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-ink">{campaign.name}</h1>
          <p className="text-sm text-ink-muted">{t("diceEvents.title")}</p>
        </div>
      </div>

      <DiceEventsView
        viewerId={session.user.id}
        searchParams={await searchParams}
        basePath={`/campaigns/${id}/rolls`}
        scopedCampaignId={id}
      />
    </main>
  );
}
