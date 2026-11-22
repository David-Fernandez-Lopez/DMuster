import type { TFunction } from "i18next";

import type { GroupStats, RankRow } from "@/lib/statistics/metrics";
import { pct } from "@/lib/statistics/metrics";
import type { StatisticsDirectory } from "@/lib/statistics/statisticsService";

import EmptyState from "./EmptyState";
import FameCard, { type FameRowView } from "./FameCard";
import {
  decimal,
  durationLabel,
  joinNames,
  monthLabel,
  monthShort,
  ordinal,
  shortDay,
  shortRange,
} from "./format";
import HeatmapCalendar from "./HeatmapCalendar";
import MonthlyStackedChart from "./MonthlyStackedChart";
import { CampaignChip, FewDataNote, HBar, SectionTitle } from "./primitives";
import RichText from "./RichText";
import StatCard, { CardGrid, CardLabel } from "./StatCard";

interface GroupViewProps {
  stats: GroupStats;
  directory: StatisticsDirectory;
  t: TFunction;
  locale: string;
  /** Translated name of the selected period, for the empty state. */
  periodLabel: string;
  /** Link that widens the period to the whole history. */
  showAllHref: string;
}

/** How each hall-of-fame card turns a ranking into text and a badge. */
type FameSpec = {
  id: keyof GroupStats["fame"];
  /** Name of one ranked item. */
  name: (key: string, meta?: Record<string, string | number>) => string;
  /** Text of the value column. */
  value: (value: number) => string;
  /** Secondary line for a sole winner. */
  detail?: (meta?: Record<string, string | number>) => string | undefined;
  /** Badge of a sole winner. */
  badge: (
    key: string,
    meta: Record<string, string | number> | undefined,
    value: number,
  ) => { kind: "round" | "chip"; text: string };
  note?: string;
};

/**
 * Turns a ranking into the rows a `FameCard` shows.
 *
 * @param {RankRow[]} rows - The ranking.
 * @param {FameSpec} spec - How to name and value the items.
 * @param {TFunction} t - Translation function.
 * @param {string} locale - BCP 47 locale.
 * @returns {FameRowView[]} The rows to display.
 */
function toRows(rows: RankRow[], spec: FameSpec, t: TFunction, locale: string): FameRowView[] {
  return rows.map((row) => ({
    position: row.position,
    names: joinNames(row.items.map((item) => spec.name(item.key, item.meta)), t, locale),
    tie: row.items.length > 1,
    detail: row.items.length === 1 ? spec.detail?.(row.items[0].meta) : undefined,
    value: spec.value(row.value),
  }));
}

/**
 * The group tab: key-figures sentence, hall of fame and rhythm. Shows the
 * empty state for a period without sessions and a note when there are few.
 *
 * @param {GroupViewProps} props - The view-model, its directory and i18n helpers.
 * @returns {JSX.Element}
 */
