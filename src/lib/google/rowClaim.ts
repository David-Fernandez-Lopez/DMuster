import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * How long a claim stands before another sweep may take the row.
 *
 * A sweep that crashes, is killed, or has its container replaced mid-flight
 * leaves its claim behind with nobody to release it. Without an expiry that row
 * would never be processed again. Ten minutes is far longer than any sweep
 * takes and far shorter than the fifteen-minute cron interval, so a stale claim
 * is always collectable by the following tick.
 */
const CLAIM_STALE_AFTER_MS = 10 * 60 * 1000;

/** The two queues that hand rows to Google, and can therefore overlap. */
type ClaimableQueue = "sessionCalendarEvent" | "availabilityReminderEvent";

/**
 * Identifies one execution of a sweep, so a claim can be told apart from
 * another sweep's and only ever released by whoever took it.
 *
 * @returns {string} A fresh sweep identifier.
 */
export function newSweepId(): string {
  return randomUUID();
}

/**
 * The `where` fragment matching rows nobody is currently working on — either
 * never claimed, or claimed so long ago the claimant is presumed gone.
 *
 * Belongs in the candidate query as well as in the claim itself: without it a
 * second sweep keeps selecting rows it will then fail to claim, doing the work
 * of loading them for nothing.
 *
 * @returns {object} A Prisma `where` fragment.
 */
export function unclaimedFilter(): {
  OR: [{ claimedAt: null }, { claimedAt: { lt: Date } }];
} {
  return {
    OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - CLAIM_STALE_AFTER_MS) } }],
  };
}

/**
 * Tries to reserve one row for this sweep.
 *
 * The reservation is the write itself — a conditional `updateMany` that only
 * matches while the row is free — so of two sweeps reaching the same row, the
 * database decides which one gets it and the other is told to move on. Reading
 * "is it free?" and then claiming would leave exactly the gap this closes:
 * both sweeps would call Google for the same row, each create its own event,
 * and the second would write its id over the first, leaving one event in the
 * person's calendar that nothing can ever update or delete again.
 *
 * @param {ClaimableQueue} queue - Which queue the row belongs to.
 * @param {string} rowId - The row to claim.
 * @param {string} sweepId - This sweep's identifier.
 * @returns {Promise<boolean>} True when the row is now this sweep's to process.
 */
export async function claimRow(
  queue: ClaimableQueue,
  rowId: string,
  sweepId: string,
): Promise<boolean> {
  const where = { id: rowId, ...unclaimedFilter() };
  const data = { claimedAt: new Date(), claimedBy: sweepId };

  const claimed =
    queue === "sessionCalendarEvent"
      ? await prisma.sessionCalendarEvent.updateMany({ where, data })
      : await prisma.availabilityReminderEvent.updateMany({ where, data });

  return claimed.count === 1;
}

/**
 * Releases a row this sweep claimed, so the next sweep can pick it up without
 * waiting for the claim to go stale.
 *
 * Conditional on `claimedBy` so a sweep that overran its own claim — and whose
 * row another sweep has since taken — cannot release someone else's work.
 *
 * @param {ClaimableQueue} queue - Which queue the row belongs to.
 * @param {string} rowId - The row to release.
 * @param {string} sweepId - This sweep's identifier.
 * @returns {Promise<void>}
 */
export async function releaseRow(
  queue: ClaimableQueue,
  rowId: string,
  sweepId: string,
): Promise<void> {
  const where = { id: rowId, claimedBy: sweepId };
  const data = { claimedAt: null, claimedBy: null };

  if (queue === "sessionCalendarEvent") {
    await prisma.sessionCalendarEvent.updateMany({ where, data });
    return;
  }
  await prisma.availabilityReminderEvent.updateMany({ where, data });
}
