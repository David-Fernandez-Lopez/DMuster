import Link from "next/link";

/**
 * Dashed card for a period without sessions, with a button that widens the
 * period to the whole history.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Translated title ("Sin partidas en …").
 * @param {string} props.text - Translated explanation.
 * @param {string} props.action - Translated button label.
 * @param {string} props.href - Where the button goes (same page, `?period=all`).
 * @returns {JSX.Element}
 */
export default function EmptyState({
  title,
  text,
  action,
  href,
}: {
  title: string;
  text: string;
  action: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[10px] rounded-[var(--radius-card)] border border-dashed border-border bg-bg-elevated px-5 py-9 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M8 30 L20 8 L32 30 Z"
          className="fill-none stroke-ink-muted"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M14 30 L20 20 L26 30" className="fill-none stroke-ink-muted" strokeWidth="1.3" />
      </svg>
      <p className="font-display text-[17px] font-semibold text-ink">{title}</p>
      <p className="max-w-[260px] text-[13px] leading-normal text-ink-muted">{text}</p>
      <Link
        href={href}
        className="rounded-[var(--radius-control)] border border-brand px-[14px] py-2 text-[13px] font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {action}
      </Link>
    </div>
  );
}
