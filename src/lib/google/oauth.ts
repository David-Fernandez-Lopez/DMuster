// Google OAuth connection (roadmap #23) — NOT an authentication provider.
// DMuster's login stays on credentials; this module only obtains and
// maintains a delegated token that lets the app write to a user's primary
// Google Calendar. Tokens are stored in the existing Auth.js `Account` table
// under `provider = "google"`; these rows are entirely app-managed (the
// credentials provider never creates `Account` rows, so there is no
// collision). Every export returns a discriminated result — never throws to
// its caller — mirroring `confirmedSessionService.ts`.

import { randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

import { signState, verifyState } from "./oauthState";

const GOOGLE_PROVIDER = "google";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.events openid email";

/** How long a signed `state` (and its matching nonce cookie) stays valid. */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Cookie holding the OAuth nonce for the in-flight connection attempt. */
export const GOOGLE_OAUTH_NONCE_COOKIE = "google_oauth_nonce";

/** Refresh the access token this long before its real expiry, to absorb request latency. */
const TOKEN_EXPIRY_LEEWAY_SECONDS = 60;

/** Network calls to Google must not hang a request indefinitely. */
const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type TokenEndpointResult =
  | { ok: true; data: GoogleTokenResponse }
  | { ok: false; errorCode: string | null };

/**
 * Reads the three Google OAuth env vars, asserting they are present. Callers
 * are expected to have already checked `isGoogleSyncConfigured` (the routes
 * do, returning 404 otherwise) — this is a fail-fast safety net, not the
 * primary guard.
 *
 * @returns {{ clientId: string; clientSecret: string; redirectUri: string }} The three required values.
 * @throws {Error} If Google OAuth is not configured.
 */
function requireGoogleConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error("[GOOGLE-OAUTH/CONFIG] Google OAuth is not configured.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

/**
 * Decodes a JWT's middle segment without verifying its signature. Safe here
 * because the `id_token` arrives over a direct server-to-server TLS call to
 * Google's token endpoint (`exchangeCodeAndConnect`), never from the browser —
 * there is no untrusted party between us and the issuer.
 *
 * @param {string} idToken - The `id_token` returned by Google's token endpoint.
 * @returns {{ sub: string; email: string | null } | null} The Google account
 *   id and email, or null if the token is malformed.
 */
function decodeIdTokenPayload(idToken: string): { sub: string; email: string | null } | null {
  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { sub?: unknown }).sub !== "string"
    ) {
      return null;
    }
    const email = (payload as { email?: unknown }).email;
    return { sub: (payload as { sub: string }).sub, email: typeof email === "string" ? email : null };
  } catch {
    return null;
  }
}

/**
 * Posts to Google's token endpoint (used for both the initial code exchange
 * and later refreshes — they share the same endpoint and response shape).
 *
 * @param {Record<string, string>} params - Form-encoded request body.
 * @returns {Promise<TokenEndpointResult>} The parsed response, or the
 *   `error` code Google returned (e.g. `"invalid_grant"`) on failure.
 */
async function postToTokenEndpoint(params: Record<string, string>): Promise<TokenEndpointResult> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as
      | (GoogleTokenResponse & { error?: string })
      | null;

    if (!response.ok || !data?.access_token) {
      return { ok: false, errorCode: data?.error ?? null };
    }

    return { ok: true, data };
  } catch (error) {
    console.error("[GOOGLE-OAUTH/TOKEN] Request to Google's token endpoint failed:", error);
    return { ok: false, errorCode: null };
  }
}

/**
 * Marks a user's Google connection as broken (revoked or expired consent),
 * surfacing a reconnect prompt in `/profile`. Cleared again on a successful
 * `exchangeCodeAndConnect`.
 *
 * @param {string} userId - The user whose connection just failed irrecoverably.
 * @returns {Promise<void>}
 */
async function markBroken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { googleSyncBrokenAt: new Date() },
  });
}