export default function GroupView({
  stats,
  directory,
  t,
  locale,
  periodLabel,
  showAllHref,
}: GroupViewProps) {
  if (stats.empty) {
    return (
      <EmptyState
        title={t("statistics.empty.title", { period: periodLabel })}
        text={t("statistics.empty.text")}
        action={t("statistics.empty.showAll")}
        href={showAllHref}
      />
    );
  }

  const campaignName = (id: string) => directory.campaigns[id]?.name ?? id;
  const userName = (id: string) => directory.users[id] ?? id;
  const initial = (id: string) => userName(id)[0] ?? "?";
  const sessions = (count: number) => t("statistics.units.session", { count });
  const percent = (value: number) => t("statistics.percent", { value });

  const specs: FameSpec[] = [
    {
      id: "campaign",
      name: campaignName,
      value: sessions,
      badge: (key) => ({ kind: "chip", text: directory.campaigns[key]?.tag ?? "" }),
    },
    {
      id: "month",
      name: (key) => monthLabel(key, locale),
      value: sessions,
      badge: (key) => ({ kind: "chip", text: monthShort(key, locale) }),
    },
    {
      id: "dm",
      name: userName,
      value: (count) => t("statistics.units.directed", { count }),
      badge: (key) => ({ kind: "round", text: initial(key) }),
    },
    {
      id: "attendanceTotal",
      name: userName,
      value: sessions,
      badge: (key) => ({ kind: "round", text: initial(key) }),
    },
    {
      id: "attendancePct",
      name: userName,
      value: percent,
      detail: (meta) =>
        meta ? t("statistics.fame.ofTotal", { attended: meta.attended, of: meta.of }) : undefined,
      badge: (key) => ({ kind: "round", text: initial(key) }),
      note: t("statistics.fame.pctNote"),
    },
    {
      id: "pair",
      name: (key) => key.split("|").map(userName).join(" & "),
      value: sessions,
      badge: (key) => ({ kind: "round", text: key.split("|").map(initial).join("") }),
    },
    {
      id: "recordMonth",
      name: userName,
      value: sessions,
      detail: (meta) => (meta ? monthLabel(String(meta.month), locale) : undefined),
      badge: (key) => ({ kind: "round", text: initial(key) }),
    },
    {
      id: "streak",
      name: (_key, meta) => (meta ? shortRange(String(meta.from), String(meta.to), locale) : ""),
      value: (count) => t("statistics.units.week", { count }),
      badge: (_key, _meta, value) => ({ kind: "chip", text: String(value) }),
    },
  ];

  const { rhythm } = stats;
  const dayMax = Math.max(1, ...rhythm.dayTypes.map((day) => day.n));
  const gapMax = Math.max(1, ...stats.gaps.map((gap) => gap.days));
  const leadColors = [
    "var(--color-brand)",
    "color-mix(in oklch, var(--color-brand) 55%, var(--color-bg-elevated))",
    "var(--color-brand-soft)",
  ];
  const schedule = rhythm.schedule;

  return (
    <div className="flex flex-col gap-[22px]">
      {stats.few ? (
        <FewDataNote>{t("statistics.few", { count: stats.played })}</FewDataNote>
      ) : null}

      <p className="max-w-[720px] text-base leading-[1.7] [text-wrap:pretty]">
        <RichText
          text={t("statistics.group.summary", {
            count: stats.played,
            campaigns: t("statistics.units.campaign", { count: stats.campaigns }),
            players: t("statistics.units.player", { count: stats.players }),
          })}
        />{" "}
        <RichText
          text={t("statistics.group.hours", {
            count: stats.played,
            hours: stats.hours,
            timed: stats.timedCount,
          })}
        />
      </p>

      <section>
        <SectionTitle>{t("statistics.group.fameTitle")}</SectionTitle>
        <CardGrid>
          {specs.map((spec) => {
            const rows = stats.fame[spec.id];
            const first = rows[0];
            const tied = (first?.items.length ?? 0) > 1;
            const sole = first?.items[0];
            return (
              <FameCard
                key={spec.id}
                title={t(`statistics.fame.${spec.id}`)}
                badge={
                  !first || tied || !sole
                    ? { kind: "round", text: "=" }
                    : spec.badge(sole.key, sole.meta, first.value)
                }
                rows={toRows(rows, spec, t, locale)}
                note={spec.note}
                tieLabel={t("statistics.tie")}
                ordinal={(position) => ordinal(position, locale)}
              />
            );
          })}
        </CardGrid>
      </section>

      <section>
        <SectionTitle>{t("statistics.group.rhythmTitle")}</SectionTitle>
        <CardGrid>
          <MonthlyStackedChart
            months={rhythm.months}
            monthMax={rhythm.monthMax}
            legend={stats.legend}
            campaigns={directory.campaigns}
          />

          <StatCard>
            <CardLabel>{t("statistics.rhythm.dayTitle")}</CardLabel>
            {rhythm.favouriteDay ? (
              <p className="mb-3 mt-1.5 text-sm leading-normal">
                <RichText
                  text={t("statistics.rhythm.dayFavourite", {
                    day: t(`statistics.rhythm.dayTypes.${rhythm.favouriteDay}`),
                    pct: rhythm.dayTypes.find((day) => day.type === rhythm.favouriteDay)?.pct ?? 0,
                  })}
                />
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              {rhythm.dayTypes.map((day) => (
                <div
                  key={day.type}
                  className="grid grid-cols-[64px_1fr_40px] items-center gap-2 text-[13px]"
                >
                  <span className="font-semibold">{t(`statistics.rhythm.dayTypes.${day.type}`)}</span>
                  <HBar percent={Math.max(2, pct(day.n, dayMax))} />
                  <span className="text-right font-bold">{percent(day.pct)}</span>
                </div>
              ))}
            </div>
          </StatCard>

          <StatCard>
            <CardLabel>{t("statistics.rhythm.scheduleTitle")}</CardLabel>
            {schedule.modeStart && schedule.avgDurationMinutes !== null ? (
              <>
                <p className="mt-1.5 text-sm leading-[1.6]">
                  <RichText
                    text={t("statistics.rhythm.schedule", {
                      start: schedule.modeStart,
                      share: schedule.modeShare,
                      duration: durationLabel(schedule.avgDurationMinutes),
                    })}
                  />
                </p>
                <div className="mt-[14px]">
                  <HBar
                    percent={schedule.afternoonPct}
                    height={8}
                  />
                </div>
                <div className="mt-[5px] flex justify-between text-[11px] font-semibold text-ink-muted">
                  <span>{t("statistics.rhythm.afternoon", { pct: schedule.afternoonPct })}</span>
                  <span>{t("statistics.rhythm.evening", { pct: schedule.eveningPct })}</span>
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-sm leading-[1.6] text-ink-muted">
                {t("statistics.rhythm.scheduleNone")}
              </p>
            )}
          </StatCard>

          <HeatmapCalendar
            heat={rhythm.heat}
            title={t("statistics.rhythm.heatTitle")}
            legend={{
              eligible: t("statistics.rhythm.heatEligible"),
              one: t("statistics.rhythm.heatOne"),
              two: t("statistics.rhythm.heatTwo"),
            }}
            locale={locale}
          />

          <StatCard>
            <div className="mb-3">
              <CardLabel>{t("statistics.rhythm.gapsTitle")}</CardLabel>
            </div>
            <div className="flex flex-col gap-[7px]">
              {stats.gaps.map((gap) => (
                <div
                  key={gap.campaignId}
                  className="grid grid-cols-[30px_1fr_38px] items-center gap-2 text-xs"
                >
                  <CampaignChip tag={directory.campaigns[gap.campaignId]?.tag ?? ""} />
                  <HBar
                    percent={pct(gap.days, gapMax)}
                    height={8}
                    track="bg-bg"
                    fill="color-mix(in oklch, var(--color-brand) 70%, var(--color-bg-elevated))"
                  />
                  <span className="text-right font-bold">
                    {t("statistics.rhythm.gapDays", { count: gap.days })}
                  </span>
                </div>
              ))}
            </div>
          </StatCard>

          <div className="flex flex-col gap-[10px]">
            {stats.forgotten ? (
              <StatCard>
                <div className="mb-2">
                  <CardLabel>{t("statistics.rhythm.forgottenTitle")}</CardLabel>
                </div>
                <div className="flex items-center gap-[10px]">
                  <CampaignChip
                    size="md"
                    tag={directory.campaigns[stats.forgotten.campaignId]?.tag ?? ""}
                  />
                  <span className="flex-1 text-[15px] font-bold">
                    {campaignName(stats.forgotten.campaignId)}
                  </span>
                  <span className="text-[22px] font-extrabold">
                    {stats.forgotten.days}
                    <span className="text-xs font-semibold text-ink-muted">
                      {" "}
                      {t("statistics.units.dayWord", { count: stats.forgotten.days })}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 text-[13px] text-ink-muted">
                  {t("statistics.rhythm.forgottenText", {
                    date: shortDay(stats.forgotten.lastDate, locale),
                  })}
                </div>
              </StatCard>
            ) : null}

            <StatCard>
              <div className="mb-2">
                <CardLabel>{t("statistics.rhythm.leadTitle")}</CardLabel>
              </div>
              <p className="text-sm leading-[1.6]">
                <RichText
                  text={t("statistics.rhythm.lead", {
                    avg: decimal(rhythm.leadAvgDays ?? 0, locale),
                    late: rhythm.leadBuckets[0].pct,
                  })}
                />
              </p>
              <div aria-hidden="true" className="mt-[10px] flex h-2 gap-0.5 overflow-hidden rounded-full">
                {rhythm.leadBuckets.map((bucket, index) => (
                  <div
                    key={bucket.id}
                    style={{ width: `${bucket.pct}%`, background: leadColors[index] }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {rhythm.leadBuckets.map((bucket, index) => (
                  <span
                    key={bucket.id}
                    className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted"
                  >
                    <span
                      aria-hidden="true"
                      style={{ background: leadColors[index] }}
                      className="h-2 w-2 rounded-full"
                    />
                    {t(`statistics.rhythm.leadBuckets.${bucket.id}`)} · {percent(bucket.pct)}
                  </span>
                ))}
              </div>
            </StatCard>
          </div>
        </CardGrid>
      </section>
    </div>
  );
}
