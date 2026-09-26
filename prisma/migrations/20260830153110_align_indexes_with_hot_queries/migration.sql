-- AlterTable
ALTER TABLE `sessions` ADD PRIMARY KEY (`sessionToken`);

-- DropIndex
DROP INDEX `sessions_sessionToken_key` ON `sessions`;

-- CreateIndex
CREATE INDEX `confirmed_sessions_date_idx` ON `confirmed_sessions`(`date`);

-- CreateIndex
CREATE INDEX `cron_runs_startedAt_idx` ON `cron_runs`(`startedAt`);

-- CreateIndex
CREATE INDEX `sessions_expires_idx` ON `sessions`(`expires`);

