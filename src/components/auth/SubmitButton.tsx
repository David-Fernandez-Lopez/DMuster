"use client";

/**
 * Primary submit button for the auth forms. Filled with the brand color and
 * disabled while the action is pending.
 *
 * @param {{ label: string; pendingLabel: string; isPending: boolean }} props
 * @returns {JSX.Element} The submit button.
 */
export default function SubmitButton({
  label,
  pendingLabel,
  isPending,
}: {
  label: string;
  pendingLabel: string;
  isPending: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={isPending}
      className="min-h-[44px] rounded-[var(--radius-control)] bg-brand px-4 font-semibold text-bg-elevated transition-opacity disabled:opacity-60"
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}
