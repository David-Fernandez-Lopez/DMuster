import { addDays, isEligible, toUtcDate } from "@/lib/date";

import {
  inPeriod,
  monthKeys,
  type PeriodBounds,
} from "./period";

/*
 * Pure statistics domain. Everything here works on plain data (ISO days as
 * "YYYY-MM-DD", ids as strings) so it can be tested without a database and
 * rendered by any UI. View-models carry numbers and keys only — wording,
 * plurals and month names are the UI's job (i18n).
 */

// ---------- input types ----------

/** The kind of day a session was played on. A holiday wins over the weekday. */
export type DayType = "FRI" | "SAT" | "SUN" | "HOLIDAY";

/** One confirmed session, active or cancelled. */
export type StatSession = {
  id: string;
  campaignId: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM", or null for an all-day session. */
  startTime: string | null;
  durationMinutes: number | null;
  status: "PLAYED" | "CANCELED";
  /** The DM who confirmed it. */
  dmId: string;
  attendeeIds: string[];
  forced: boolean;
  /** Day the DM confirmed it. */
  confirmedDay: string;
  /** Day it was cancelled (cancelled sessions only). */
  cancelledDay: string | null;
  cancelCauseUserId: string | null;
  /** Attendees who joined two days or less before the session. */
  lateJoinerIds: string[];
};

/** One member of a campaign. */
export type StatMember = {
  userId: string;
  name: string;
  isDm: boolean;
  /** Day they joined the campaign. */
  joinedDay: string;
};

/** A campaign with its roster. */
export type StatCampaign = {
  id: string;
  tag: string;
  name: string;
  /** Stable 0..8 index of the campaign's tone in the colour ramp. */
  colorIndex: number;
  /** Day the campaign was archived, or null while active. */
  archivedDay: string | null;
  members: StatMember[];
  /** The campaign's next active session, if any. */
  next: { date: string; startTime: string | null } | null;
};

/** A stored availability answer. Days without an entry count as pending. */
export type StatAnswer = {
  status: "YES" | "ONLINE" | "MAYBE" | "NO";
  /** Day of the last save of this answer. */
  answeredDay: string;
};

/** Everything the metrics need besides the period. */
export type StatContext = {
  today: string;
  holidays: Set<string>;
  campaigns: StatCampaign[];
  /** Answers keyed by `answerKey(userId, date)`. */
  answers: Map<string, StatAnswer>;
  /** Display names by user id. */
  names: Map<string, string>;
};

// ---------- output types ----------

/** One position of a ranking; tied entries share it. */
export type RankRow = {
  /** 1-based position (ties share it, the next one skips: 1, 1, 3). */
  position: number;
  value: number;
  items: { key: string; meta?: Record<string, string | number> }[];
};

/** Counts of the four answer states, pending counted as `T`. */
export type AnswerSplit = { S: number; O: number; T: number; N: number };

/** Reliability of one person over a span of eligible days. */
export type Reliability = {
  eligible: number;
  /** Answered / eligible, 0..100. */
  responseRate: number;
  counts: AnswerSplit;
  /** Share of each state over the eligible days, 0..100 (may not sum to 100). */
  pct: AnswerSplit;
  /** Average days between answering and the day, null when nothing was answered. */
  leadDays: number | null;
  /** Eligible days answered with No. */
  noDays: number;
};

/** The rhythm block shared by the group and a campaign. */
export type Rhythm = {
  months: {
    key: string;
    total: number;
    segments: { campaignId: string; n: number }[];
  }[];
  monthMax: number;
  dayTypes: { type: DayType; n: number; pct: number }[];
  favouriteDay: DayType | null;
  schedule: {
    timedCount: number;
    modeStart: string | null;
    modeShare: number;
    avgDurationMinutes: number | null;
    /** Share of timed sessions starting before 20:00. */
    afternoonPct: number;
    eveningPct: number;
  };
  heat: {
    month: string;
    total: number;
    days: { date: string; count: number; eligible: boolean; future: boolean }[];
  }[];
  leadAvgDays: number | null;
  leadBuckets: { id: "LE2" | "D3_7" | "GT7"; n: number; pct: number }[];
  /** Average days between sessions, null with fewer than two. */
  gapAvgDays: number | null;
};

