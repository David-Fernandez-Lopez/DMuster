-- Google Calendar sync is replaced by the personal ICS feed. Drops its ledgers,
-- audit logs and cron history, the two per-user sync columns, and any OAuth
-- token still stored for Google. The `accounts` table itself stays: the Auth.js
-- adapter expects it.

-- Purge stored Google OAuth tokens (access and refresh tokens).
DELETE FROM `accounts` WHERE `provider` = 'google';

-- DropForeignKey
ALTER TABLE `session_calendar_events` DROP FOREIGN KEY `session_calendar_events_sessionId_fkey`;

-- DropForeignKey
ALTER TABLE `session_calendar_events` DROP FOREIGN KEY `session_calendar_events_userId_fkey`;

-- DropForeignKey
ALTER TABLE `availability_reminder_events` DROP FOREIGN KEY `availability_reminder_events_userId_fkey`;

-- DropForeignKey
ALTER TABLE `calendar_event_logs` DROP FOREIGN KEY `calendar_event_logs_userId_fkey`;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `googleSyncBrokenAt`,
    DROP COLUMN `googleSyncEnabled`;

-- DropTable
DROP TABLE `session_calendar_events`;

-- DropTable
DROP TABLE `availability_reminder_events`;

-- DropTable
DROP TABLE `calendar_event_logs`;

-- DropTable
DROP TABLE `cron_runs`;
