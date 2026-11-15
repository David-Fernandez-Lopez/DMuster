-- AlterTable
ALTER TABLE `password_reset_tokens` ADD COLUMN `supersededAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `password_reset_tokens_expiresAt_idx` ON `password_reset_tokens`(`expiresAt`);
