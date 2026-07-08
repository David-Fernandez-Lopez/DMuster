import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isValidIsoDate, toUtcDate } from "@/lib/date";

/**
 * Date detail page (`/calendar/[date]`). Currently a minimal stub: it validates
 * the date param and renders the long localized date with a back link to the
 * month being viewed. The own-response toggle and per-campaign viability
 * breakdown are added in later steps (#16 and #18). Requires an authenticated
 * session.
 *
 * @param {{ params: Promise<{ date: string }> }} props
 * @returns {Promise<JSX.Element>}
 */
export default async function DateDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { date } = await params;
  if (!isValidIsoDate(date)) {
    notFound();
  }

  const { t, locale } = await getServerTranslation();

  const longDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(date));
  const title = longDate.charAt(0).toUpperCase() + longDate.slice(1);

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-8">
      <Link
        href={`/?month=${date.slice(0, 7)}`}
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
        {title}
      </h1>
    </main>
  );
}
