import type { Prisma } from "@/generated/prisma/client";
import { PasswordResetOutcome } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { hashPassword } from "@/lib/passwordHash";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenUsable,
  passwordResetExpiresAt,
  passwordResetLockName,
  pruneCutoffs,
  rateLimitWindowStart,
  RESET_MAX_REQUESTS_PER_EMAIL,
  RESET_MAX_REQUESTS_PER_IP,
} from "@/lib/passwordReset";
import { buildPasswordResetEmail } from "@/lib/passwordResetEmail";
import { prisma } from "@/lib/prisma";

/** Seconds to wait for another request on the same email to finish. */
const LOCK_WAIT_SECONDS = 5;

/** Interactive-transaction timeout; must exceed `LOCK_WAIT_SECONDS`. */
const TRANSACTION_TIMEOUT_MS = 15_000;

/** What `decideRequest` settled on when a link must be mailed. */
type MailToSend = {
  logId: string;
  tokenId: string;
  rawToken: string;
  user: { name: string; locale: "es" | "en" };
};

/**
 * Builds the absolute reset URL. Always from `AUTH_URL`, never from request
 * headers: a spoofed `Host` must not be able to point the link at another site.
 *
 * @param {string} rawToken - The raw reset token.
 * @returns {string} The URL to mail.
 */
