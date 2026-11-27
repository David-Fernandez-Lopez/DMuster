import Link from "next/link";

interface DiceViewToggleProps {
  /** Which view is active. */
  current: "tabla" | "lista";
  /** Href of each view, keeping the active filters. */
  hrefs: { tabla: string; lista: string };
  labels: { tabla: string; lista: string; group: string };
}

/**
 * Segmented control between the table and the list view, in the statistics
 * handoff's style (bordered, 8px radius, the active one filled with `brand`).
 * Plain links, so the view lives in the URL and works without JavaScript.
 *
 * @param {DiceViewToggleProps} props
 * @returns {JSX.Element}
 */
export default function DiceViewToggle({ current, hrefs, labels }: DiceViewToggleProps) {
  return (
    <nav
      aria-label={labels.group}
      className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border bg-bg-elevated"
    >
      {(["tabla", "lista"] as const).map((view) => (
        <Link
          key={view}
          href={hrefs[view]}
          aria-current={current === view ? "page" : undefined}
          className={`flex min-h-[44px] items-center px-4 text-[13px] font-bold ${
            current === view ? "bg-brand text-bg" : "text-ink hover:bg-brand-soft"
          }`}
        >
          {labels[view]}
        </Link>
      ))}
    </nav>
  );
}