/** The group tab. */
export type GroupStats = {
  empty: boolean;
  few: boolean;
  played: number;
  hours: number;
  timedCount: number;
  campaigns: number;
  players: number;
  fame: {
    campaign: RankRow[];
    month: RankRow[];
    dm: RankRow[];
    attendanceTotal: RankRow[];
    attendancePct: RankRow[];
    pair: RankRow[];
    recordMonth: RankRow[];
    streak: RankRow[];
  };
  rhythm: Rhythm;
  gaps: { campaignId: string; days: number }[];
  forgotten: { campaignId: string; days: number; lastDate: string } | null;
  legend: { campaignId: string; n: number }[];
};

/** One member row of a campaign's reliability grid. */
export type MemberReliability = {
  userId: string;
  name: string;
  isDm: boolean;
  reliability: Reliability;
};

/** The campaign tab. */
export type CampaignStats = {
  campaignId: string;
  archived: boolean;
  empty: boolean;
  few: boolean;
  played: number;
  hours: number;
  timedCount: number;
  /** Σ attendees / (played × members), 0..100. */
  attendancePct: number;
  faithful: RankRow | null;
  lastDate: string | null;
  /** Year of the campaign's last played session, whatever the period (the stamp). */
  lastPlayedYear: number | null;
  next: { date: string; startTime: string | null } | null;
  canceled: number;
  playedPct: number;
  canceledPct: number;
  lateCancel: number;
  causes: { userId: string; n: number }[];
  forced: number;
  forcedPct: number;
  lateJoiners: { userId: string; n: number }[];
  rhythm: Rhythm;
  members: MemberReliability[];
};

/** The "Yo" tab. */
export type MeStats = {
  empty: boolean;
  isDm: boolean;
  campaignCount: number;
  played: number;
  asPlayer: number;
  asDm: number;
  /** Share of the sessions of the user's campaigns they attended, 0..100. */
  attendancePct: number;
  hours: number;
  streak: { weeks: number; from: string; to: string } | null;
  campaigns: {
    campaignId: string;
    asPlayer: number;
    asDm: number;
    total: number;
    of: number;
    attendancePct: number;
  }[];
  companions: RankRow[];
  reliability: Reliability;
};

// ---------- small helpers ----------

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/** Sessions that start at or after this hour count as evening ones. */
const EVENING_START = "20:00";

/**
 * Key of an availability answer in `StatContext.answers`.
 *
 * @param {string} userId - The respondent.
 * @param {string} date - "YYYY-MM-DD".
 * @returns {string} The map key.
 */
export function answerKey(userId: string, date: string): string {
  return `${userId}|${date}`;
}

/**
 * Whole days from `a` to `b` (negative when `b` is earlier).
 *
 * @param {string} a - "YYYY-MM-DD".
 * @param {string} b - "YYYY-MM-DD".
 * @returns {number} The difference in days.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / DAY_MS);
}

/**
 * Percentage of `part` in `whole`, rounded; 0 when `whole` is 0.
 *
 * @param {number} part - Numerator.
 * @param {number} whole - Denominator.
 * @returns {number} 0..100.
 */
export function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/**
 * Classifies a played day. A listed holiday wins over the weekday, as in the
 * design (a Friday holiday counts as "festivo").
 *
 * @param {string} date - "YYYY-MM-DD".
 * @param {Set<string>} holidays - Holiday dates.
 * @returns {DayType} The day type.
 */
export function dayTypeOf(date: string, holidays: Set<string>): DayType {
  if (holidays.has(date)) {
    return "HOLIDAY";
  }
  const weekday = toUtcDate(date).getUTCDay();
  return weekday === 5 ? "FRI" : weekday === 6 ? "SAT" : "SUN";
}

/**
 * Eligible days within an inclusive range.
 *
 * @param {string} from - First day, "YYYY-MM-DD".
 * @param {string} to - Last day, "YYYY-MM-DD".
 * @param {Set<string>} holidays - Holiday dates.
 * @returns {string[]} Eligible days, oldest first.
 */
export function eligibleDaysBetween(
  from: string,
  to: string,
  holidays: Set<string>,
): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (isEligible(day, holidays)) {
      days.push(day);
    }
  }
  return days;
}

/**
 * Index of the ISO week (Monday to Sunday) a day belongs to, counted from the
 * epoch, so consecutive weeks differ by one.
 *
 * @param {string} date - "YYYY-MM-DD".
 * @returns {number} The week index.
 */
