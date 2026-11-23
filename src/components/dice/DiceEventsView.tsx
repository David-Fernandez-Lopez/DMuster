import Link from "next/link";

import CampaignBadge from "@/components/campaigns/CampaignBadge";
import DiceEventFilters from "@/components/dice/DiceEventFilters";
import DiceEventItemActions from "@/components/dice/DiceEventItemActions";
import DiceEventTable from "@/components/dice/DiceEventTable";
import DiceKindBadge from "@/components/dice/DiceKindBadge";
import DiceViewToggle from "@/components/dice/DiceViewToggle";
import NewDiceEventButton from "@/components/dice/NewDiceEventButton";
import { getServerTranslation } from "@/i18n/server";
import { toUtcDate } from "@/lib/date";
import { listAllDiceEvents, listDiceEventContext, listDiceEvents } from "@/lib/diceEventService";
import { todayIso } from "@/lib/today";
import { diceEventFilterSchema } from "@/lib/validation/diceEvent";

type RawSearchParams = Record<string, string | string[] | undefined>;

interface DiceEventsViewProps {
  /** Id of the signed-in user. */
  viewerId: string;
  /** The page's `searchParams`, as Next hands them over. */
  searchParams: RawSearchParams;
  /** Path of the page, to build the links that keep the filters. */
  basePath: string;
  /** When set, only this campaign's entries are shown and its select is hidden. */
  scopedCampaignId?: string;
}

/**
 * The critical/fumble log: filters, the Tabla | Lista switch, a "log one"
 * button and the entries. The table (default) lays the whole filtered log out
 * like the Excel it replaces, one card per campaign; the list is the paged,
 * newest-first alternative. Shared by the global `/rolls` page and a campaign's
 * own page (which scopes it). Reads straight through the service layer; every
 * mutation goes through the API from the client controls. Each entry names its
 * kind with an icon and text, never colour alone.
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
  const view = first(searchParams.vista) === "lista" ? "lista" : "tabla";
  const filters = diceEventFilterSchema.parse({
    campaignId: scopedCampaignId ?? first(searchParams.campaignId) ?? undefined,
    userId: first(searchParams.userId) || undefined,
    kind: first(searchParams.kind) || undefined,
    arcId: first(searchParams.arcId) || undefined,
    page: first(searchParams.page),
    pageSize: first(searchParams.pageSize),
  });

  const context = await listDiceEventContext(viewerId);
  const campaigns = scopedCampaignId ? context.filter((c) => c.id === scopedCampaignId) : context;

  if (campaigns.length === 0) {
    return <p className="mt-6 text-ink-muted">{t("diceEvents.noCampaigns")}</p>;
  }

  const today = todayIso();
  const hasFilters = Boolean(filters.userId || filters.kind || filters.arcId || (!scopedCampaignId && filters.campaignId));

  /** Builds a link to this page that keeps the active filters. */
  function href(options: { vista?: "tabla" | "lista"; page?: number }): string {
    const query = new URLSearchParams();
    for (const key of ["campaignId", "userId", "kind", "arcId"] as const) {
      const value = filters[key];
      if (value && !(key === "campaignId" && scopedCampaignId)) {
        query.set(key, value);
      }
    }
    if ((options.vista ?? view) === "lista") {
      query.set("vista", "lista");
    }
    if (options.page && options.page > 1) {
      query.set("page", String(options.page));
    }
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  // Table: everything that matches, so the totals are complete. List: one page.
  const tableRows = view === "tabla" ? await listAllDiceEvents(viewerId, filters) : [];
  const listPage = view === "lista" ? await listDiceEvents(viewerId, filters) : null;
  const total = view === "tabla" ? tableRows.length : (listPage?.total ?? 0);

  const header = (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <DiceEventFilters campaigns={context} scopedCampaignId={scopedCampaignId} />
        <div className="flex flex-wrap items-center gap-3">
          <DiceViewToggle
            current={view}
            hrefs={{ tabla: href({ vista: "tabla" }), lista: href({ vista: "lista" }) }}
            labels={{
              tabla: t("diceEvents.view.table"),
              lista: t("diceEvents.view.list"),
              group: t("diceEvents.view.label"),
            }}
          />
          <NewDiceEventButton campaigns={campaigns} viewerId={viewerId} today={today} />
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-muted">{t("diceEvents.total", { count: total })}</p>
    </>
  );

  if (total === 0) {
    return (
      <>
        {header}
        <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-border px-5 py-9 text-center">
          <h2 className="font-display text-[17px] font-semibold text-ink">
            {hasFilters ? t("diceEvents.emptyFilteredTitle") : t("diceEvents.emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-[260px] text-[13px] text-ink-muted">
            {hasFilters ? t("diceEvents.emptyFilteredText") : t("diceEvents.emptyText")}
          </p>
          <div className="mt-4 flex justify-center">
            {hasFilters ? (
              <Link
                href={scopedCampaignId ? basePath : `${basePath}${view === "lista" ? "?vista=lista" : ""}`}
                className="inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-brand px-3.5 text-[13px] font-bold text-brand hover:bg-brand-soft"
              >
                {t("diceEvents.filters.clear")}
              </Link>
            ) : (
              <NewDiceEventButton campaigns={campaigns} viewerId={viewerId} today={today} variant="outline" />
            )}
          </div>
        </div>
      </>
    );
  }

  if (view === "tabla") {
    return (
      <>
        {header}
        <div className="mt-3 flex flex-col gap-3">
          {campaigns.map((campaign) => {
            const rows = tableRows.filter((row) => row.campaignId === campaign.id);
            return rows.length > 0 ? (
              <DiceEventTable
                key={campaign.id}
                campaign={campaign}
                rows={rows}
                filters={{ userId: filters.userId, kind: filters.kind }}
                viewerId={viewerId}
                today={today}
                t={t}
                locale={locale}
              />
            ) : null;
          })}
        </div>
      </>
    );
  }

  const page = listPage!;
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const linkClass = "btn btn-secondary min-h-[44px] px-3 text-sm font-semibold";

  return (
    <>
      {header}
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {page.items.map((item) => {
          const campaign = context.find((c) => c.id === item.campaignId);
          return (
            <li key={item.id} className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <DiceKindBadge kind={item.kind} label={t(`diceEvents.kind.${item.kind}`)} />
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

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("diceEvents.title")}>
          {page.page > 1 ? (
            <Link href={href({ page: page.page - 1 })} className={linkClass}>
              ← {t("diceEvents.pagination.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">
            {t("diceEvents.pagination.page", { page: page.page, pages })}
          </span>
          {page.page < pages ? (
            <Link href={href({ page: page.page + 1 })} className={linkClass}>
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
