import Link from "next/link";
import { redirect } from "next/navigation";

import CampaignForm from "@/components/campaigns/CampaignForm";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";

/**
 * New campaign page. Any authenticated user may create a campaign (becoming its
 * DM). Renders the shared campaign form in create mode.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function NewCampaignPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
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
        {t("campaigns.new")}
      </h1>

      <CampaignForm />
    </main>
  );
}
