/**
 * Placeholder shown while a statistics tab loads: the same card grid as the
 * tabs themselves, pulsing.
 *
 * @returns {JSX.Element}
 */
export default function StatisticsLoading() {
  return (
    <div
      aria-hidden="true"
      className="grid animate-pulse grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[10px]"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="h-[120px] rounded-[var(--radius-card)] border border-border bg-bg-elevated"
        />
      ))}
    </div>
  );
}
