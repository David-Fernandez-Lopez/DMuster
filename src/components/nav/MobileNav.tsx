"use client";

import { useEffect, useId, useRef, useState } from "react";

import MenuToggleIcon from "@/components/nav/MenuToggleIcon";
import NavLinks, { type NavLinkItem } from "@/components/nav/NavLinks";

interface MobileNavProps {
  /** Nav destinations, already translated by the server `NavBar`. */
  items: NavLinkItem[];
  /** The logout server action, reused inside the dropdown panel. */
  logout: () => void | Promise<void>;
  /** Translated labels for the toggle (`open`/`close`) and the logout button. */
  labels: { open: string; close: string; logout: string };
}

/**
 * Mobile navigation control shown below the `lg` breakpoint: a hamburger button
 * that toggles a dropdown panel holding the same destinations and logout action
 * as the desktop bar. Owns the open/close state so the server `NavBar` can stay
 * a server component. Closing is wired for Escape, an outside click, and tapping
 * any destination; focus moves into the panel on open and back to the button on
 * close. The toggle glyph animates (bars → spinning hexagon) via `MenuToggleIcon`.
 *
 * @param {MobileNavProps} props - Destinations, the logout action, and labels.
 * @returns {JSX.Element} The mobile hamburger menu.
 */
export default function MobileNav({ items, logout, labels }: MobileNavProps) {
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
  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto lg:hidden">
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
          <NavLinks
            items={items}
            orientation="vertical"
            onNavigate={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />

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
