import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ArcManager from "@/components/campaigns/ArcManager";
import CampaignForm from "@/components/campaigns/CampaignForm";
import CampaignRequirementsForm from "@/components/campaigns/CampaignRequirementsForm";
import { CampaignRole } from "@/generated/prisma/enums";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { listCampaignArcs } from "@/lib/campaignArcService";
import { getCampaignRequirements } from "@/lib/campaignRequirementsService";
import { getCampaignForUser, listSystemOptions, listUsedColorSlots } from "@/lib/campaignService";

type EditCampaignPageProps = { params: Promise<{ id: string }> };

/**
 * Edit campaign page. Restricted to a DM of the campaign: non-members (and
 * unknown ids) get the not-found page, and members who are only players are
 * redirected to the list. This mirrors the API guard as defense-in-depth — the
 * PUT still returns 403 regardless. Below the campaign's details sits its own
 * card for the next session's requirements (roadmap #25), saved separately.
 *
 * @param {EditCampaignPageProps} props - Route props with the async `params`.
 * @returns {Promise<JSX.Element>}
 */
export default async function EditCampaignPage({
  params,
}: EditCampaignPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const campaign = await getCampaignForUser(id, session.user.id);
  if (!campaign) {
    notFound();
  }
  if (campaign.role !== CampaignRole.DM) {
    redirect("/campaigns");
  }

  const [{ t }, requirements, usedColorSlots, arcs, systems] = await Promise.all([
    getServerTranslation(),
    getCampaignRequirements(campaign.id),
    listUsedColorSlots(campaign.id),
    listCampaignArcs(campaign.id),
    listSystemOptions(campaign.systemId),
  ]);

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <Link
        href="/campaigns"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <h1 className="mt-4 mb-6 font-display text-3xl font-semibold text-ink">
        {t("campaigns.editTitle")}
      </h1>

      <CampaignForm
        campaign={{
          id: campaign.id,
          name: campaign.name,
          tag: campaign.tag,
          description: campaign.description,
          colorSlot: campaign.colorSlot,
          systemId: campaign.systemId,
        }}
        usedColorSlots={usedColorSlots}
        systems={systems}
      />

      {requirements ? (
        <CampaignRequirementsForm
          campaignId={campaign.id}
          players={requirements.players}
          minPlayers={requirements.minPlayers}
          requirementsWindow={requirements.window}
        />
      ) : null}

      <ArcManager key={arcs.map((arc) => `${arc.id}:${arc.name}`).join("|")} campaignId={campaign.id} arcs={arcs} />
    </main>
  );
}
