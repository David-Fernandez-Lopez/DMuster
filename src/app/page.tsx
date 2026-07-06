import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/(auth)/actions";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";

/**
 * Home page. Requires an authenticated session (the proxy already redirects
 * anonymous users, but the session is verified here against the database).
 * Shows a greeting and a logout control until the calendar view is built.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
        {t("home.welcome", { name: session.user.name ?? "" })}
      </h1>
      <p className="text-lg text-ink-muted">{t("common.tagline")}</p>
      <div className="flex items-center gap-3">
        <Link
          href="/campaigns"
          className="flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-border px-4 font-semibold text-ink transition-colors hover:bg-brand-soft"
        >
          {t("nav.campaigns")}
        </Link>
        <Link
          href="/profile"
          className="flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-border px-4 font-semibold text-ink transition-colors hover:bg-brand-soft"
        >
          {t("nav.profile")}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="min-h-[44px] rounded-[var(--radius-control)] border border-border px-4 font-semibold text-ink transition-colors hover:bg-brand-soft"
          >
            {t("nav.logout")}
          </button>
        </form>
      </div>
    </main>
  );
}