function buildResetLink(rawToken: string): string {
  const base = (env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/reset-password/${encodeURIComponent(rawToken)}`;
}

/**
 * Applies the rate limit, looks the account up, and (when a link is due)
 * creates the token — all while holding a MySQL user-level lock for this
 * email. Without the lock, concurrent requests could each count the others'
 * rows as absent and all get through the per-email limit. `GET_LOCK` belongs
 * to a connection, which is why this runs inside an interactive transaction:
 * Prisma keeps one connection for its whole duration. The per-IP limit is
 * counted inside the same window but is not serialised across emails, so it
 * stays advisory.
 *
 * @param {Prisma.TransactionClient} tx - The transaction (and its connection).
 * @param {{ email: string; ipAddress: string | null; now: Date }} input - Normalised request.
 * @returns {Promise<MailToSend | null>} What to mail, or null when nothing is sent.
 */
async function decideRequest(
  tx: Prisma.TransactionClient,
  input: { email: string; ipAddress: string | null; now: Date },
): Promise<MailToSend | null> {
  const { email, ipAddress, now } = input;
  const log = (outcome: PasswordResetOutcome) =>
    tx.passwordResetLog.create({ data: { email, outcome, ipAddress }, select: { id: true } });

  const lockName = passwordResetLockName(email);
  const [lock] = await tx.$queryRaw<{ acquired: bigint | number | null }[]>`
    SELECT GET_LOCK(${lockName}, ${LOCK_WAIT_SECONDS}) AS acquired`;
  if (Number(lock?.acquired) !== 1) {
    // Another request for this address held the lock the whole time: treat
    // the pile-up as what it is.
    await log(PasswordResetOutcome.RATE_LIMITED);
    return null;
  }

  try {
    // RATE_LIMITED rows are not counted, or hammering the form would keep
    // extending the lockout of the real owner of the address.
    const counted = {
      createdAt: { gte: rateLimitWindowStart(now) },
      outcome: { not: PasswordResetOutcome.RATE_LIMITED },
    };
    const byEmail = await tx.passwordResetLog.count({ where: { ...counted, email } });
    const byIp = ipAddress
      ? await tx.passwordResetLog.count({ where: { ...counted, ipAddress } })
      : 0;
    if (byEmail >= RESET_MAX_REQUESTS_PER_EMAIL || byIp >= RESET_MAX_REQUESTS_PER_IP) {
      await log(PasswordResetOutcome.RATE_LIMITED);
      return null;
    }

    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, name: true, locale: true, disabledAt: true },
    });
    if (!user) {
      await log(PasswordResetOutcome.UNKNOWN_EMAIL);
      return null;
    }
    if (user.disabledAt) {
      await log(PasswordResetOutcome.DISABLED_ACCOUNT);
      return null;
    }

    // Only the newest link works: older unredeemed ones are voided.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, supersededAt: null },
      data: { supersededAt: now },
    });
    const rawToken = generatePasswordResetToken();
    const token = await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashPasswordResetToken(rawToken),
        expiresAt: passwordResetExpiresAt(now),
      },
      select: { id: true },
    });
    const { id: logId } = await log(PasswordResetOutcome.SENT);

    return { logId, tokenId: token.id, rawToken, user: { name: user.name, locale: user.locale } };
  } finally {
    await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
  }
}

/**
 * Deletes `PasswordResetLog` rows past their retention and tokens that expired
 * more than a day ago (every token expires within the hour, so this covers
 * used and superseded ones too). Same contract as `pruneCronRuns`: run
 * opportunistically, never fails the caller. Run on every request rather than
 * from the cron routes so it also works where `CRON_SECRET` is unset.
 *
 * @returns {Promise<void>}
 */
export async function prunePasswordResetData(): Promise<void> {
  try {
    const { logsBefore, tokensBefore } = pruneCutoffs(new Date());
    await prisma.passwordResetLog.deleteMany({ where: { createdAt: { lt: logsBefore } } });
    await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: tokensBefore } } });
  } catch (error) {
    console.error("[PASSWORD_RESET/PRUNE] Failed to prune old rows:", error);
  }
}

/**
 * Processes a "forgot password" request. Meant to run after the response has
 * been sent (`after()` in the server action), so the visitor's answer never
 * depends on — or takes longer because of — anything done here. The outcome is
 * only written to `PasswordResetLog`; this never throws.
 *
 * @param {{ email: string; ipAddress: string | null }} input - Submitted email and the client IP, if known.
 * @returns {Promise<void>} Resolves once the request is fully handled.
 */
export async function requestPasswordReset(input: {
  email: string;
  ipAddress: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const now = new Date();

  try {
    const mail = await prisma.$transaction(
      (tx) => decideRequest(tx, { email, ipAddress: input.ipAddress, now }),
      { timeout: TRANSACTION_TIMEOUT_MS },
    );

    if (mail) {
      try {
        const message = buildPasswordResetEmail({
          locale: mail.user.locale,
          name: mail.user.name,
          link: buildResetLink(mail.rawToken),
        });
        await sendMail({ to: email, ...message });
      } catch (error) {
        console.error("[PASSWORD_RESET/SEND] Failed to send reset email:", error);
        await prisma.$transaction([
          prisma.passwordResetLog.update({
            where: { id: mail.logId },
            data: { outcome: PasswordResetOutcome.SEND_FAILED },
          }),
          prisma.passwordResetToken.deleteMany({ where: { id: mail.tokenId } }),
        ]);
      }
    }
  } catch (error) {
    console.error("[PASSWORD_RESET/REQUEST] Failed to process request:", error);
  }

  await prunePasswordResetData();
}

/**
 * Reports whether a raw token from a reset link is currently redeemable, so the
 * page can show the form or an explanation.
 *
 * @param {string} rawToken - Token taken from the URL.
 * @returns {Promise<boolean>} True when it exists, is redeemable and its account is enabled.
 */
export async function isResetTokenValid(rawToken: string): Promise<boolean> {
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(rawToken) },
    select: {
      usedAt: true,
      supersededAt: true,
      expiresAt: true,
      user: { select: { disabledAt: true } },
    },
  });
  return Boolean(token && !token.user.disabledAt && isPasswordResetTokenUsable(token, new Date()));
}

/** Result of redeeming a reset link. `error` is an i18n key. */
export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Sets a new password from a reset link. The token is claimed with a
 * conditional update, so two concurrent submissions cannot both succeed. On
 * success any other open link is voided and every session of the account is
 * deleted: whoever knew the old password (the usual reason for a reset) is
 * signed out everywhere.
 *
 * @param {{ rawToken: string; password: string }} input - Token from the URL and the new password.
 * @returns {Promise<ResetPasswordResult>} Success, or `passwordReset.errors.invalidToken` / `unknown`.
 */
export async function resetPassword(input: {
  rawToken: string;
  password: string;
}): Promise<ResetPasswordResult> {
  const now = new Date();
  try {
    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashPasswordResetToken(input.rawToken) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        supersededAt: true,
        expiresAt: true,
        user: { select: { disabledAt: true } },
      },
    });
    if (!token || token.user.disabledAt || !isPasswordResetTokenUsable(token, now)) {
      return { ok: false, error: "passwordReset.errors.invalidToken" };
    }

    const passwordHash = await hashPassword(input.password);

    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, supersededAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claim.count !== 1) {
        return false;
      }
      await tx.user.update({ where: { id: token.userId }, data: { password: passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null, supersededAt: null },
        data: { supersededAt: now },
      });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      return true;
    });

    return claimed ? { ok: true } : { ok: false, error: "passwordReset.errors.invalidToken" };
  } catch (error) {
    console.error("[PASSWORD_RESET/RESET] Failed to reset password:", error);
    return { ok: false, error: "passwordReset.errors.unknown" };
  }
}
