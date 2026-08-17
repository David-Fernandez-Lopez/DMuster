"use client";

/**
 * Primary submit button for the auth forms. Vellum ("vitela clara") surface with
 * the brand-colored double fillet; disabled while the action is pending.
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
      className="btn btn-primary min-h-[44px] px-4 font-semibold disabled:opacity-60"
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}
