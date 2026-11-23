import DiceKindIcon from "@/components/dice/DiceKindIcon";
import type { DiceEventKind } from "@/generated/prisma/enums";

interface DiceKindBadgeProps {
  kind: DiceEventKind;
  /** The kind's translated name, shown next to the icon. */
  label: string;
}

/**
 * Pill naming a critical or a fumble. Follows the statistics handoff: the S/O/T/N
 * state colours are reserved for availability answers, so the two kinds are told
 * apart with `brand` alone — a solid soft pill for a critical, a dashed outline
 * for a fumble — and always with an icon and the text, never colour alone.
 *
 * @param {DiceKindBadgeProps} props
 * @returns {JSX.Element}
 */
export default function DiceKindBadge({ kind, label }: DiceKindBadgeProps) {
  const style =
    kind === "CRITICAL"
      ? "border border-brand bg-brand-soft text-brand"
      : "border border-dashed border-brand bg-transparent text-brand";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${style}`}>
      <DiceKindIcon kind={kind} className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
