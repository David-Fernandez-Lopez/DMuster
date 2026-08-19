-- AlterTable
ALTER TABLE `users` ADD COLUMN `googleSyncBrokenAt` DATETIME(3) NULL,
    ADD COLUMN `googleSyncEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `session_calendar_events` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `googleEventId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SYNCED', 'FAILED', 'DELETED') NOT NULL DEFAULT 'PENDING',
    `operation` ENUM('UPSERT', 'DELETE') NOT NULL DEFAULT 'UPSERT',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `session_calendar_events_status_lastAttemptAt_idx`(`status`, `lastAttemptAt`),
    UNIQUE INDEX `session_calendar_events_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session_calendar_events` ADD CONSTRAINT `session_calendar_events_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `confirmed_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_calendar_events` ADD CONSTRAINT `session_calendar_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
