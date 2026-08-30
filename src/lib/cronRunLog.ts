// Append-only log of scheduled sweep executions (`CronRun`, roadmap #23.3).
// A run is opened as RUNNING when the cron route starts and closed as
// SUCCESS/FAILED when it ends, so a process that dies mid-run is visible as a
// stale RUNNING row instead of leaving no trace at all. Logging failures here
// must never break the sweep itself, so every export swallows its own errors.

import { CronRunStatus as CronRunStatusEnum } from "@/generated/prisma/enums";
import type { CronJob, CronRunStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** How long a finished `CronRun` row is kept before `pruneCronRuns` deletes it. */
const CRON_RUN_RETENTION_DAYS = 90;

/**
 * How long a RUNNING row keeps another run of the same job out.
 *
 * A process killed mid-sweep leaves its row RUNNING with nobody to close it, so
 * the block has to expire or the job would never run again. Well above any real
 * sweep and below the fifteen-minute schedule, so a stranded row costs at most
 * one skipped tick.
 */
const CRON_RUN_STALE_AFTER_MS = 10 * 60 * 1000;

/** Outcome of trying to open a run: either it is ours, or one is already going. */
export type CronRunStart =
  | { started: true; runId: string | null }
  | { started: false; runningSince: Date };

export type CronRunOutcome = {
  status: CronRunStatus;
  processed: number;
  failed: number;
  details?: Record<string, number>;
  error?: string;
};

/**
 * Opens a `CronRun` row in RUNNING state for a job about to execute, unless one
 * is already running.
 *
 * A sweep that takes longer than the schedule between ticks would otherwise be
 * joined by the next one — and a sweep that hangs would collect a new companion
 * every fifteen minutes, each of them working the same backlog against the same
 * Google quota.
 *
 * The check is advisory, not a mutex: two ticks arriving in the same instant
 * could both see no RUNNING row. What actually guarantees a row is handled once
 * is the per-row reservation in `google/rowClaim.ts`, which is a conditional
 * write and therefore decided by the database. This narrows the window and
 * keeps the log readable; it does not carry the correctness.
 *
 * @param {CronJob} job - Which scheduled sweep is starting.
 * @returns {Promise<CronRunStart>} The opened run, or when one is already in
 *   flight, since when. A failed insert still starts the sweep with a null id
 *   rather than abort it over a logging problem.
 */
export async function startCronRun(job: CronJob): Promise<CronRunStart> {
  try {
    const inFlight = await prisma.cronRun.findFirst({
      where: {
        job,
        status: CronRunStatusEnum.RUNNING,
        startedAt: { gt: new Date(Date.now() - CRON_RUN_STALE_AFTER_MS) },
      },
      select: { startedAt: true },
      orderBy: { startedAt: "desc" },
    });

    if (inFlight) {
      return { started: false, runningSince: inFlight.startedAt };
    }

    const run = await prisma.cronRun.create({ data: { job }, select: { id: true } });
    return { started: true, runId: run.id };
  } catch (error) {
    console.error("[CRON-LOG/START] Failed to open a cron run row:", error);
    return { started: true, runId: null };
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
