"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { parsePeriod } from "@/lib/statistics/period";

interface PeriodSelectProps {
  /** Selectable periods, in display order. */
  periods: string[];
}

/**
 * Pill-shaped period selector shared by the three statistics tabs. The period
 * lives in the URL (`?period=`), so it survives tab changes and can be shared;
 * changing it navigates to the same page with the new value.
 *
 * @param {PeriodSelectProps} props - The selectable periods.
 * @returns {JSX.Element}
 */
export default function PeriodSelect({ periods }: PeriodSelectProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parsePeriod(searchParams.get("period") ?? undefined);
  const options = periods.includes(current) ? periods : [...periods, current];

  /**
   * Label of one option: the translated word for the two named periods, the
   * year otherwise.
   *
   * @param {string} value - A period value.
   * @returns {string} The option label.
   */
  function labelOf(value: string): string {
    return value === "all" || value === "last12" ? t(`statistics.period.${value}`) : value;
  }

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("statistics.period.label")}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute left-[10px]"
      >
        <rect x="2" y="3" width="12" height="11" rx="2" className="fill-none stroke-brand" strokeWidth="1.3" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" className="stroke-brand" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <select
        value={current}
        onChange={(event) => router.push(`${pathname}?period=${event.target.value}`)}
        className="cursor-pointer appearance-none rounded-full border border-border bg-bg-elevated py-[7px] pl-[30px] pr-7 text-[13px] font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {labelOf(value)}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute right-3"
      >
        <path d="M2 3.5l3 3 3-3" className="fill-none stroke-ink-muted" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </label>
  );
}
