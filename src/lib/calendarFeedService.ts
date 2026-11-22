import { AvailabilityStatus } from "@/generated/prisma/enums";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendarFeed/ics";
import {
  buildReminderEvent,
  buildSessionEvent,
  createFeedTranslator,
  needsAvailabilityReminder,
} from "@/lib/calendarFeed/feedEvents";
import { ACTIVE_SESSION } from "@/lib/confirmedSessionService";
import {
  addDays,
  addMonths,
  eligibleDaysOfMonth,
  lastDayOfMonth,
  toIsoDate,
  toUtcDate,
} from "@/lib/date";
import { env } from "@/lib/env";
import { listHolidays } from "@/lib/holidayService";
import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/secureToken";
import { todayIso } from "@/lib/today";
import { type AppLocale, DEFAULT_LOCALE, isAppLocale } from "@/i18n/settings";

/** How far back the feed reaches, so recent sessions stay visible after they happen. */
export const FEED_HISTORY_DAYS = 90;

/** Shape of a feed token: 32 random bytes, base64url encoded (43 characters). */
const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Cheap shape check run before touching the database, so junk URLs never cost
 * a query.
 *
 * @param {string} token - The value taken from the URL.
 * @returns {boolean} True when it looks like a token this app could have issued.
 */
export function isFeedTokenShape(token: string): boolean {
  return FEED_TOKEN_PATTERN.test(token);
}

/**
 * Builds the absolute subscription URL for a token, from `AUTH_URL` and never
 * from request headers.
 *
 * @param {string} token - The user's feed token.
 * @returns {string} The `https://…/api/calendar/<token>.ics` URL.
 */
