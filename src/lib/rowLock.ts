import type { Prisma } from "@/generated/prisma/client";

/**
 * Rows that can be locked. Each name is a literal in the queries below rather
 * than an interpolated string, so no caller can steer the statement.
 */
type LockableRow = "campaign" | "confirmedSession";

/**
 * Takes an exclusive lock on a row for the rest of the surrounding transaction,
 * so any other transaction touching the same row waits.
 *
 * Several guards in this codebase are cross-row invariants — "a campaign keeps
 * at least one DM", "a session keeps at least one attendee, one of them a DM" —
 * and no single conditional write can express them: `deleteMany`'s `where`
 * cannot say "and the count of siblings stays above one". Counting inside a
 * transaction is not enough either, because under MySQL's default isolation
 * each transaction reads a snapshot taken before the other one committed, so
 * both see the sibling they are about to remove between them and both proceed.
 *
 * Locking the parent row first is what makes those checks mean something: the
 * second removal blocks until the first has committed, and then counts what is
 * actually there. It costs one statement, and only on a mutation.
 *
 * Prisma has no first-class `FOR UPDATE`, hence the raw query. Both use tagged
 * templates, so the id is parameterised, never interpolated.
 *
 * @param {Prisma.TransactionClient} tx - The transaction to hold the lock in.
 * @param {LockableRow} row - Which table to lock a row of.
 * @param {string} id - Primary key of the row to lock.
 */
export async function lockRow(
  tx: Prisma.TransactionClient,
  row: LockableRow,
  id: string,
): Promise<void> {
  if (row === "campaign") {
    await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${id} FOR UPDATE`;
    return;
  }

  await tx.$queryRaw`SELECT id FROM confirmed_sessions WHERE id = ${id} FOR UPDATE`;
}
