/**
 * Presentational icon for the mobile menu toggle. Driven entirely by the `open`
 * prop through conditional Tailwind classes (no global CSS beyond the `spin-hex`
 * keyframes): closed it is a three-bar hamburger; when opened the bars rotate and
 * converge toward the center and fade out while the brand hexagon scales in and
 * spins continuously on its center. Keeping the state on the component (rather
 * than a global `[data-open]` selector) means React re-renders the classes on
 * every toggle, which is reliable under HMR. `motion-safe:` gates the continuous
 * spin so `prefers-reduced-motion` users just get the crossfade.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the menu is currently open.
 * @param {string} [props.className] - Sizing/color classes for the SVG.
 * @returns {JSX.Element} The animated hamburger/hexagon glyph.
 */
export default function MenuToggleIcon({
  open,
  className = "h-6 w-6",
}: {
  open: boolean;
  className?: string;
}) {
  const barBase =
    "origin-center [transform-box:fill-box] transition-all duration-300 ease-in-out";

  return (
    <svg
      viewBox="0 0 24 24"
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      {/* Hamburger bars: converge to the center and fade out when open. */}
      <g fill="currentColor">
        <rect
          x="3"
          y="6"
          width="18"
          height="2"
          rx="1"
          className={`${barBase} ${
            open ? "translate-y-[5px] rotate-[120deg] opacity-0" : ""
          }`}
        />
        <rect
          x="3"
          y="11"
          width="18"
          height="2"
          rx="1"
          className={`${barBase} ${open ? "rotate-[60deg] opacity-0" : ""}`}
        />
        <rect
          x="3"
          y="16"
          width="18"
          height="2"
          rx="1"
          className={`${barBase} ${
            open ? "-translate-y-[5px] -rotate-[120deg] opacity-0" : ""
          }`}
        />
      </g>

      {/* Brand hexagon: scales in when open; the path itself spins on its center. */}
      <g
        className={`origin-center [transform-box:fill-box] text-brand transition-all duration-300 ease-in-out ${
          open ? "scale-100 opacity-100" : "scale-[0.6] opacity-0"
        }`}
      >
        <path
          d="M12 2 21 7v10l-9 5-9-5V7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          className={`origin-center [transform-box:fill-box] ${
            open ? "motion-safe:animate-[spin-hex_3s_linear_infinite]" : ""
          }`}
        />
      </g>
    </svg>
  );
}
