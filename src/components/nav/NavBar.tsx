import Link from "next/link";

import { logout } from "@/app/(auth)/actions";
import NavLinks, { type NavLinkItem } from "@/components/nav/NavLinks";
import { getServerTranslation } from "@/i18n/server";

/**
 * Shared top navigation bar rendered above every authenticated page by the
 * `(app)` route-group layout. Carries the brand mark, the primary destinations
 * (with active-route highlight, handled client-side by `NavLinks`) and a logout
 * control reusing the `logout` server action. Mobile-first: the links wrap to a
 * second row on narrow viewports.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function NavBar() {
  const { t } = await getServerTranslation();

  const items: NavLinkItem[] = [
    { href: "/", label: t("nav.calendar") },
    { href: "/availability", label: t("nav.availability") },
    { href: "/campaigns", label: t("nav.campaigns") },
    { href: "/profile", label: t("nav.profile") },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-brand"
            aria-hidden="true"
          >
            <path
              d="M12 2 21 7v10l-9 5-9-5V7z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-xl font-semibold tracking-wide">
            {t("common.appName")}
          </span>
        </Link>

        <NavLinks items={items} />

        <form action={logout} className="ml-auto">
          <button
            type="submit"
            className="flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            {t("nav.logout")}
          </button>
        </form>
      </div>
    </header>
  );
}
