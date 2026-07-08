"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLinkItem = { href: string; label: string };

/**
 * Determines whether a nav destination should be highlighted for the current
 * path. The calendar item (`/`) also owns the date-detail routes under
 * `/calendar/*`; every other item matches its own path or any nested route
 * (e.g. `/campaigns/new` highlights Campañas).
 *
 * @param {string} href - The nav item's destination.
 * @param {string} pathname - The current pathname.
 * @returns {boolean} True when the item represents the active section.
 */
function isActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/calendar");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Client nav links with active-route highlighting. Split out from the server
 * `NavBar` so only this small piece ships the `usePathname` client dependency.
 *
 * @param {{ items: NavLinkItem[] }} props - Nav destinations to render.
 * @returns {JSX.Element}
 */
export default function NavLinks({ items }: { items: NavLinkItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              active
                ? "bg-brand text-bg-elevated"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