function weekIndex(date: string): number {
  return Math.floor(toUtcDate(date).getTime() / DAY_MS / 7 + 3 / 7);
}

/**
 * First day (Monday) of a week index.
 *
 * @param {number} week - A week index from `weekIndex`.
 * @returns {string} "YYYY-MM-DD".
 */
function weekStart(week: number): string {
  return addDays("1970-01-01", week * 7 - 3);
}

/**
 * Longest-first list of runs of consecutive ISO weeks with at least one date.
 *
 * @param {string[]} dates - Dates in any order, repeats allowed.
 * @returns {{ weeks: number; from: string; to: string }[]} Runs, longest
 *   first; `from` is the Monday of the first week and `to` the Sunday of the last.
 */
export function weekRuns(
  dates: string[],
): { weeks: number; from: string; to: string }[] {
  const weeks = [...new Set(dates.map(weekIndex))].sort((a, b) => a - b);
  const runs: { weeks: number; from: string; to: string }[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  const close = () => {
    if (start !== null && previous !== null) {
      runs.push({
        weeks: previous - start + 1,
        from: weekStart(start),
        to: addDays(weekStart(previous), 6),
      });
    }
  };

  for (const week of weeks) {
    if (previous !== null && week === previous + 1) {
      previous = week;
      continue;
    }
    close();
    start = week;
    previous = week;
  }
  close();

  return runs.sort((a, b) => b.weeks - a.weeks || (a.from < b.from ? -1 : 1));
}

/**
 * Ranks entries by value, highest first, keeping the top positions. Entries
 * with the same value share a position and the next one skips (1, 1, 3);
 * zero values and ties broken by key keep the output deterministic.
 *
 * @param {{ key: string; value: number; meta?: Record<string, string | number> }[]} entries - Candidates.
 * @param {number} [top] - Last position kept (default 3).
 * @returns {RankRow[]} One row per kept position.
 */
export function rank(
  entries: { key: string; value: number; meta?: Record<string, string | number> }[],
  top = 3,
): RankRow[] {
  const sorted = entries
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : 1));
  const rows: RankRow[] = [];

  for (const entry of sorted) {
    const position = 1 + sorted.filter((other) => other.value > entry.value).length;
    if (position > top) {
      continue;
    }
    let row = rows.find((candidate) => candidate.position === position);
    if (!row) {
      row = { position, value: entry.value, items: [] };
      rows.push(row);
    }
    row.items.push({ key: entry.key, meta: entry.meta });
  }

  return rows;
}

/**
 * Counts occurrences of the keys produced for each element.
 *
 * @param {T[]} items - Elements to count over.
 * @param {(item: T) => string | string[] | null} keyOf - Key(s) per element.
 * @returns {Map<string, number>} Count per key.
 */
