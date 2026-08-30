-- AlterTable
ALTER TABLE `availability_reminder_events` ADD COLUMN `claimedAt` DATETIME(3) NULL,
    ADD COLUMN `claimedBy` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `session_calendar_events` ADD COLUMN `claimedAt` DATETIME(3) NULL,
    ADD COLUMN `claimedBy` VARCHAR(36) NULL;

