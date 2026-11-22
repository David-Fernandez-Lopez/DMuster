import type { TFunction } from "i18next";

import { campaignColor, campaignTint } from "@/lib/campaignColor";
import type { MeStats } from "@/lib/statistics/metrics";
import type { StatisticsDirectory } from "@/lib/statistics/statisticsService";

import EmptyState from "./EmptyState";
import { joinNames, ordinal, shortRange } from "./format";
import { Avatar, CampaignChip } from "./primitives";
import RichText from "./RichText";
import StatCard, { CardLabel } from "./StatCard";
import StatusDonut from "./StatusDonut";

/** The answer states, in legend order. */
const STATES = ["S", "O", "T", "N"] as const;

/** Stripes of the legend swatch for the DM share (neutral: the bars use each campaign's colour). */
const LEGEND_DM_STRIPES =
  "repeating-linear-gradient(135deg, var(--color-ink-muted) 0 2px, var(--color-bg-elevated) 2px 5px)";

/**
 * Stripes that mark the DM share of a campaign's bar, in that campaign's colour.
 *
 * @param {number} slot - The campaign's palette slot.
 * @returns {string} A CSS `repeating-linear-gradient(...)`.
 */
function dmStripes(slot: number): string {
  return `repeating-linear-gradient(135deg, ${campaignColor(slot)} 0 2px, ${campaignTint(slot)} 2px 5px)`;
}

interface MeViewProps {
  stats: MeStats;
  directory: StatisticsDirectory;
  name: string;
  t: TFunction;
  locale: string;
  periodLabel: string;
  showAllHref: string;
}

/**
 * The "Yo" tab body: who the user is, their attendance sentence and streak,
 * sessions by campaign (player and DM shares), who they play with most and
 * their own answering reliability. A player who runs no campaign sees none of
 * the DM-only parts.
 *
 * @param {MeViewProps} props - The view-model, its directory and i18n helpers.
 * @returns {JSX.Element}
 */
