import type { TFunction } from "i18next";
import Link from "next/link";

import { CampaignRole } from "@/generated/prisma/enums";
import type { CampaignWithRole } from "@/lib/campaignService";

import DeleteCampaignButton from "./DeleteCampaignButton";

interface CampaignCardProps {
  campaign: CampaignWithRole;
  /** Server-side translation function from `getServerTranslation`. */
  t: TFunction;
}

/**
 * Single campaign row: tag chip, name, an optional description, and — only for
 * a DM of that campaign — edit/delete controls. The member's role is conveyed
 * by the enclosing section header, not repeated here. Hiding the controls for
 * non-DMs is the visible half of the authorization (the API enforces it too).
 *
 * @param {CampaignCardProps} props - The campaign and the server `t`.
 * @returns {JSX.Element} The campaign card.
 */
export default function CampaignCard({ campaign, t }: CampaignCardProps) {
  const isDm = campaign.role === CampaignRole.DM;

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold uppercase text-brand"
        >
          {campaign.tag}
        </span>
        <p className="min-w-0 flex-1 truncate font-bold text-ink">
          {campaign.name}
        </p>
      </div>

      {campaign.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
          {campaign.description}
        </p>
      ) : null}

      {isDm ? (
        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className="flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft"
          >
            {t("campaigns.actions.edit")}
          </Link>
          <DeleteCampaignButton campaignId={campaign.id} />
        </div>
      ) : null}
    </li>
  );
}
