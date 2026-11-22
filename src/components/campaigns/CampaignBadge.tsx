import { campaignColor, campaignTint } from "@/lib/campaignColor";

interface CampaignBadgeProps {
  /** The campaign's two-letter tag. */
  tag: string;
  /** Palette slot of the campaign's colour. */
  colorSlot: number;
  /** Size and shape (width/height, radius, text size); the colours are set here. */
  className?: string;
}

/**
 * A campaign's tag in a pill tinted with the campaign's own colour, so the same
 * campaign looks the same everywhere (list, sessions, filters, statistics). The
 * tag is the label and the colour only helps to group, so it stays readable
 * without it. Decorative: the campaign's name is always next to it.
 *
 * @param {CampaignBadgeProps} props - The tag, the colour slot and the sizing classes.
 * @returns {JSX.Element}
 */
export default function CampaignBadge({
  tag,
  colorSlot,
  className = "h-7 min-w-7 rounded-full px-1.5 text-xs",
}: CampaignBadgeProps) {
  return (
    <span
      aria-hidden="true"
      style={{ background: campaignTint(colorSlot), borderColor: campaignColor(colorSlot) }}
      className={`inline-flex shrink-0 items-center justify-center border-[1.5px] font-bold uppercase text-ink ${className}`}
    >
      {tag}
    </span>
  );
}