export default function MeView({
  stats,
  directory,
  name,
  t,
  locale,
  periodLabel,
  showAllHref,
}: MeViewProps) {
  const userName = (id: string) => directory.users[id] ?? id;
  const percent = (value: number) => t("statistics.percent", { value });
  const maxTotal = Math.max(1, ...stats.campaigns.map((campaign) => campaign.total));
  const reliability = stats.reliability;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center gap-3">
        <Avatar label={name[0] ?? "?"} size={44} />
        <div>
          <div className="text-base font-bold">{name}</div>
          <div className="text-xs text-ink-muted">
            {t("statistics.me.line", {
              count: stats.campaignCount,
              role: stats.isDm ? t("statistics.me.roleBoth") : t("statistics.me.rolePlayer"),
            })}
          </div>
        </div>
      </div>

      {stats.campaignCount === 0 ? (
        <p className="text-sm text-ink-muted">{t("statistics.campaign.noCampaigns")}</p>
      ) : stats.empty ? (
        <EmptyState
          title={t("statistics.me.emptyTitle", { period: periodLabel })}
          text={t("statistics.me.emptyText")}
          action={t("statistics.me.emptyAction")}
          href={showAllHref}
        />
      ) : (
        <>
          <div>
            <p className="mb-1 text-base leading-[1.7] [text-wrap:pretty]">
              <RichText
                text={
                  t("statistics.me.summary", {
                    name,
                    count: stats.played,
                    pct: stats.attendancePct,
                  }) +
                  (stats.isDm && stats.asDm > 0
                    ? t("statistics.me.dmSentence", { count: stats.asDm })
                    : "")
                }
              />
            </p>
            {stats.streak ? (
              <p className="text-sm text-ink-muted">
                <RichText
                  text={t("statistics.me.streak", {
                    weeks: t("statistics.units.week", { count: stats.streak.weeks }),
                    range: shortRange(stats.streak.from, stats.streak.to, locale),
                  })}
                />
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-[10px] [&>*]:min-w-0 [&>*]:grow [&>*]:basis-[340px]">
            <StatCard>
              <div className="mb-3 flex items-center justify-between">
                <CardLabel>{t("statistics.me.byCampaignTitle")}</CardLabel>
                {stats.isDm ? (
                  <span className="flex gap-2 text-[10px] font-bold text-ink-muted">
                    <span className="flex items-center gap-1">
                      <span aria-hidden="true" className="h-2 w-2.5 rounded-[2px] bg-ink-muted" />
                      {t("statistics.me.legendPlayer")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2.5 rounded-[2px]"
                        style={{ background: LEGEND_DM_STRIPES }}
                      />
                      {t("statistics.me.legendDm")}
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-[9px]">
                {stats.campaigns.map((campaign) => (
                  <div
                    key={campaign.campaignId}
                    className="grid grid-cols-[30px_1fr_30px_44px] items-center gap-2 text-xs"
                  >
                    <CampaignChip
                      tag={directory.campaigns[campaign.campaignId]?.tag ?? ""}
                      colorSlot={directory.campaigns[campaign.campaignId]?.colorSlot ?? 0}
                    />
                    <div
                      role="img"
                      aria-label={`${directory.campaigns[campaign.campaignId]?.name}: ${campaign.total}`}
                      className="flex h-3 gap-px"
                    >
                      <div
                        style={{
                          width: `${(campaign.asPlayer / maxTotal) * 100}%`,
                          background: campaignColor(directory.campaigns[campaign.campaignId]?.colorSlot ?? 0),
                        }}
                        className="rounded-[2px]"
                      />
                      {stats.isDm ? (
                        <div
                          style={{
                            width: `${(campaign.asDm / maxTotal) * 100}%`,
                            background: dmStripes(directory.campaigns[campaign.campaignId]?.colorSlot ?? 0),
                          }}
                          className="rounded-[2px]"
                        />
                      ) : null}
                    </div>
                    <span className="text-right font-extrabold">{campaign.total}</span>
                    <span className="text-right font-semibold text-ink-muted">
                      {percent(campaign.attendancePct)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-[10px] text-[11px] text-ink-muted">
                {t("statistics.me.byCampaignNote")}
              </div>
            </StatCard>

            <div className="flex flex-col gap-[10px]">
              <StatCard>
                <div className="mb-[10px]">
                  <CardLabel>{t("statistics.me.companionsTitle")}</CardLabel>
                </div>
                <div className="flex flex-col gap-2">
                  {stats.companions.map((row) => (
                    <div key={row.position} className="flex items-center gap-[10px] text-[13px]">
                      <span className="w-[22px] font-bold text-ink-muted">
                        {ordinal(row.position, locale)}
                      </span>
                      <Avatar label={userName(row.items[0].key)[0] ?? "?"} size={26} />
                      <span className="flex-1 font-semibold">
                        {joinNames(row.items.map((item) => userName(item.key)), t, locale)}
                      </span>
                      <span className="font-bold">
                        {t("statistics.units.session", { count: row.value })}
                      </span>
                    </div>
                  ))}
                </div>
              </StatCard>

              <StatCard>
                <div className="mb-[10px]">
                  <CardLabel>{t("statistics.me.reliabilityTitle")}</CardLabel>
                </div>
                <div className="flex items-center gap-[14px]">
                  <StatusDonut
                    counts={reliability.counts}
                    eligible={reliability.eligible}
                    rate={reliability.responseRate}
                    caption={t("statistics.campaign.responds")}
                    size={84}
                  />
                  <p className="text-[13px] leading-[1.6]">
                    <RichText
                      text={
                        reliability.leadDays !== null
                          ? t("statistics.me.reliabilityText", {
                              rate: reliability.responseRate,
                              lead: reliability.leadDays,
                              no: reliability.noDays,
                            })
                          : t("statistics.me.reliabilityNoLead", {
                              rate: reliability.responseRate,
                              no: reliability.noDays,
                            })
                      }
                    />
                  </p>
                </div>
                <div className="mt-[10px] flex flex-wrap gap-[10px]">
                  {STATES.map((state) => (
                    <span
                      key={state}
                      className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted"
                    >
                      <span
                        aria-hidden="true"
                        style={{ background: `var(--color-${state.toLowerCase()})` }}
                        className="h-2 w-2 rounded-full"
                      />
                      {t(`statistics.status.${state}`)} {percent(reliability.pct[state])}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-ink-muted">
                  {t("statistics.me.approxShort")}
                </div>
              </StatCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
