-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `confirmed_sessions` ADD COLUMN `cancelCauseUserId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `confirmed_sessions` ADD CONSTRAINT `confirmed_sessions_cancelCauseUserId_fkey` FOREIGN KEY (`cancelCauseUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
