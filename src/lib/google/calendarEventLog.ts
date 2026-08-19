// Append-only audit trail of every REAL call to the Google Calendar API
// (`CalendarEventLog`, roadmap #23.3). Written by `calendarSyncService.ts`
// (session events) and `reminderSyncService.ts` (reminder events) right after
// each insert/patch/delete, whatever the outcome. Logging a write must never
// break the sync itself, so this never throws to its caller.

import type {
  CalendarEventAction,
  CalendarEventKind,
  SyncTrigger,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type CalendarEventLogEntry = {
  userId: string;
  kind: CalendarEventKind;
  action: CalendarEventAction;
  trigger: SyncTrigger;
  subjectId?: string | null;
  googleEventId?: string | null;
  success: boolean;
  error?: string | null;
  cronRunId?: string | null;
};

/**
 * Records one Google Calendar API call's outcome. Meant to be called
 * immediately after `insertEvent`/`patchEvent`/`deleteEvent`, whether it
 * succeeded or failed — the log's whole purpose is to answer "what got
 * written to Google and when", so a failed call is logged too.
 *
 * @param {CalendarEventLogEntry} entry - The write being recorded.
 * @returns {Promise<void>}
 */
export async function logCalendarEvent(entry: CalendarEventLogEntry): Promise<void> {
  try {
    await prisma.calendarEventLog.create({
      data: {
        userId: entry.userId,
        kind: entry.kind,
        action: entry.action,
        trigger: entry.trigger,
        subjectId: entry.subjectId ?? null,
        googleEventId: entry.googleEventId ?? null,
        success: entry.success,
        error: entry.error ?? null,
        cronRunId: entry.cronRunId ?? null,
      },
    });
  } catch (error) {
    console.error("[SYNC-LOG/WRITE] Failed to record a calendar event log entry:", error);
  }
}
