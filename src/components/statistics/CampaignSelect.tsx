"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

interface CampaignSelectProps {
  /** The user's campaigns, archived last. */
  campaigns: { id: string; tag: string; name: string; archived: boolean }[];
  /** Id of the campaign shown. */
  current: string;
}

/**
 * Full-width select that switches the campaign shown in the "Mis campañas" tab,
 * keeping the selected period. Lists "AC · Academia" and marks archived ones.
 *
 * @param {CampaignSelectProps} props - The user's campaigns and the current one.
 * @returns {JSX.Element}
 */
export default function CampaignSelect({ campaigns, current }: CampaignSelectProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const period = useSearchParams().get("period");

  return (
    <label className="relative block max-w-[480px]">
      <span className="sr-only">{t("statistics.campaign.selectLabel")}</span>
      <select
        value={current}
        onChange={(event) => {
          const query = period ? `?period=${encodeURIComponent(period)}` : "";
          router.push(`${pathname.replace(/\/[^/]+$/, "")}/${event.target.value}${query}`);
        }}
        className="w-full cursor-pointer appearance-none rounded-[var(--radius-control)] border border-border bg-bg-elevated py-[10px] pl-3 pr-[34px] text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.tag} · {campaign.name}
            {campaign.archived ? ` ${t("statistics.campaign.archivedSuffix")}` : ""}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute right-[14px] top-1/2 -mt-[5px]"
      >
        <path d="M2 3.5l3 3 3-3" className="fill-none stroke-ink-muted" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </label>
  );
}
