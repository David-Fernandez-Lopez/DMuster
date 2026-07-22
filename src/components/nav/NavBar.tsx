import Link from "next/link";

import { logout } from "@/app/(auth)/actions";
import MobileNav from "@/components/nav/MobileNav";
import NavLinks, { type NavLinkItem } from "@/components/nav/NavLinks";
import { getServerTranslation } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { isDmOfAnyCampaign } from "@/lib/authz";

/**
 * Shared top navigation bar rendered above every authenticated page by the
 * `(app)` route-group layout. Carries the brand mark, the primary destinations
 * (with active-route highlight, handled client-side by `NavLinks`) inline from
 * `lg` up, and an always-visible hamburger (`MobileNav`) holding the
 * account-type actions (Gestionar festivos, Perfil, Cerrar sesión) on desktop
 * and every destination on mobile. Stays a server component — all
 * interactivity lives in the children.
 *
 * @returns {Promise<JSX.Element>}
 */
export default async function NavBar() {
  const { t } = await getServerTranslation();
  const session = await auth();
  const canManageHolidays = session?.user
    ? await isDmOfAnyCampaign(session.user.id)
    : false;

  const primaryItems: NavLinkItem[] = [
    { href: "/", label: t("nav.calendar") },
    { href: "/availability", label: t("nav.availability") },
    { href: "/campaigns", label: t("nav.campaigns") },
  ];

  const menuItems: NavLinkItem[] = [
    ...(canManageHolidays
      ? [{ href: "/holidays", label: t("holidays.manage") }]
      : []),
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

        {/* Desktop (lg+): primary links inline; account actions stay in the hamburger. */}
        <div className="ml-auto hidden items-center gap-x-4 lg:flex">
          <NavLinks items={primaryItems} />
        </div>

        {/* Always-visible hamburger: account actions on desktop, everything on mobile. */}
        <MobileNav
          primaryItems={primaryItems}
          menuItems={menuItems}
          logout={logout}
          labels={{
            open: t("nav.openMenu"),
            close: t("nav.closeMenu"),
            logout: t("nav.logout"),
          }}
        />
      </div>
    </header>
  );
}
