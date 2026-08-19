import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import GoogleCalendarConnection from "@/components/profile/GoogleCalendarConnection";
import LocaleSelector from "@/components/profile/LocaleSelector";
import ThemeSelector from "@/components/profile/ThemeSelector";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/google/connectionService";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";

const CALLBACK_OUTCOMES = ["connected", "already_linked", "error"] as const;

/**
 * Profile page. Shows the user's identity (avatar initial, name, email) and a
 * settings card with language, theme and Google Calendar sync controls.
 * Requires an authenticated session (the proxy redirects anonymous users;
 * verified again here).
 *
 * @param {{ searchParams: Promise<{ google?: string }> }} props - Carries the
 *   one-time `?google=...` outcome from a just-completed OAuth round trip.
 * @returns {Promise<JSX.Element>}
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { t } = await getServerTranslation();

  // Mirror the root layout: device cookie wins, else the persisted `User.theme`,
  // so the segmented control reflects the saved choice on a fresh browser.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const initialTheme = resolveTheme(cookieTheme, session.user.theme) ?? null;

  const googleConnectionStatus = await getConnectionStatus(session.user.id);
  const { google: rawCallbackOutcome } = await searchParams;
  const callbackOutcome = CALLBACK_OUTCOMES.find((outcome) => outcome === rawCallbackOutcome) ?? null;

  const name = session.user.name ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-ink">
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
        <GoogleCalendarConnection status={googleConnectionStatus} callbackOutcome={callbackOutcome} />
      </section>
    </main>
  );
}