/**
 * Builds the Google consent screen URL for a user starting the connection
 * flow, with a freshly signed, single-use `state`. `access_type=offline` is
 * what makes Google issue a `refresh_token` at all, and `prompt=consent`
 * forces the consent screen (and therefore a fresh `refresh_token`) even for
 * a user who authorized DMuster before — Google only issues it on the first
 * consent otherwise.
 *
 * @param {string} userId - The DMuster user starting the flow.
 * @returns {{ url: string; nonce: string }} The consent URL to redirect to,
 *   and the nonce to also store in an httpOnly cookie (`verifyOAuthCallback`
 *   checks both match).
 */
export function buildConsentUrl(userId: string): { url: string; nonce: string } {
  const config = requireGoogleConfig();
  const nonce = randomBytes(16).toString("base64url");
  const state = signState({ userId, nonce }, env.AUTH_SECRET);

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return { url: url.toString(), nonce };
}

/**
 * Verifies a callback's `state` against the signing key and the nonce cookie
 * set by `buildConsentUrl`. Requiring both is what makes the state single-use
 * in practice without a database table: an attacker who intercepts the
 * redirect URL still lacks the httpOnly cookie from the browser that started
 * the flow.
 *
 * @param {string | null} state - The `state` query param from Google's redirect.
 * @param {string | undefined} cookieNonce - The nonce cookie's value.
 * @returns {string | null} The originating user's id, or null if invalid.
 */
export function verifyOAuthCallback(
  state: string | null,
  cookieNonce: string | undefined,
): string | null {
  if (!state || !cookieNonce) {
    return null;
  }
  const verified = verifyState(state, env.AUTH_SECRET, OAUTH_STATE_MAX_AGE_MS);
  if (!verified || verified.nonce !== cookieNonce) {
    return null;
  }
  return verified.userId;
}

export type ConnectResult = { ok: true } | { ok: false; error: string };

/**
 * Exchanges an authorization code for tokens and persists the connection:
 * upserts the app-managed `Account` row (keyed by Google's stable `sub`, not
 * by DMuster user, since that is the row's real identity at Google) and flips
 * `User.googleSyncEnabled` on. Refuses to hijack a Google account already
 * linked to a *different* DMuster user. When Google does not return a fresh
 * `refresh_token` (it only does on first consent), the previously stored one
 * is kept instead of being overwritten with nothing.
 *
 * @param {string} userId - The DMuster user completing the flow.
 * @param {string} code - The authorization code from Google's redirect.
 * @returns {Promise<ConnectResult>} Success, or an i18n error key.
 */
export async function exchangeCodeAndConnect(userId: string, code: string): Promise<ConnectResult> {
  const config = requireGoogleConfig();

  const result = await postToTokenEndpoint({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  if (!result.ok || !result.data.id_token) {
    console.error(
      "[GOOGLE-OAUTH/EXCHANGE] Code exchange failed:",
      result.ok ? "missing id_token" : result.errorCode,
    );
    return { ok: false, error: "integrations.google.errors.exchange" };
  }

  const identity = decodeIdTokenPayload(result.data.id_token);
  if (!identity) {
    console.error("[GOOGLE-OAUTH/EXCHANGE] Could not decode id_token.");
    return { ok: false, error: "integrations.google.errors.exchange" };
  }

  try {
    const existing = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: identity.sub },
      },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      return { ok: false, error: "integrations.google.errors.alreadyLinked" };
    }

    const expiresAt = Math.floor(Date.now() / 1000) + result.data.expires_in;

    await prisma.account.upsert({
      where: {
        provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: identity.sub },
      },
      create: {
        userId,
        type: "oauth",
        provider: GOOGLE_PROVIDER,
        providerAccountId: identity.sub,
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token ?? null,
        expires_at: expiresAt,
        scope: result.data.scope ?? null,
        token_type: result.data.token_type ?? null,
        id_token: result.data.id_token,
      },
      update: {
        access_token: result.data.access_token,
        expires_at: expiresAt,
        scope: result.data.scope ?? null,
        token_type: result.data.token_type ?? null,
        id_token: result.data.id_token,
        ...(result.data.refresh_token ? { refresh_token: result.data.refresh_token } : {}),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { googleSyncEnabled: true, googleSyncBrokenAt: null },
    });

    return { ok: true };
  } catch (error) {
    console.error("[GOOGLE-OAUTH/EXCHANGE] Failed to persist the Google account:", error);
    return { ok: false, error: "integrations.google.errors.unknown" };
  }
}

