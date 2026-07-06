import type { TFunction } from "i18next";
import Link from "next/link";
import { redirect } from "next/navigation";

import CampaignCard from "@/components/campaigns/CampaignCard";
import CampaignSection from "@/components/campaigns/CampaignSection";
import { CampaignRole } from "@/generated/prisma/enums";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  type CampaignWithRole,
  listCampaignsForUser,
} from "@/lib/campaignService";

/**
 * Renders a group's body: the list of campaign cards, or a muted hint when the
 * group is empty (keeps the two desktop columns aligned).
 *
 * @param {CampaignWithRole[]} campaigns - Campaigns in this group.
 * @param {string} emptyHint - Translated hint shown when the group is empty.
 * @param {TFunction} t - Server-side translation function.
 * @returns {JSX.Element} The list or the empty hint.
 */
function renderGroupBody(
  campaigns: CampaignWithRole[],
  emptyHint: string,
  t: TFunction,
) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyHint}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} t={t} />
      ))}
    </ul>
  );
}

/**
 * Campaigns list page. Shows the campaigns the session user belongs to, split
 * into two groups — where they are DM and where they are a player. On desktop
 * the groups are two columns; on mobile they are collapsible accordions (DM
 * open, player collapsed). Reads directly through the service layer; mutations
 * go through the API.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();
  const campaigns = await listCampaignsForUser(session.user.id);

  const dmCampaigns = campaigns.filter((c) => c.role === CampaignRole.DM);
  const playerCampaigns = campaigns.filter(
    (c) => c.role === CampaignRole.PLAYER,
  );

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8 md:max-w-4xl">
      <Link
        href="/"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {t("campaigns.title")}
        </h1>
        <Link
          href="/campaigns/new"
          className="flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-control)] bg-brand px-4 text-sm font-semibold text-bg-elevated transition-opacity hover:opacity-90"
        >
          {t("campaigns.new")}
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-6 text-center">
          <p className="font-bold text-ink">{t("campaigns.empty")}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {t("campaigns.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <CampaignSection
            title={t("campaigns.groups.dm")}
            count={dmCampaigns.length}
            defaultOpen
          >
            {renderGroupBody(dmCampaigns, t("campaigns.groups.dmEmpty"), t)}
          </CampaignSection>
          <CampaignSection
            title={t("campaigns.groups.player")}
            count={playerCampaigns.length}
            defaultOpen={false}
          >
            {renderGroupBody(
              playerCampaigns,
              t("campaigns.groups.playerEmpty"),
              t,
            )}
          </CampaignSection>
        </div>
      )}
    </main>
  );
}
