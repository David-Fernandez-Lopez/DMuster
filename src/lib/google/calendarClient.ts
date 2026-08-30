// Talks to the Google Calendar API v3 REST endpoints for one attendee's
// primary calendar (roadmap #23). No SDK — three plain `fetch` calls,
// matching this project's existing minimalism (see `src/lib/google/oauth.ts`).
// Every result is discriminated and classifies failures for the caller
// (`calendarSyncService.processPending`): `authFailure: true` means the access
// token itself was rejected — retrying with the SAME token will fail
// identically, so the caller treats it like a revoked connection instead of
// just spending a retry attempt. Everything else (quota, 429, 5xx, other 4xx)
// is `authFailure: false` and goes through the normal retry/backoff path (see
// syncBackoff.ts).
//
// That distinction is drawn from the error body, not the status code alone:
// Google answers 403 both for a token it will not accept and for a quota that
// has run out, and those want opposite handling. See `classifyGoogleFailure`.

import { DMUSTER_SESSION_PROPERTY, type GoogleCalendarEventBody } from "./calendarEvent";

const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;

type GoogleApiFailure = {
  ok: false;
  authFailure: boolean;
  /**
   * True when Google says the event is not there. Distinguished from every
   * other failure because it is not a failure to retry: the event is gone, and
   * repeating the same call with the same id will keep saying so until the
   * attempt budget runs out and the row is abandoned as FAILED.
   */
  notFound: boolean;
  errorMessage: string;
};
export type InsertEventResult = { ok: true; eventId: string } | GoogleApiFailure;
export type MutateEventResult = { ok: true } | GoogleApiFailure;

/** Result of looking an event up by the session it belongs to. */
export type FindEventResult =
  | { ok: true; eventId: string | null }
  | { ok: false; authFailure: boolean; errorMessage: string };

/**
 * Reasons Google puts on a 403 that mean "too much, too fast" rather than
 * "this token is no good". Documented for the Calendar API; anything else on a
 * 403 is taken as an authorization problem.
 */
const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
  "variableTermLimitExceeded",
]);

/** Shape of Google's error body, as much of it as this app reads. */
type GoogleErrorBody = {
  error?: { message?: string; errors?: { reason?: string }[]; status?: string };
};

/**
 * Classifies a failed Google API response, reading the body once for both the
 * diagnostic string and the decision.
 *
 * The status alone is not enough on a 403. Google uses it for a revoked or
 * insufficient token *and* for exceeding a quota, and the two want opposite
 * handling: a bad token is unrecoverable until the person reconnects, while a
 * quota is the definition of "try again later". Treating them alike meant one
 * burst of activity against a shared quota marked the connection broken — and
 * because the quota is per project, that verdict landed on whoever's row
 * happened to be next, however healthy their token was.
 *
 * @param {Response} response - The failed fetch response.
 * @returns {Promise<{ authFailure: boolean; notFound: boolean; errorMessage: string }>}
 *   How to treat it, and a short diagnostic for `lastError`.
 */
export async function classifyGoogleFailure(
  response: Response,
): Promise<{ authFailure: boolean; notFound: boolean; errorMessage: string }> {
  const body = (await response.json().catch(() => null)) as GoogleErrorBody | null;
  const message = body?.error?.message;
  const errorMessage = message ? `${response.status} ${message}` : `HTTP ${response.status}`;

  const reasons = body?.error?.errors?.map((entry) => entry.reason ?? "") ?? [];
  const isQuota =
    reasons.some((reason) => QUOTA_REASONS.has(reason)) ||
    body?.error?.status === "RESOURCE_EXHAUSTED";

  return {
    authFailure: response.status === 401 || (response.status === 403 && !isQuota),
    notFound: response.status === 404,
    errorMessage,
  };
}

/**
 * Creates a calendar event (`POST .../events`) on the given access token's
 * primary calendar.
 *
 * @param {string} accessToken - A valid (non-expired) Google access token.
 * @param {GoogleCalendarEventBody} body - The event payload to create.
 * @returns {Promise<InsertEventResult>} The new event's id, or a classified failure.
 */
export async function insertEvent(
  accessToken: string,
  body: GoogleCalendarEventBody,
): Promise<InsertEventResult> {
  try {
    const response = await fetch(CALENDAR_EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, ...(await classifyGoogleFailure(response)) };
    }

    const data = (await response.json()) as { id: string };
    return { ok: true, eventId: data.id };
  } catch (error) {
    return {
      ok: false,
      authFailure: false,
      notFound: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Updates an existing calendar event (`PATCH .../events/{eventId}`) with a
 * full replacement payload.
 *
 * @param {string} accessToken - A valid (non-expired) Google access token.
 * @param {string} eventId - The Google event id to update.
 * @param {GoogleCalendarEventBody} body - The full replacement payload.
 * @returns {Promise<MutateEventResult>} Success, or a classified failure.
 */
export async function patchEvent(
  accessToken: string,
  eventId: string,
  body: GoogleCalendarEventBody,
): Promise<MutateEventResult> {
  try {
    const response = await fetch(`${CALENDAR_EVENTS_URL}/${eventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, ...(await classifyGoogleFailure(response)) };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      authFailure: false,
      notFound: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Asks Google whether this calendar already holds an event for a session,
 * matching on the private extended property every event is stamped with.
 *
 * This is the only way back to an event whose local `googleEventId` was lost —
 * and the only thing that stops a second `insertEvent` from leaving a duplicate
 * beside the first. The property has been written on every event since the
 * integration existed; it had simply never been read.
 *
 * @param {string} accessToken - A valid (non-expired) Google access token.
 * @param {string} sessionId - The `ConfirmedSession` id to look for.
 * @returns {Promise<FindEventResult>} The event id, `null` when Google has
 *   none, or a classified failure.
 */
export async function findEventBySession(
  accessToken: string,
  sessionId: string,
): Promise<FindEventResult> {
  const url = new URL(CALENDAR_EVENTS_URL);
  url.searchParams.set(
    "privateExtendedProperty",
    `${DMUSTER_SESSION_PROPERTY}=${sessionId}`,
  );
  url.searchParams.set("maxResults", "1");
  // Cancelled events still match the property; adopting one would hand back an
  // id that cannot be patched.
  url.searchParams.set("showDeleted", "false");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const { authFailure, errorMessage } = await classifyGoogleFailure(response);
      return { ok: false, authFailure, errorMessage };
    }

    const data = (await response.json()) as { items?: { id?: string }[] };
    return { ok: true, eventId: data.items?.[0]?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      authFailure: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Deletes a calendar event (`DELETE .../events/{eventId}`). A `404` counts as
 * success — the user may have already removed the event by hand, and either
 * way there is nothing left at Google to clean up.
 *
 * @param {string} accessToken - A valid (non-expired) Google access token.
 * @param {string} eventId - The Google event id to delete.
 * @returns {Promise<MutateEventResult>} Success, or a classified failure.
 */
export async function deleteEvent(accessToken: string, eventId: string): Promise<MutateEventResult> {
  try {
    const response = await fetch(`${CALENDAR_EVENTS_URL}/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok && response.status !== 404) {
      return { ok: false, ...(await classifyGoogleFailure(response)) };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      authFailure: false,
      notFound: false,
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}
