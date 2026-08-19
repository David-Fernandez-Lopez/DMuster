-- CreateTable
CREATE TABLE `availability_reminder_events` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `googleEventId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SYNCED', 'FAILED', 'DELETED') NOT NULL DEFAULT 'PENDING',
    `operation` ENUM('UPSERT', 'DELETE') NOT NULL DEFAULT 'UPSERT',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `availability_reminder_events_status_lastAttemptAt_idx`(`status`, `lastAttemptAt`),
    UNIQUE INDEX `availability_reminder_events_userId_month_key`(`userId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `availability_reminder_events` ADD CONSTRAINT `availability_reminder_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
