import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AddPlayerPicker from "@/components/campaigns/AddPlayerPicker";
import RemovePlayerButton from "@/components/campaigns/RemovePlayerButton";
import { CampaignRole } from "@/generated/prisma/enums";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  listAssignableUsers,
  listCampaignMembers,
} from "@/lib/campaignPlayerService";
import { getCampaignForUser } from "@/lib/campaignService";

type CampaignPlayersPageProps = { params: Promise<{ id: string }> };

/**
 * Campaign players management page. Restricted to a DM of the campaign:
 * non-members (and unknown ids) get the not-found page, and members who are
 * only players are redirected to the list. This mirrors the API guard as
 * defense-in-depth — the mutations still return 403/404 regardless.
 *
 * Lists the current members with their role and a remove control, and offers a
 * picker of registered users not yet in the campaign. Reads go straight through
 * the service layer; mutations go through the API.
 *
 * @param {CampaignPlayersPageProps} props - Route props with the async `params`.
 * @returns {Promise<JSX.Element>}
 */
export default async function CampaignPlayersPage({
  params,
}: CampaignPlayersPageProps) {
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
  const [members, assignableUsers] = await Promise.all([
    listCampaignMembers(id),
    listAssignableUsers(id),
  ]);

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <Link
        href="/campaigns"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold uppercase text-brand"
        >
          {campaign.tag}
        </span>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold text-ink">
          {campaign.name}
        </h1>
      </div>

      <h2 className="mt-6 mb-3 font-display text-xl font-semibold text-ink">
        {t("campaigns.players.title")}
      </h2>

      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold uppercase text-brand"
            >
              {member.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{member.name}</p>
              <p className="text-xs text-ink-muted">
                {t(`campaigns.role.${member.role}`)}
              </p>
            </div>
            <RemovePlayerButton campaignId={id} userId={member.userId} />
          </li>
        ))}
      </ul>

      <AddPlayerPicker campaignId={id} candidates={assignableUsers} />
    </main>
  );
}
