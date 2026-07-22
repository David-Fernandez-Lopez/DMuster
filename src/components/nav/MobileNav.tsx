"use client";

import { useEffect, useId, useRef, useState } from "react";

import MenuToggleIcon from "@/components/nav/MenuToggleIcon";
import NavLinks, { type NavLinkItem } from "@/components/nav/NavLinks";

interface MobileNavProps {
  /** Primary destinations (Calendario, Disponibilidad, Campañas). Shown inline on
   * desktop, so the panel only repeats them below the `lg` breakpoint. */
  primaryItems: NavLinkItem[];
  /** Account-type actions (Gestionar festivos, Perfil). Only ever shown in the
   * panel — desktop users reach them through the hamburger too. */
  menuItems: NavLinkItem[];
  /** The logout server action, reused inside the dropdown panel. */
  logout: () => void | Promise<void>;
  /** Translated labels for the toggle (`open`/`close`) and the logout button. */
  labels: { open: string; close: string; logout: string };
}

/**
 * Always-visible hamburger control: a button that toggles a dropdown panel.
 * Below `lg` the panel repeats the primary destinations plus the account-type
 * actions and logout (everything folds in). From `lg` up the primary
 * destinations sit inline in the bar instead, so the panel holds only the
 * account-type actions and logout. Owns the open/close state so the server
 * `NavBar` can stay a server component. Closing is wired for Escape, an outside
 * click, and tapping any destination; focus moves into the panel on open and
 * back to the button on close. The toggle glyph animates (bars → spinning
 * hexagon) via `MenuToggleIcon`.
 *
 * @param {MobileNavProps} props - Destinations, the logout action, and labels.
 * @returns {JSX.Element} The hamburger menu.
 */
export default function MobileNav({
  primaryItems,
  menuItems,
  logout,
  labels,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape or on a click outside the menu; only while open.
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  // Move focus into the panel on open and restore it to the button on close.
  // The primary-items group is `lg:hidden` on desktop, so skip links that
  // aren't actually rendered (offsetParent is null while display: none).
  useEffect(() => {
    if (open) {
      const candidates =
        panelRef.current?.querySelectorAll<HTMLElement>("a, button");
      const firstVisible = candidates
        ? Array.from(candidates).find((element) => element.offsetParent !== null)
        : undefined;
      firstVisible?.focus();
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-ink transition-colors hover:bg-brand-soft"
      >
        <MenuToggleIcon open={open} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute right-0 top-full z-20 mt-2 w-56 origin-top-right rounded-[var(--radius-card)] border border-border bg-bg-elevated p-2 shadow-lg"
        >
          <div className="lg:hidden">
            <NavLinks
              items={primaryItems}
              orientation="vertical"
              onNavigate={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            />
          </div>

          <div className="mt-1 border-t border-border pt-1 lg:mt-0 lg:border-t-0 lg:pt-0">
            <NavLinks
              items={menuItems}
              orientation="vertical"
              onNavigate={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            />
          </div>

          <form action={logout} className="mt-1 border-t border-border pt-1">
            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center rounded-full px-4 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              {labels.logout}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
