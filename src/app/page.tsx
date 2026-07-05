import LocaleBadge from "@/components/LocaleBadge";
import { getServerTranslation } from "@/i18n/server";

/**
 * Home page — placeholder until the calendar view is implemented.
 * Renders translated keys on the server and a client badge to exercise
 * both sides of the i18n setup.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function Home() {
  const { t } = await getServerTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        {t("common.appName")}
      </h1>
      <p className="mt-4 text-lg text-gray-500">{t("common.tagline")}</p>
      <LocaleBadge />
    </main>
  );
}
