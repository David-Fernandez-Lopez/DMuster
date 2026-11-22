"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

const TABS = [
  { href: "/statistics/group", key: "group" },
  { href: "/statistics/campaigns", key: "campaigns" },
  { href: "/statistics/me", key: "me" },
] as const;

/**
 * Segmented control with the three statistics tabs. Each tab is a real route;
 * the current `?period=` is carried over so the period is shared between them.
 *
 * @returns {JSX.Element}
 */
export default function StatisticsTabs() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const period = useSearchParams().get("period");
  const query = period ? `?period=${encodeURIComponent(period)}` : "";

  return (
    <nav
      aria-label={t("statistics.tabs.label")}
      className="mb-[18px] flex max-w-[480px] overflow-hidden rounded-[var(--radius-control)] border border-border bg-bg-elevated"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={`${tab.href}${query}`}
            aria-current={active ? "page" : undefined}
            className={`flex-1 px-1.5 py-[10px] text-center text-[13px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
              active ? "bg-brand text-on-brand" : "text-ink"
            }`}
          >
            {t(`statistics.tabs.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
