import { redirect } from "next/navigation";
import { Suspense } from "react";

import PeriodSelect from "@/components/statistics/PeriodSelect";
import StatisticsTabs from "@/components/statistics/StatisticsTabs";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { getAvailablePeriods } from "@/lib/statistics/statisticsService";

/**
 * Shell of the statistics section: title, the period selector and the three
 * tabs, shared by every tab. Only signed-in users get in. The period lives in
 * the URL, so the selector and the tabs read it themselves (hence `Suspense`).
 *
 * @param {{ children: React.ReactNode }} props - The active tab's page.
 * @returns {Promise<JSX.Element>}
 */
export default async function StatisticsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();
  const periods = await getAvailablePeriods();

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-[18px] md:px-8 md:py-7">
      <div className="mb-[14px] flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {t("statistics.title")}
        </h1>
        <Suspense>
          <PeriodSelect periods={periods} />
        </Suspense>
      </div>
      <Suspense>
        <StatisticsTabs />
      </Suspense>
      {children}
    </main>
  );
}