function countBy<T>(
  items: T[],
  keyOf: (item: T) => string | string[] | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const keys = keyOf(item);
    if (keys === null) {
      continue;
    }
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Hours and the number of sessions that carry them. Only sessions with both a
 * start time and a duration count.
 *
 * @param {StatSession[]} sessions - Played sessions.
 * @returns {{ hours: number; timedCount: number }} Rounded total hours and timed sessions.
 */
function hoursOf(sessions: StatSession[]): { hours: number; timedCount: number } {
  const timed = sessions.filter(isTimed);
  const minutes = timed.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
  return { hours: Math.round(minutes / 60), timedCount: timed.length };
}

/**
 * Whether a session has both a start time and a duration.
 *
 * @param {StatSession} session - The session.
 * @returns {boolean} True when it is timed.
 */
function isTimed(session: StatSession): boolean {
  return session.startTime !== null && session.durationMinutes !== null;
}

/**
 * Sessions of the period split into played and cancelled. Only sessions dated
 * up to today count, matching the design.
 *
 * @param {StatSession[]} sessions - All sessions.
 * @param {PeriodBounds} bounds - The period.
 * @returns {{ played: StatSession[]; canceled: StatSession[] }} The split.
 */
export function sessionsInPeriod(
  sessions: StatSession[],
  bounds: PeriodBounds,
): { played: StatSession[]; canceled: StatSession[] } {
  const inRange = sessions.filter((session) => inPeriod(session.date, bounds));
  return {
    played: inRange
      .filter((session) => session.status === "PLAYED")
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    canceled: inRange.filter((session) => session.status === "CANCELED"),
  };
}

// ---------- reliability ----------

/**
 * Reliability of one person over the eligible days of a span. A day without a
 * stored answer is pending and counts as `T`, like in the viability rules.
 *
 * @param {string} userId - The person.
 * @param {string} from - First day of the span, "YYYY-MM-DD".
 * @param {string} to - Last day of the span, "YYYY-MM-DD".
 * @param {StatContext} context - Holidays and stored answers.
 * @returns {Reliability} The measures; all zeros when the span has no eligible day.
 */
export function reliability(
  userId: string,
  from: string,
  to: string,
  context: StatContext,
): Reliability {
  const days = from > to ? [] : eligibleDaysBetween(from, to, context.holidays);
  const counts: AnswerSplit = { S: 0, O: 0, T: 0, N: 0 };
  let answered = 0;
  let leadSum = 0;

  for (const day of days) {
    const answer = context.answers.get(answerKey(userId, day));
    if (!answer) {
      counts.T += 1;
      continue;
    }
    answered += 1;
    leadSum += Math.max(0, daysBetween(answer.answeredDay, day));
    if (answer.status === "YES") counts.S += 1;
    else if (answer.status === "ONLINE") counts.O += 1;
    else if (answer.status === "MAYBE") counts.T += 1;
    else counts.N += 1;
  }

  return {
    eligible: days.length,
    responseRate: pct(answered, days.length),
    counts,
    pct: {
      S: pct(counts.S, days.length),
      O: pct(counts.O, days.length),
      T: pct(counts.T, days.length),
      N: pct(counts.N, days.length),
    },
    leadDays: answered ? Math.round(leadSum / answered) : null,
    noDays: counts.N,
  };
}

// ---------- rhythm ----------

/**
 * The rhythm block (monthly bars, day of the week, schedule, heat map,
 * confirmation lead time and gap between sessions) for a set of played sessions.
 *
 * @param {StatSession[]} played - Played sessions of the period, oldest first.
 * @param {PeriodBounds} bounds - The period (drives the monthly axis).
 * @param {StatContext} context - Today and holidays.
 * @returns {Rhythm} The block.
 */
export function rhythm(
  played: StatSession[],
  bounds: PeriodBounds,
  context: StatContext,
): Rhythm {
  const keys = monthKeys(bounds);
  const monthCounts = keys.map((key) => {
    const list = played.filter((session) => session.date.startsWith(key));
    const byCampaign = countBy(list, (session) => session.campaignId);
    return {
      key,
      total: list.length,
      segments: context.campaigns
        .map((campaign) => ({ campaignId: campaign.id, n: byCampaign.get(campaign.id) ?? 0 }))
        .filter((segment) => segment.n > 0),
    };
  });

  const dayCounts = countBy(played, (session) => dayTypeOf(session.date, context.holidays));
  const dayTypes = (["FRI", "SAT", "SUN", "HOLIDAY"] as const).map((type) => ({
    type,
    n: dayCounts.get(type) ?? 0,
    pct: pct(dayCounts.get(type) ?? 0, played.length),
  }));
  const favourite = [...dayTypes].sort((a, b) => b.n - a.n)[0];

  const timed = played.filter(isTimed);
  const starts = countBy(timed, (session) => session.startTime);
  const modeStart =
    [...starts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ??
    null;
  const evening = timed.filter((session) => (session.startTime as string) >= EVENING_START).length;
  const durationSum = timed.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);

  const perDate = countBy(played, (session) => session.date);
  const heat = keys.map((month) => {
    const days: Rhythm["heat"][number]["days"] = [];
    let total = 0;
    for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) {
      const count = perDate.get(day) ?? 0;
      total += count;
      days.push({
        date: day,
        count,
        eligible: isEligible(day, context.holidays),
        future: day > context.today,
      });
    }
    return { month, total, days };
  });

  const leads = played.map((session) => Math.max(0, daysBetween(session.confirmedDay, session.date)));
  const bucketOf = (lead: number) => (lead <= 2 ? "LE2" : lead <= 7 ? "D3_7" : "GT7");
  const leadBuckets = (["LE2", "D3_7", "GT7"] as const).map((id) => {
    const n = leads.filter((lead) => bucketOf(lead) === id).length;
    return { id, n, pct: pct(n, leads.length) };
  });

  const dates = played.map((session) => session.date).sort();
  const gapAvgDays =
    dates.length > 1
      ? Math.round(daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1))
      : null;

  return {
    months: monthCounts,
    monthMax: Math.max(1, ...monthCounts.map((month) => month.total)),
    dayTypes,
    favouriteDay: favourite && favourite.n > 0 ? favourite.type : null,
    schedule: {
      timedCount: timed.length,
      modeStart,
      modeShare: pct(modeStart ? (starts.get(modeStart) ?? 0) : 0, timed.length),
      avgDurationMinutes: timed.length ? Math.round(durationSum / timed.length) : null,
      afternoonPct: timed.length ? 100 - pct(evening, timed.length) : 0,
      eveningPct: pct(evening, timed.length),
    },
    heat,
    leadAvgDays: leads.length
      ? Math.round((leads.reduce((sum, lead) => sum + lead, 0) / leads.length) * 10) / 10
      : null,
    leadBuckets,
    gapAvgDays,
  };
}

