-- AlterTable
ALTER TABLE `users` ADD COLUMN `calendarFeedToken` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_calendarFeedToken_key` ON `users`(`calendarFeedToken`);
