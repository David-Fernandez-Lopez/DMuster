"use client";

import { useId, useState } from "react";

interface CampaignSectionProps {
  /** Section heading, already translated by the server component. */
  title: string;
  /** Number of campaigns in the group, shown next to the title. */
  count: number;
  /** Initial open state on mobile (desktop is always expanded). */
  defaultOpen: boolean;
  /** The `<ul>` of campaign cards, or the empty-group hint. */
  children: React.ReactNode;
}

/**
 * One campaign group (e.g. "As DM" / "As player"). On mobile it is a collapsible
 * accordion driven by local state; from the `md` breakpoint up the content is
 * always shown and the header stops acting as a toggle, so the two groups sit
 * side by side as columns. The children are server-rendered cards passed
 * through untouched.
 *
 * @param {CampaignSectionProps} props - Title, count, initial state, children.
 * @returns {JSX.Element} The collapsible/column section.
 */
export default function CampaignSection({
  title,
  count,
  defaultOpen,
  children,
}: CampaignSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-[44px] w-full items-center gap-2 text-left md:pointer-events-none md:cursor-default"
      >
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <span className="text-sm font-semibold text-ink-muted">{count}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-auto h-5 w-5 text-ink-muted transition-transform md:hidden ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      <div
        id={contentId}
        className={`mt-3 ${open ? "block" : "hidden"} md:block`}
      >
        {children}
      </div>
    </section>
  );
}