export type AccessTokenResult = { ok: true; accessToken: string } | { ok: false; error: string };

/**
 * Returns a valid access token for a user's connected Google account,
 * refreshing it first when it has expired or is about to
 * (`TOKEN_EXPIRY_LEEWAY_SECONDS` of margin for request latency). An
 * `invalid_grant` response — the consent was revoked at Google, or expired
 * (Google's "Testing" publishing status expires refresh tokens after 7
 * days) — marks the connection broken instead of being retried: no amount of
 * retrying fixes a revoked grant, and doing so would just burn through the
 * sync ledger's attempt budget for nothing.
 *
 * @param {string} userId - The user whose token is needed.
 * @returns {Promise<AccessTokenResult>} A usable access token, or an i18n error key.
 */
export async function getAccessToken(userId: string): Promise<AccessTokenResult> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: GOOGLE_PROVIDER },
  });

  if (!account) {
    return { ok: false, error: "integrations.google.errors.notConnected" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at > nowSeconds + TOKEN_EXPIRY_LEEWAY_SECONDS
  ) {
    return { ok: true, accessToken: account.access_token };
  }

  if (!account.refresh_token) {
    console.error("[GOOGLE-OAUTH/REFRESH] No refresh_token stored for user:", userId);
    await markBroken(userId);
    return { ok: false, error: "integrations.google.errors.revoked" };
  }

  const config = requireGoogleConfig();
  const result = await postToTokenEndpoint({
    refresh_token: account.refresh_token,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  if (!result.ok) {
    if (result.errorCode === "invalid_grant") {
      await markBroken(userId);
      return { ok: false, error: "integrations.google.errors.revoked" };
    }
    console.error("[GOOGLE-OAUTH/REFRESH] Token refresh failed:", result.errorCode);
    return { ok: false, error: "integrations.google.errors.exchange" };
  }

  const expiresAt = Math.floor(Date.now() / 1000) + result.data.expires_in;

  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId: account.providerAccountId,
      },
    },
    data: { access_token: result.data.access_token, expires_at: expiresAt },
  });

  return { ok: true, accessToken: result.data.access_token };
}

/**
 * Disconnects a user's Google account: revokes the token at Google (best
 * effort — a network failure here must not block a local disconnect, since a
 * token Google never hears from again is inert either way) and deletes the
 * `Account` row. Idempotent: a user with no connection is treated as already
 * disconnected. Does not touch `SessionCalendarEvent` rows or enqueue
 * deletions — that is `calendarSyncService.enqueueDeletionForUser`'s job
 * (roadmap #23 phase 5), called by the route before this.
 *
 * @param {string} userId - The user disconnecting.
 * @returns {Promise<{ ok: true }>} Always succeeds from the caller's perspective.
 */
export async function revokeAccess(userId: string): Promise<{ ok: true }> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: GOOGLE_PROVIDER },
  });

  if (!account) {
    return { ok: true };
  }

  const token = account.refresh_token ?? account.access_token;
  if (token) {
    try {
      const response = await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      });
      // Google returns 200 on success and 400 when the token was already
      // invalid — both mean there is nothing left to revoke on its side.
      if (!response.ok && response.status !== 400) {
        console.error("[GOOGLE-OAUTH/REVOKE] Unexpected status revoking token:", response.status);
      }
    } catch (error) {
      console.error("[GOOGLE-OAUTH/REVOKE] Failed to reach Google's revoke endpoint:", error);
    }
  }

  await prisma.$transaction([
    prisma.account.delete({
      where: {
        provider_providerAccountId: {
          provider: GOOGLE_PROVIDER,
          providerAccountId: account.providerAccountId,
        },
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { googleSyncEnabled: false, googleSyncBrokenAt: null },
    }),
  ]);

  return { ok: true };
}
