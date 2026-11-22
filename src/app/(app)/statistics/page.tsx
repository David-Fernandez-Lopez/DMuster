import { redirect } from "next/navigation";

type StatisticsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

/**
 * `/statistics` lands on the group tab, keeping a `?period=` if one was given.
 *
 * @param {StatisticsPageProps} props - Route props with the async search params.
 * @returns {Promise<never>}
 */
export default async function StatisticsPage({ searchParams }: StatisticsPageProps) {
  const { period } = await searchParams;
  const value = Array.isArray(period) ? period[0] : period;
  redirect(`/statistics/group${value ? `?period=${encodeURIComponent(value)}` : ""}`);
}