export function buildFeedUrl(token: string): string {
  const base = (env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/calendar/${token}.ics`;
}

/**
 * Returns the user's current subscription URL, or null when they have not
 * generated one yet. Read-only: opening /profile never creates a link.
 *
 * @param {string} userId - The signed-in user.
 * @returns {Promise<string | null>} The feed URL, or null.
 */
export async function getFeedUrlForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });

  return user?.calendarFeedToken ? buildFeedUrl(user.calendarFeedToken) : null;
}

/**
 * Returns the user's feed token, creating one on first use. Idempotent: a user
 * who already has one keeps it, so double-clicking "Generar" cannot rotate it.
 *
 * @param {string} userId - The signed-in user.
 * @returns {Promise<string>} The feed token.
 */
export async function ensureFeedToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (user?.calendarFeedToken) {
    return user.calendarFeedToken;
  }

  const token = generateSecureToken();
  // Conditional on still being null, so two concurrent first calls cannot both win.
  const updated = await prisma.user.updateMany({
    where: { id: userId, calendarFeedToken: null },
    data: { calendarFeedToken: token },
  });
  if (updated.count === 1) {
    return token;
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarFeedToken: true },
  });
  if (!current?.calendarFeedToken) {
    throw new Error(`[CALENDAR-FEED/ENSURE-TOKEN] User ${userId} not found.`);
  }
  return current.calendarFeedToken;
}

/**
 * Replaces the user's feed token. The old URL stops working immediately, which
 * is the point: it is how someone revokes a link that leaked.
 *
 * @param {string} userId - The signed-in user.
 * @returns {Promise<string>} The new feed token.
 */
export async function regenerateFeedToken(userId: string): Promise<string> {
  const token = generateSecureToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
  return token;
}

/**
 * Loads the sessions a user attends within the feed window and turns them into
 * events. Two queries however many sessions there are: one for the sessions
 * with their attendees, one for every "online" answer on those days.
 *
 * @param {string} userId - The feed's owner.
 * @param {AppLocale} locale - The owner's locale.
 * @param {string} today - Today in the app timezone, "YYYY-MM-DD".
 * @returns {Promise<IcsEvent[]>} One event per attended session.
 */
async function loadSessionEvents(
  userId: string,
  locale: AppLocale,
  today: string,
): Promise<IcsEvent[]> {
  const sessions = await prisma.confirmedSession.findMany({
    where: {
      ...ACTIVE_SESSION,
      date: { gte: toUtcDate(addDays(today, -FEED_HISTORY_DAYS)) },
      attendees: { some: { userId } },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      durationMinutes: true,
      updatedAt: true,
      campaign: { select: { name: true } },
      attendees: { select: { userId: true, user: { select: { name: true } } } },
    },
    orderBy: { date: "asc" },
  });
  if (sessions.length === 0) {
    return [];
  }

  const dates = [...new Set(sessions.map((session) => session.date.getTime()))].map(
    (time) => new Date(time),
  );
  const attendeeIds = [
    ...new Set(sessions.flatMap((session) => session.attendees.map((a) => a.userId))),
  ];
  const onlineAnswers = await prisma.availability.findMany({
    where: {
      status: AvailabilityStatus.ONLINE,
      date: { in: dates },
      userId: { in: attendeeIds },
    },
    select: { date: true, userId: true },
  });
  const online = new Set(onlineAnswers.map((a) => `${toIsoDate(a.date)}|${a.userId}`));

  return sessions.map((session) => {
    const dateIso = toIsoDate(session.date);
    const attendeeNames = session.attendees.map((a) => a.user.name);
    const onlineAttendeeNames = session.attendees
      .filter((a) => online.has(`${dateIso}|${a.userId}`))
      .map((a) => a.user.name);

    return buildSessionEvent({
      sessionId: session.id,
      campaignName: session.campaign.name,
      dateIso,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      attendeeNames,
      onlineAttendeeNames,
      updatedAt: session.updatedAt,
      locale,
      timezone: env.APP_TIMEZONE,
      appUrl: env.AUTH_URL ?? null,
    });
  });
}

/**
 * Builds the user's monthly availability reminder, when they need one: they
 * belong to a campaign and next month has eligible days they have not answered.
 * The reminder sits on the last day of the current month and disappears from
 * the feed on its own once they finish answering.
 *
 * @param {string} userId - The feed's owner.
 * @param {AppLocale} locale - The owner's locale.
 * @param {string} today - Today in the app timezone, "YYYY-MM-DD".
 * @param {Date} now - The instant the feed is generated.
 * @returns {Promise<IcsEvent | null>} The reminder event, or null when none is due.
 */
async function loadReminderEvent(
  userId: string,
  locale: AppLocale,
  today: string,
  now: Date,
): Promise<IcsEvent | null> {
  const currentMonth = today.slice(0, 7);
  const targetMonth = addMonths(currentMonth, 1);

  const membership = await prisma.campaignPlayer.findFirst({
    where: { userId },
    select: { campaignId: true },
  });
  if (!membership) {
    return null;
  }

  const holidays = new Set((await listHolidays()).map((holiday) => holiday.date));
  const eligibleDays = eligibleDaysOfMonth(targetMonth, holidays);
  if (eligibleDays.length === 0) {
    return null;
  }

  const answers = await prisma.availability.findMany({
    where: {
      userId,
      date: { gte: toUtcDate(eligibleDays[0]), lte: toUtcDate(lastDayOfMonth(targetMonth)) },
    },
    select: { date: true },
  });
  const answered = new Set(answers.map((answer) => toIsoDate(answer.date)));
  if (!needsAvailabilityReminder(eligibleDays, answered)) {
    return null;
  }

  return buildReminderEvent({
    month: targetMonth,
    dateIso: lastDayOfMonth(currentMonth),
    userId,
    locale,
    appUrl: env.AUTH_URL ?? null,
    now,
  });
}

/**
 * Produces the iCalendar feed for a subscription token: the sessions the owner
 * attends (recent past and future) plus their availability reminder when one is
 * due.
 *
 * @param {string} token - The token from the subscription URL.
 * @returns {Promise<string | null>} The `.ics` document, or null when the token
 *   matches nobody or the account is disabled (the route answers 404 for both,
 *   so a revoked account cannot be told apart from a wrong token).
 */
export async function getFeedForToken(token: string): Promise<string | null> {
  if (!isFeedTokenShape(token)) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { calendarFeedToken: token },
    select: { id: true, locale: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    return null;
  }

  const locale = isAppLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const now = new Date();
  const today = todayIso();

  const [sessionEvents, reminder] = await Promise.all([
    loadSessionEvents(user.id, locale, today),
    loadReminderEvent(user.id, locale, today, now),
  ]);

  return buildIcsCalendar({
    name: createFeedTranslator(locale)("calendarFeed.name"),
    events: reminder ? [...sessionEvents, reminder] : sessionEvents,
    generatedAt: now,
  });
}