// ---------- group ----------

/** Fewer played sessions than this show the "few data" note on the group tab. */
export const FEW_GROUP_SESSIONS = 6;

/** Fewer played sessions than this show the "few data" note on a campaign. */
export const FEW_CAMPAIGN_SESSIONS = 5;

/**
 * Metrics of the group tab (visible to everyone).
 *
 * @param {StatSession[]} sessions - Every session, any status or date.
 * @param {PeriodBounds} bounds - The selected period.
 * @param {StatContext} context - Campaigns, answers, holidays and today.
 * @returns {GroupStats} The view-model.
 */
export function groupStats(
  sessions: StatSession[],
  bounds: PeriodBounds,
  context: StatContext,
): GroupStats {
  const { played } = sessionsInPeriod(sessions, bounds);
  const { hours, timedCount } = hoursOf(played);

  const byCampaign = countBy(played, (session) => session.campaignId);
  const byMonth = countBy(played, (session) => session.date.slice(0, 7));
  const byDm = countBy(played, (session) => session.dmId);
  const byAttendee = countBy(played, (session) => session.attendeeIds);

  const pairs = new Map<string, number>();
  const personMonth = new Map<string, number>();
  for (const session of played) {
    const ids = [...session.attendeeIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
      const monthKey = `${ids[i]}|${session.date.slice(0, 7)}`;
      personMonth.set(monthKey, (personMonth.get(monthKey) ?? 0) + 1);
    }
  }

  const bestMonth = new Map<string, { value: number; month: string }>();
  for (const [key, value] of [...personMonth.entries()].sort()) {
    const [userId, month] = key.split("|");
    const current = bestMonth.get(userId);
    if (!current || value > current.value) {
      bestMonth.set(userId, { value, month });
    }
  }

  const percentEntries = [...context.names.keys()]
    .map((userId) => {
      const own = played.filter((session) => memberOf(context, session.campaignId, userId));
      const attended = byAttendee.get(userId) ?? 0;
      return { key: userId, value: pct(attended, own.length), meta: { attended, of: own.length } };
    })
    .filter((entry) => entry.meta.of > 0);

  const runs = weekRuns(played.map((session) => session.date));

  const gaps = context.campaigns
    .map((campaign) => {
      const dates = played
        .filter((session) => session.campaignId === campaign.id)
        .map((session) => session.date);
      return dates.length > 1
        ? {
            campaignId: campaign.id,
            days: Math.round(daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1)),
          }
        : null;
    })
    .filter((gap): gap is { campaignId: string; days: number } => gap !== null)
    .sort((a, b) => a.days - b.days);

  const forgotten =
    context.campaigns
      .filter((campaign) => campaign.archivedDay === null)
      .map((campaign) => {
        const last = sessions
          .filter(
            (session) =>
              session.campaignId === campaign.id &&
              session.status === "PLAYED" &&
              session.date <= context.today,
          )
          .map((session) => session.date)
          .sort()
          .pop();
        return last
          ? { campaignId: campaign.id, days: daysBetween(last, context.today), lastDate: last }
          : null;
      })
      .filter((entry): entry is { campaignId: string; days: number; lastDate: string } => entry !== null)
      .sort((a, b) => b.days - a.days)[0] ?? null;

  return {
    empty: played.length === 0,
    few: played.length > 0 && played.length < FEW_GROUP_SESSIONS,
    played: played.length,
    hours,
    timedCount,
    campaigns: byCampaign.size,
    players: new Set(played.flatMap((session) => session.attendeeIds)).size,
    fame: {
      campaign: rank([...byCampaign].map(([key, value]) => ({ key, value }))),
      month: rank([...byMonth].map(([key, value]) => ({ key, value }))),
      dm: rank([...byDm].map(([key, value]) => ({ key, value }))),
      attendanceTotal: rank([...byAttendee].map(([key, value]) => ({ key, value }))),
      attendancePct: rank(percentEntries),
      pair: rank([...pairs].map(([key, value]) => ({ key, value }))),
      recordMonth: rank(
        [...bestMonth].map(([key, best]) => ({
          key,
          value: best.value,
          meta: { month: best.month },
        })),
      ),
      streak: rank(
        runs.map((run, index) => ({
          key: String(index),
          value: run.weeks,
          meta: { from: run.from, to: run.to },
        })),
      ),
    },
    rhythm: rhythm(played, bounds, context),
    gaps,
    forgotten,
    legend: context.campaigns
      .filter((campaign) => byCampaign.has(campaign.id))
      .map((campaign) => ({ campaignId: campaign.id, n: byCampaign.get(campaign.id) ?? 0 })),
  };
}

