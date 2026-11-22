import type { TFunction } from "i18next";

import type { CampaignStats } from "@/lib/statistics/metrics";
import { pct } from "@/lib/statistics/metrics";
import type { StatisticsDirectory } from "@/lib/statistics/statisticsService";

import EmptyState from "./EmptyState";
import { decimal, durationLabel, joinNames, shortDay } from "./format";
import {
  CampaignChip,
  FewDataNote,
  HBar,
  PersonChip,
  SectionTitle,
} from "./primitives";
import RichText from "./RichText";
import SimpleMonthlyBars from "./SimpleMonthlyBars";
import StatCard, { CardGrid, CardLabel } from "./StatCard";
import StatusDonut from "./StatusDonut";

/** The four answer states, in donut and legend order. */
const STATES = ["S", "O", "T", "N"] as const;

interface CampaignViewProps {
  stats: CampaignStats;
  directory: StatisticsDirectory;
  t: TFunction;
  locale: string;
  periodLabel: string;
  showAllHref: string;
}

/**
 * A KPI tile: a big figure (or a short name) over a muted caption.
 *
 * @param {{ figure: string; caption: string; small?: boolean }} props - The tile content.
 * @returns {JSX.Element}
 */
function Kpi({
  figure,
  caption,
  small = false,
}: {
  figure: string;
  caption: string;
  small?: boolean;
}) {
  return (
    <StatCard>
      <div
        className={
          small
            ? "text-[15px] font-extrabold leading-tight"
            : "text-[26px] font-extrabold leading-none"
        }
      >
        {figure}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-ink-muted">{caption}</div>
    </StatCard>
  );
}

/**
 * The "Mis campañas" tab body for one campaign: header (with the archived
 * stamp), KPIs, rhythm, cancellations and extras, and the reliability grid.
 *
 * @param {CampaignViewProps} props - The view-model, its directory and i18n helpers.
 * @returns {JSX.Element}
 */
