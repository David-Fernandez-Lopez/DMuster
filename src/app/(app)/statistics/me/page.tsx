import { getServerTranslation } from "@/i18n/server";

/**
 * Placeholder until this tab is built.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function StatisticsTabPlaceholder() {
  const { t } = await getServerTranslation();
  return <p className="text-sm text-ink-muted">{t("statistics.comingSoon")}</p>;
}
