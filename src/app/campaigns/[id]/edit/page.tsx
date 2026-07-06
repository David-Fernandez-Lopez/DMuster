import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CampaignForm from "@/components/campaigns/CampaignForm";
import { CampaignRole } from "@/generated/prisma/enums";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { getCampaignForUser } from "@/lib/campaignService";

type EditCampaignPageProps = { params: Promise<{ id: string }> };

/**
 * Edit campaign page. Restricted to a DM of the campaign: non-members (and
 * unknown ids) get the not-found page, and members who are only players are
 * redirected to the list. This mirrors the API guard as defense-in-depth — the
 * PUT still returns 403 regardless.
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

  const { t } = await getServerTranslation();

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
        }}
      />
    </main>
  );
}
