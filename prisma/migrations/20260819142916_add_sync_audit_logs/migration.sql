-- CreateTable
CREATE TABLE `calendar_event_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SESSION', 'REMINDER') NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    `trigger` ENUM('AFTER_RESPONSE', 'MANUAL_RETRY', 'CRON') NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `googleEventId` VARCHAR(191) NULL,
    `success` BOOLEAN NOT NULL,
    `error` TEXT NULL,
    `cronRunId` VARCHAR(191) NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `calendar_event_logs_userId_executedAt_idx`(`userId`, `executedAt`),
    INDEX `calendar_event_logs_executedAt_idx`(`executedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cron_runs` (
    `id` VARCHAR(191) NOT NULL,
    `job` ENUM('CALENDAR_SYNC', 'AVAILABILITY_REMINDERS') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `details` JSON NULL,
    `error` TEXT NULL,

    INDEX `cron_runs_job_startedAt_idx`(`job`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `calendar_event_logs` ADD CONSTRAINT `calendar_event_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
