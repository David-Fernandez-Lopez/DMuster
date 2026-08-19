// Append-only log of scheduled sweep executions (`CronRun`, roadmap #23.3).
// A run is opened as RUNNING when the cron route starts and closed as
// SUCCESS/FAILED when it ends, so a process that dies mid-run is visible as a
// stale RUNNING row instead of leaving no trace at all. Logging failures here
// must never break the sweep itself, so every export swallows its own errors.

import type { CronJob, CronRunStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** How long a finished `CronRun` row is kept before `pruneCronRuns` deletes it. */
const CRON_RUN_RETENTION_DAYS = 90;

export type CronRunOutcome = {
  status: CronRunStatus;
  processed: number;
  failed: number;
  details?: Record<string, number>;
  error?: string;
};

/**
 * Opens a `CronRun` row in RUNNING state for a job that is about to execute.
 *
 * @param {CronJob} job - Which scheduled sweep is starting.
 * @returns {Promise<string | null>} The new row's id, or null if the insert
 *   itself failed — callers proceed with `cronRunId: null` rather than abort
 *   the sweep over a logging problem.
 */
export async function startCronRun(job: CronJob): Promise<string | null> {
  try {
    const run = await prisma.cronRun.create({ data: { job }, select: { id: true } });
    return run.id;
  } catch (error) {
    console.error("[CRON-LOG/START] Failed to open a cron run row:", error);
    return null;
  }
}

/**
 * Closes a `CronRun` row with its outcome, stamping `finishedAt` and the
 * elapsed `durationMs` against the row's own `startedAt`.
 *
 * @param {string | null} id - The row id from `startCronRun`; a no-op when null.
 * @param {CronRunOutcome} outcome - The result to record.
 * @returns {Promise<void>}
 */
export async function finishCronRun(id: string | null, outcome: CronRunOutcome): Promise<void> {
  if (!id) {
    return;
  }
  try {
    const run = await prisma.cronRun.findUnique({ where: { id }, select: { startedAt: true } });
    const finishedAt = new Date();
    const durationMs = run ? finishedAt.getTime() - run.startedAt.getTime() : null;

    await prisma.cronRun.update({
      where: { id },
      data: {
        status: outcome.status,
        processed: outcome.processed,
        failed: outcome.failed,
        details: outcome.details ?? undefined,
        error: outcome.error ?? null,
        finishedAt,
        durationMs,
      },
    });
  } catch (error) {
    console.error("[CRON-LOG/FINISH] Failed to close cron run row:", id, error);
  }
}

/**
 * Deletes `CronRun` rows older than the retention window. Called at the end
 * of every sweep so the frequent `calendar-sync` job (every 15 minutes) does
 * not grow the table without bound; `calendar_event_logs` stays unpruned
 * since it only gains a row per real Google API call, not per sweep tick.
 *
 * @returns {Promise<void>}
 */
export async function pruneCronRuns(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  } catch (error) {
    console.error("[CRON-LOG/PRUNE] Failed to prune old cron run rows:", error);
  }
}