/**
 * Whether a user is a member of a campaign.
 *
 * @param {StatContext} context - The campaigns.
 * @param {string} campaignId - The campaign.
 * @param {string} userId - The user.
 * @returns {boolean} True when they are on its roster.
 */
function memberOf(context: StatContext, campaignId: string, userId: string): boolean {
  return (
    context.campaigns
      .find((campaign) => campaign.id === campaignId)
      ?.members.some((member) => member.userId === userId) ?? false
  );
}

// ---------- campaign ----------

/**
 * Metrics of one campaign's tab.
 *
 * @param {string} campaignId - The campaign.
 * @param {StatSession[]} sessions - Every session (any campaign; filtered here).
 * @param {PeriodBounds} bounds - The selected period.
 * @param {StatContext} context - Campaigns, answers, holidays and today.
 * @returns {CampaignStats | null} The view-model, or null for an unknown campaign.
 */
export function campaignStats(
  campaignId: string,
  sessions: StatSession[],
  bounds: PeriodBounds,
  context: StatContext,
): CampaignStats | null {
  const campaign = context.campaigns.find((candidate) => candidate.id === campaignId);
  if (!campaign) {
    return null;
  }

  const own = sessions.filter((session) => session.campaignId === campaignId);
  const { played, canceled } = sessionsInPeriod(own, bounds);
  const { hours, timedCount } = hoursOf(played);
  const attendance = countBy(played, (session) => session.attendeeIds);
  const memberCount = campaign.members.length;
  const forced = played.filter((session) => session.forced).length;
  const total = played.length + canceled.length;

  const faithful =
    rank(
      campaign.members
        .filter((member) => !member.isDm)
        .map((member) => ({
          key: member.userId,
          value: pct(attendance.get(member.userId) ?? 0, played.length),
        })),
      1,
    )[0] ?? null;

  const tally = (userIds: string[]) =>
    [...countBy(userIds, (id) => id)]
      .map(([userId, n]) => ({ userId, n }))
      .sort((a, b) => b.n - a.n || (a.userId < b.userId ? -1 : 1));

  const lifeEnd = campaign.archivedDay ?? context.today;
  const spanEnd = bounds.to < lifeEnd ? bounds.to : lifeEnd;
  const members = [...campaign.members]
    .map((member) => {
      const spanStart = bounds.from > member.joinedDay ? bounds.from : member.joinedDay;
      return {
        userId: member.userId,
        name: member.name,
        isDm: member.isDm,
        reliability: reliability(member.userId, spanStart, spanEnd, context),
      };
    })
    .sort((a, b) =>
      a.isDm === b.isDm ? a.name.localeCompare(b.name, "es") : a.isDm ? -1 : 1,
    );

  return {
    campaignId,
    archived: campaign.archivedDay !== null,
    empty: total === 0,
    few: played.length > 0 && played.length < FEW_CAMPAIGN_SESSIONS,
    played: played.length,
    hours,
    timedCount,
    attendancePct: played.length
      ? pct(
          played.reduce((sum, session) => sum + session.attendeeIds.length, 0),
          played.length * memberCount,
        )
      : 0,
    faithful,
    lastDate: played.length ? played[played.length - 1].date : null,
    lastPlayedYear: lastPlayedYear(own, context.today),
    next: campaign.archivedDay === null ? campaign.next : null,
    canceled: canceled.length,
    playedPct: pct(played.length, total),
    canceledPct: pct(canceled.length, total),
    lateCancel: canceled.filter(
      (session) =>
        session.cancelledDay !== null && daysBetween(session.cancelledDay, session.date) <= 2,
    ).length,
    causes: tally(
      canceled
        .map((session) => session.cancelCauseUserId)
        .filter((id): id is string => id !== null),
    ),
    forced,
    forcedPct: pct(forced, played.length),
    lateJoiners: tally(played.flatMap((session) => session.lateJoinerIds)),
    rhythm: rhythm(played, bounds, { ...context, campaigns: [campaign] }),
    members,
  };
}

