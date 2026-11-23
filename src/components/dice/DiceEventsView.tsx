import Link from "next/link";

import CampaignBadge from "@/components/campaigns/CampaignBadge";
import DiceEventFilters from "@/components/dice/DiceEventFilters";
import DiceEventItemActions from "@/components/dice/DiceEventItemActions";
import DiceKindIcon, { DICE_KIND_TEXT_CLASS } from "@/components/dice/DiceKindIcon";
import NewDiceEventButton from "@/components/dice/NewDiceEventButton";
import { getServerTranslation } from "@/i18n/server";
import { toUtcDate } from "@/lib/date";
import { listDiceEventContext, listDiceEvents } from "@/lib/diceEventService";
import { todayIso } from "@/lib/today";
import { diceEventFilterSchema } from "@/lib/validation/diceEvent";

type RawSearchParams = Record<string, string | string[] | undefined>;

interface DiceEventsViewProps {
  /** Id of the signed-in user. */
  viewerId: string;
  /** The page's `searchParams`, as Next hands them over. */
  searchParams: RawSearchParams;
  /** Path of the page, to build the pagination links. */
  basePath: string;
  /** When set, only this campaign's entries are shown and its select is hidden. */
  scopedCampaignId?: string;
}

/**
 * The critical/fumble log: filters, a "log one" button, the page of entries and
 * the pagination. Shared by the global `/rolls` page and a campaign's own page
 * (which scopes it). Reads straight through the service layer; every mutation
 * goes through the API from the client controls. Each entry names its kind with
 * an icon and text, never colour alone.
 *
 * @param {DiceEventsViewProps} props
 * @returns {Promise<JSX.Element>}
 */
export default async function DiceEventsView({
  viewerId,
  searchParams,
  basePath,
  scopedCampaignId,
}: DiceEventsViewProps) {
  const { t, locale } = await getServerTranslation();

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = diceEventFilterSchema.parse({
    campaignId: scopedCampaignId ?? first(searchParams.campaignId) ?? undefined,
    userId: first(searchParams.userId) || undefined,
    kind: first(searchParams.kind) || undefined,
    arcId: first(searchParams.arcId) || undefined,
    page: first(searchParams.page),
    pageSize: first(searchParams.pageSize),
  });

  const [context, page] = await Promise.all([
    listDiceEventContext(viewerId),
    listDiceEvents(viewerId, filters),
  ]);
  const campaigns = scopedCampaignId ? context.filter((c) => c.id === scopedCampaignId) : context;

  if (campaigns.length === 0) {
    return <p className="mt-6 text-ink-muted">{t("diceEvents.noCampaigns")}</p>;
  }

  const today = todayIso();
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const hasFilters = Boolean(filters.userId || filters.kind || filters.arcId || (!scopedCampaignId && filters.campaignId));

  /** Builds a pagination link that keeps the active filters. */
  function pageHref(target: number): string {
    const query = new URLSearchParams();
    for (const key of ["campaignId", "userId", "kind", "arcId"] as const) {
      const value = filters[key];
      if (value && !(key === "campaignId" && scopedCampaignId)) {
        query.set(key, value);
      }
    }
    if (target > 1) {
      query.set("page", String(target));
    }
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const linkClass = "btn btn-secondary min-h-[44px] px-3 text-sm font-semibold";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <DiceEventFilters campaigns={context} scopedCampaignId={scopedCampaignId} />
        <NewDiceEventButton campaigns={campaigns} viewerId={viewerId} today={today} />
      </div>

      <p className="mt-4 text-sm text-ink-muted">{t("diceEvents.total", { count: page.total })}</p>

      {page.items.length === 0 ? (
        <p className="mt-6 text-ink-muted">
          {hasFilters ? t("diceEvents.emptyFiltered") : t("diceEvents.empty")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {page.items.map((item) => {
            const campaign = context.find((c) => c.id === item.campaignId);
            return (
              <li
                key={item.id}
                className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-bold ${DICE_KIND_TEXT_CLASS[item.kind]}`}
                  >
                    <DiceKindIcon kind={item.kind} />
                    {t(`diceEvents.kind.${item.kind}`)}
                  </span>
                  <time dateTime={item.date} className="text-sm text-ink-muted">
                    {dateFormatter.format(toUtcDate(item.date))}
                    {item.time ? ` · ${item.time}` : ""}
                  </time>
                </div>

                <p className="mt-2 font-bold text-ink">{item.skill}</p>
                <p className="text-sm text-ink">{item.userName}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {scopedCampaignId ? null : (
                    <span className="inline-flex items-center gap-1.5">
                      <CampaignBadge tag={item.campaignTag} colorSlot={item.campaignColorSlot} />
                      {item.campaignName}
                    </span>
                  )}
                  {item.arc ? (
                    <span>
                      {item.arc.name
                        ? t("diceEvents.arcLabelNamed", { number: item.arc.number, name: item.arc.name })
                        : t("diceEvents.arcLabel", { number: item.arc.number })}
                    </span>
                  ) : null}
                  <span>{t("diceEvents.createdBy", { name: item.createdByName })}</span>
                </div>

                {campaign ? (
                  <DiceEventItemActions
                    campaign={campaign}
                    viewerId={viewerId}
                    today={today}
                    event={{
                      id: item.id,
                      campaignId: item.campaignId,
                      userId: item.userId,
                      kind: item.kind,
                      skill: item.skill,
                      date: item.date,
                      time: item.time,
                      arcId: item.arc?.id ?? null,
                      sessionId: item.sessionId,
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("diceEvents.title")}>
          {page.page > 1 ? (
            <Link href={pageHref(page.page - 1)} className={linkClass}>
              ← {t("diceEvents.pagination.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">
            {t("diceEvents.pagination.page", { page: page.page, pages })}
          </span>
          {page.page < pages ? (
            <Link href={pageHref(page.page + 1)} className={linkClass}>
              {t("diceEvents.pagination.next")} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
