import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import LocaleSelector from "@/components/profile/LocaleSelector";
import ThemeSelector from "@/components/profile/ThemeSelector";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

/**
 * Profile page. Shows the user's identity (avatar initial, name, email) and a
 * settings card with language and theme selectors. Requires an authenticated
 * session (the proxy redirects anonymous users; verified again here).
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  const themeValue = (await cookies()).get(THEME_COOKIE)?.value;
  const initialTheme = isTheme(themeValue) ? themeValue : null;

  // Holiday management is a DM power (no global admin role — CLAUDE.md §4), so
  // the entry point only shows for users who are DM of at least one campaign.
  const canManageHolidays = await isDmOfAnyCampaign(session.user.id);

  const name = session.user.name ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <Link
        href="/"
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← {t("common.back")}
      </Link>

      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">
        {t("profile.title")}
      </h1>

      <div className="mt-6 flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xl font-bold text-brand"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink">{name}</p>
          <p className="truncate text-sm text-ink-muted">{session.user.email}</p>
        </div>
      </div>

      <section className="mt-8 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-bg-elevated px-6 py-2">
        <LocaleSelector />
        <ThemeSelector initialTheme={initialTheme} />
      </section>

      {canManageHolidays ? (
        <Link
          href="/holidays"
          className="mt-6 flex min-h-[56px] items-center justify-between rounded-[var(--radius-card)] border border-border bg-bg-elevated px-6 py-4 font-semibold text-ink transition-colors hover:bg-brand-soft"
        >
          {t("holidays.manage")}
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
        </Link>
      ) : null}
    </main>
  );
}
