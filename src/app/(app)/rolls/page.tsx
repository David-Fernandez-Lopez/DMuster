import { redirect } from "next/navigation";

import DiceEventsView from "@/components/dice/DiceEventsView";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";

type RollsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Global critical/fumble log: every entry of every campaign the user belongs
 * to, with filters by campaign, player, type and arc. Anonymous users go to
 * `/login`. Statistics are deliberately not here (they live in their own page).
 *
 * @param {RollsPageProps} props - Route props with the async `searchParams`.
 * @returns {Promise<JSX.Element>}
 */
export default async function RollsPage({ searchParams }: RollsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8 md:max-w-[1100px]">
      <h1 className="font-display text-3xl font-semibold text-ink">{t("diceEvents.title")}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t("diceEvents.scope")}</p>

      <DiceEventsView viewerId={session.user.id} searchParams={await searchParams} basePath="/rolls" />
    </main>
  );
}
