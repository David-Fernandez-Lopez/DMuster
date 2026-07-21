"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLinkItem = { href: string; label: string };

/** Layout of the links: inline row (desktop) or stacked column (mobile panel). */
export type NavLinksOrientation = "horizontal" | "vertical";

/**
 * Determines whether a nav destination should be highlighted for the current
 * path. The calendar item (`/`) matches only the home path; every other item
 * matches its own path or any nested route (e.g. `/campaigns/new` highlights
 * Campañas).
 *
 * @param {string} href - The nav item's destination.
 * @param {string} pathname - The current pathname.
 * @returns {boolean} True when the item represents the active section.
 */
function isActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Client nav links with active-route highlighting. Split out from the server
 * `NavBar` so only this small piece ships the `usePathname` client dependency.
 * Renders inline by default (desktop) or stacked full-width for the mobile
 * dropdown panel (`orientation="vertical"`), where `onNavigate` lets the caller
 * close the menu once a destination is tapped.
 *
 * @param {object} props - Component props.
 * @param {NavLinkItem[]} props.items - Nav destinations to render.
 * @param {NavLinksOrientation} [props.orientation] - Inline row or stacked column.
 * @param {() => void} [props.onNavigate] - Called after a link is tapped (e.g. to close the mobile menu).
 * @returns {JSX.Element}
 */
export default function NavLinks({
  items,
  orientation = "horizontal",
  onNavigate,
}: {
  items: NavLinkItem[];
  orientation?: NavLinksOrientation;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav
      className={
        vertical
          ? "flex flex-col items-stretch gap-1"
          : "flex flex-wrap items-center gap-1"
      }
    >
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              vertical ? "w-full" : ""
            } ${
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