export default function CampaignView({
  stats,
  directory,
  t,
  locale,
  periodLabel,
  showAllHref,
}: CampaignViewProps) {
  const campaign = directory.campaigns[stats.campaignId];
  const userName = (id: string) => directory.users[id] ?? id;
  const percent = (value: number) => t("statistics.percent", { value });
  const dmNames = joinNames(
    stats.members.filter((member) => member.isDm).map((member) => member.name),
    t,
    locale,
  );
  const { rhythm } = stats;
  const favourite = rhythm.dayTypes.find((day) => day.type === rhythm.favouriteDay);
  const every =
    rhythm.gapAvgDays !== null
      ? t("statistics.campaign.every", { count: rhythm.gapAvgDays })
      : null;
  const leadText = decimal(rhythm.leadAvgDays ?? 0, locale);
  const schedule = rhythm.schedule;
  const dayMax = Math.max(1, ...rhythm.dayTypes.map((day) => day.n));

  const nextLabel = stats.archived
    ? t("statistics.campaign.kpi.archived")
    : stats.next
      ? `${shortDay(stats.next.date, locale)}${stats.next.startTime ? ` · ${stats.next.startTime}` : ""}`
      : t("statistics.campaign.kpi.noNext");

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-[10px]">
        <div className="relative flex min-h-12 flex-wrap items-center gap-[10px] pr-[90px]">
          {stats.archived ? (
            <div
              aria-hidden="true"
              className="absolute right-1 top-[-4px] flex h-20 w-20 -rotate-[14deg] flex-col items-center justify-center rounded-full border-[1.5px] border-brand text-brand outline outline-1 -outline-offset-6 outline-brand"
            >
              <span className="font-display text-[9px] font-bold uppercase tracking-[0.03em]">
                {t("statistics.campaign.stamp")}
              </span>
              {stats.lastPlayedYear ? (
                <span className="text-[9px] font-bold">{stats.lastPlayedYear}</span>
              ) : null}
            </div>
          ) : null}
          <CampaignChip tag={campaign?.tag ?? ""} colorSlot={campaign?.colorSlot ?? 0} size="md" />
          <h2 className="font-display text-xl font-semibold">{campaign?.name}</h2>
        </div>
        <div className="text-xs text-ink-muted">
          {t("statistics.campaign.meta", { dms: dmNames, count: stats.members.length })}
        </div>
        {stats.archived ? (
          <p className="text-sm italic leading-[1.6] text-ink-muted">
            {t("statistics.campaign.archivedNote")}
          </p>
        ) : null}
      </header>

      {stats.empty ? (
        <EmptyState
          title={t("statistics.empty.title", { period: periodLabel })}
          text={t("statistics.empty.text")}
          action={t("statistics.empty.showAll")}
          href={showAllHref}
        />
      ) : (
        <>
          {stats.few ? (
            <FewDataNote>{t("statistics.campaign.few", { count: stats.played })}</FewDataNote>
          ) : null}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
            <Kpi
              figure={String(stats.played)}
              caption={t("statistics.campaign.kpi.played", { count: stats.played })}
            />
            <Kpi
              figure={`${stats.hours} h`}
              caption={t("statistics.campaign.kpi.hours", {
                timed: stats.timedCount,
                played: stats.played,
              })}
            />
            <Kpi
              figure={percent(stats.attendancePct)}
              caption={t("statistics.campaign.kpi.attendance")}
            />
            <Kpi
              small
              figure={
                stats.faithful
                  ? joinNames(
                      stats.faithful.items.map((item) => userName(item.key)),
                      t,
                      locale,
                    )
                  : "—"
              }
              caption={t("statistics.campaign.kpi.faithful", {
                value: stats.faithful ? percent(stats.faithful.value) : "—",
              })}
            />
            <Kpi
              small
              figure={stats.lastDate ? shortDay(stats.lastDate, locale) : "—"}
              caption={t("statistics.campaign.kpi.last")}
            />
            <Kpi small figure={nextLabel} caption={t("statistics.campaign.kpi.next")} />
          </div>

          <section>
            <SectionTitle>{t("statistics.group.rhythmTitle")}</SectionTitle>
            <CardGrid>
              <SimpleMonthlyBars
                months={rhythm.months}
                monthMax={rhythm.monthMax}
                title={t("statistics.rhythm.perMonth")}
                aside={every ?? undefined}
                colorSlot={campaign?.colorSlot ?? 0}
                t={t}
                locale={locale}
              />
              <StatCard>
                <div className="mb-3">
                  <CardLabel>{t("statistics.rhythm.dayTitle")}</CardLabel>
                </div>
                <div className="flex flex-col gap-2">
                  {rhythm.dayTypes.map((day) => (
                    <div
                      key={day.type}
                      className="grid grid-cols-[64px_1fr_40px] items-center gap-2 text-[13px]"
                    >
                      <span className="font-semibold">
                        {t(`statistics.rhythm.dayTypes.${day.type}`)}
                      </span>
                      <HBar percent={Math.max(2, pct(day.n, dayMax))} />
                      <span className="text-right font-bold">{percent(day.pct)}</span>
                    </div>
                  ))}
                </div>
              </StatCard>
              <StatCard>
                <div className="mb-1.5">
                  <CardLabel>{t("statistics.campaign.scheduleTitle")}</CardLabel>
                </div>
                <p className="text-sm leading-[1.6]">
                  {favourite && every ? (
                    <RichText
                      text={t("statistics.campaign.cadenceDay", {
                        every,
                        day: t(`statistics.rhythm.dayTypesInline.${favourite.type}`),
                        pct: favourite.pct,
                      })}
                    />
                  ) : favourite ? (
                    <RichText
                      text={t("statistics.campaign.onlyDay", {
                        day: t(`statistics.rhythm.dayTypesInline.${favourite.type}`),
                        pct: favourite.pct,
                      })}
                    />
                  ) : null}{" "}
                  {schedule.modeStart && schedule.avgDurationMinutes !== null ? (
                    <RichText
                      text={t("statistics.campaign.startsAt", {
                        start: schedule.modeStart,
                        duration: durationLabel(schedule.avgDurationMinutes),
                        lead: leadText,
                      })}
                    />
                  ) : (
                    t("statistics.campaign.leadOnly", { lead: leadText })
                  )}
                </p>
              </StatCard>
            </CardGrid>
          </section>

          <section>
            <SectionTitle>{t("statistics.campaign.extrasTitle")}</SectionTitle>
            <CardGrid>
              <StatCard>
                <div className="mb-[10px]">
                  <CardLabel>{t("statistics.campaign.playedCanceled")}</CardLabel>
                </div>
                <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                  <div style={{ width: `${stats.playedPct}%` }} className="bg-brand" />
                  <div
                    className="flex-1"
                    style={{
                      background:
                        "repeating-linear-gradient(135deg, var(--color-ink-muted) 0 1px, var(--color-brand-soft) 1px 5px)",
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between gap-2 text-xs font-semibold">
                  <span>{t("statistics.campaign.playedCount", { count: stats.played })}</span>
                  <span className="text-ink-muted">
                    {t("statistics.campaign.canceledLine", {
                      count: stats.canceled,
                      late: stats.lateCancel,
                    })}
                  </span>
                </div>
                {stats.causes.length > 0 ? (
                  <>
                    <div className="mb-1.5 mt-3 text-xs text-ink-muted">
                      {t("statistics.campaign.causesTitle")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.causes.map((cause) => (
                        <PersonChip key={cause.userId} name={userName(cause.userId)} count={cause.n} />
                      ))}
                    </div>
                  </>
                ) : null}
              </StatCard>

              <StatCard>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="mb-1.5">
                      <CardLabel>{t("statistics.campaign.forcedTitle")}</CardLabel>
                    </div>
                    <p className="text-sm leading-[1.6]">
                      {stats.forced > 0
                        ? t("statistics.campaign.forcedSome", {
                            forced: stats.forced,
                            played: stats.played,
                            pct: stats.forcedPct,
                          })
                        : t("statistics.campaign.forcedNone")}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1.5">
                      <CardLabel>{t("statistics.campaign.lateJoinTitle")}</CardLabel>
                    </div>
                    {stats.lateJoiners.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {stats.lateJoiners.map((joiner) => (
                          <PersonChip
                            key={joiner.userId}
                            name={userName(joiner.userId)}
                            count={joiner.n}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-ink-muted">{t("statistics.campaign.nobody")}</div>
                    )}
                  </div>
                </div>
              </StatCard>
            </CardGrid>
          </section>

          <section>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-[10px]">
              <h2 className="font-display text-[17px] font-semibold">
                {t("statistics.campaign.reliabilityTitle")}
              </h2>
              <div className="flex flex-wrap justify-end gap-2">
                {STATES.map((state) => (
                  <span
                    key={state}
                    className="flex items-center gap-1 text-[10px] font-bold text-ink-muted"
                  >
                    <span
                      aria-hidden="true"
                      style={{ background: `var(--color-${state.toLowerCase()})` }}
                      className="h-2 w-2 rounded-full"
                    />
                    {t(`statistics.status.${state}`)}
                  </span>
                ))}
              </div>
            </div>
            <p className="mb-[10px] text-xs leading-normal text-ink-muted">
              {t("statistics.campaign.reliabilityBlurb")}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] gap-2">
              {stats.members.map((member) => {
                const reliability = member.reliability;
                return (
                  <div
                    key={member.userId}
                    className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3 text-center"
                  >
                    <StatusDonut
                      counts={reliability.counts}
                      eligible={reliability.eligible}
                      rate={reliability.responseRate}
                      caption={t("statistics.campaign.responds")}
                    />
                    <div className="text-sm font-extrabold">
                      {member.name}
                      {member.isDm ? (
                        <span className="text-[10px] font-extrabold text-brand">
                          {" "}
                          · {t("statistics.campaign.dm")}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] leading-[1.45] text-ink-muted">
                      {reliability.leadDays !== null ? (
                        <span className="border-b border-dotted border-ink-muted">
                          {t("statistics.campaign.leadDays", { count: reliability.leadDays })}
                        </span>
                      ) : (
                        t("statistics.campaign.noLead")
                      )}
                      <br />
                      {t("statistics.campaign.noDays", { count: reliability.noDays })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] text-ink-muted">{t("statistics.campaign.approx")}</div>
          </section>
        </>
      )}
    </div>
  );
}