/**
 * Year of the latest played session up to today, ignoring the period.
 *
 * @param {StatSession[]} sessions - The campaign's sessions.
 * @param {string} today - Today as "YYYY-MM-DD".
 * @returns {number | null} The year, or null when nothing was played.
 */
function lastPlayedYear(sessions: StatSession[], today: string): number | null {
  const last = sessions
    .filter((session) => session.status === "PLAYED" && session.date <= today)
    .map((session) => session.date)
    .sort()
    .pop();
  return last ? Number(last.slice(0, 4)) : null;
}

// ---------- me ----------

/**
 * Metrics of the "Yo" tab.
 *
 * @param {string} userId - The user.
 * @param {StatSession[]} sessions - Every session.
 * @param {PeriodBounds} bounds - The selected period.
 * @param {StatContext} context - Campaigns, answers, holidays and today.
 * @returns {MeStats} The view-model.
 */
export function meStats(
  userId: string,
  sessions: StatSession[],
  bounds: PeriodBounds,
  context: StatContext,
): MeStats {
  const mine = context.campaigns.filter((campaign) =>
    campaign.members.some((member) => member.userId === userId),
  );
  const myIds = new Set(mine.map((campaign) => campaign.id));
  const { played } = sessionsInPeriod(
    sessions.filter((session) => myIds.has(session.campaignId)),
    bounds,
  );
  const attended = played.filter((session) => session.attendeeIds.includes(userId));
  const asDm = attended.filter((session) => session.dmId === userId).length;

  const campaigns = mine
    .map((campaign) => {
      const list = played.filter((session) => session.campaignId === campaign.id);
      const own = list.filter((session) => session.attendeeIds.includes(userId));
      const dm = own.filter((session) => session.dmId === userId).length;
      return {
        campaignId: campaign.id,
        asPlayer: own.length - dm,
        asDm: dm,
        total: own.length,
        of: list.length,
        attendancePct: pct(own.length, list.length),
      };
    })
    .filter((row) => row.of > 0)
    .sort((a, b) => b.total - a.total || (a.campaignId < b.campaignId ? -1 : 1));

  const together = new Map<string, number>();
  for (const session of attended) {
    for (const id of session.attendeeIds) {
      if (id !== userId) {
        together.set(id, (together.get(id) ?? 0) + 1);
      }
    }
  }

  const firstJoin = mine
    .flatMap((campaign) => campaign.members.filter((member) => member.userId === userId))
    .map((member) => member.joinedDay)
    .sort()[0];
  const spanStart = firstJoin && firstJoin > bounds.from ? firstJoin : bounds.from;
  const run = weekRuns(attended.map((session) => session.date))[0];

  return {
    empty: attended.length === 0,
    isDm: mine.some((campaign) =>
      campaign.members.some((member) => member.userId === userId && member.isDm),
    ),
    campaignCount: mine.length,
    played: attended.length,
    asPlayer: attended.length - asDm,
    asDm,
    attendancePct: pct(attended.length, played.length),
    hours: hoursOf(attended).hours,
    streak: run ? { weeks: run.weeks, from: run.from, to: run.to } : null,
    campaigns,
    companions: rank([...together].map(([key, value]) => ({ key, value }))),
    reliability: reliability(userId, spanStart, bounds.to, context),
  };
}
