// One-off cleanup before Google Calendar sync is removed (replaced by the
// personal ICS feed): for every connected account it deletes the events DMuster
// created in their Google calendar, then revokes the OAuth token and drops the
// stored `Account` row.
//
// It does the same steps as `DELETE /api/integrations/google` (the profile's
// "Desconectar" button), in the same order — events first, because once the
// token is revoked there is no way left to delete them — but for everyone at
// once. It has to run BEFORE the Google code is deleted, since it uses it.
//
// Runs inside the `app` container, because the database has no published port:
//
//   docker compose exec app npx tsx scripts/ops/purgeGoogleCalendar.ts          # report only
//   docker compose exec app npx tsx scripts/ops/purgeGoogleCalendar.ts --apply  # clean up
//
// Flags:
//   --apply   actually delete events and revoke tokens (without it, report only)
//
// Accounts whose token already expired (Google drops it after 7 days while the
// OAuth app is in "Testing") cannot be cleaned: their events are left behind
// and the person must delete them by hand. They are listed at the end.
import "dotenv/config";

import { SyncStatus } from "../../src/generated/prisma/enums";
import {
  DISCONNECT_PROCESS_LIMIT,
  enqueueDeletionForUser,
  processPending,
} from "../../src/lib/google/calendarSyncService";
import { revokeAccess } from "../../src/lib/google/oauth";
import {
  enqueueReminderDeletionForUser,
  processPendingReminders,
} from "../../src/lib/google/reminderSyncService";
import { prisma } from "../../src/lib/prisma";

/** What happened to one account. */
type AccountOutcome = {
  email: string;
  eventsLeftBehind: number;
  revokedAtGoogle: boolean;
};

/**
 * Counts the events of one account that are still waiting to be deleted: ledger
 * rows left PENDING or FAILED after processing. Read from the ledgers rather
 * than from the processing result, because `processPendingReminders` sweeps
 * every user's rows and its totals cannot be attributed to one account.
 *
 * @param {string} userId - The account to check.
 * @returns {Promise<number>} Session events plus reminders left behind.
 */
async function countEventsLeftBehind(userId: string): Promise<number> {
  const waiting = { status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] } };
  const [sessions, reminders] = await Promise.all([
    prisma.sessionCalendarEvent.count({ where: { userId, ...waiting } }),
    prisma.availabilityReminderEvent.count({ where: { userId, ...waiting } }),
  ]);

  return sessions + reminders;
}

/**
 * Finishes one account once every deletion has been queued and the reminders
 * processed: deletes its session events while the token still works, counts
 * what could not be removed, then revokes the token.
 *
 * @param {string} userId - The account to clean up.
 * @param {string} email - The account's email, for the report.
 * @returns {Promise<AccountOutcome>} How many events could not be removed and
 *   whether the token was revoked at Google.
 */
async function finishAccount(userId: string, email: string): Promise<AccountOutcome> {
  await processPending({ userId, limit: DISCONNECT_PROCESS_LIMIT });
  const eventsLeftBehind = await countEventsLeftBehind(userId);
  const revoked = await revokeAccess(userId);

  return { email, eventsLeftBehind, revokedAtGoogle: revoked.revokedAtGoogle };
}

/**
 * Lists the accounts connected to Google and, with `--apply`, cleans each one.
 */
async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");

  const accounts = await prisma.account.findMany({
    where: { provider: "google" },
    select: { userId: true, user: { select: { email: true } } },
    orderBy: { user: { email: "asc" } },
  });

  if (accounts.length === 0) {
    console.log("[OPS/PURGE-GOOGLE] No account is connected to Google. Nothing to do.");
    return;
  }

  console.log(`[OPS/PURGE-GOOGLE] ${accounts.length} connected account(s):\n`);
  for (const account of accounts) {
    console.log(`  ${account.user.email}`);
  }

  if (!apply) {
    console.log("\n[OPS/PURGE-GOOGLE] Dry run. Re-run with --apply to delete their events and revoke access.");
    return;
  }

  // Queue every deletion first so the reminder sweep, which is not scoped to a
  // user, runs once for everybody and while every token still works.
  for (const account of accounts) {
    await enqueueDeletionForUser(account.userId);
    await enqueueReminderDeletionForUser(account.userId);
  }
  await processPendingReminders({ limit: DISCONNECT_PROCESS_LIMIT });

  const outcomes: AccountOutcome[] = [];
  for (const account of accounts) {
    try {
      const outcome = await finishAccount(account.userId, account.user.email);
      outcomes.push(outcome);
      console.log(
        `[OPS/PURGE-GOOGLE] ${outcome.email}: ` +
          `${outcome.eventsLeftBehind} event(s) left behind, ` +
          `${outcome.revokedAtGoogle ? "token revoked" : "token NOT revoked at Google"}.`,
      );
    } catch (error) {
      // One broken account must not stop the rest.
      console.error(`[OPS/PURGE-GOOGLE] ${account.user.email}: failed.`, error);
      outcomes.push({ email: account.user.email, eventsLeftBehind: -1, revokedAtGoogle: false });
    }
  }

  const needAttention = outcomes.filter(
    (outcome) => outcome.eventsLeftBehind !== 0 || !outcome.revokedAtGoogle,
  );
  if (needAttention.length === 0) {
    console.log("\n[OPS/PURGE-GOOGLE] Done. Every account is clean.");
    return;
  }

  console.log("\n[OPS/PURGE-GOOGLE] These people must delete leftover events by hand (and, if the");
  console.log("token was not revoked, remove DMuster from their Google account's access list):");
  for (const outcome of needAttention) {
    console.log(`  ${outcome.email}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[OPS/PURGE-GOOGLE] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
