-- CreateTable
CREATE TABLE `campaign_arcs` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `name` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `campaign_arcs_campaignId_number_key`(`campaignId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dice_events` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('CRITICAL', 'FUMBLE') NOT NULL,
    `skill` VARCHAR(60) NOT NULL,
    `date` DATE NOT NULL,
    `time` VARCHAR(5) NULL,
    `arcId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `importKey` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dice_events_importKey_key`(`importKey`),
    INDEX `dice_events_campaignId_date_idx`(`campaignId`, `date`),
    INDEX `dice_events_userId_campaignId_idx`(`userId`, `campaignId`),
    INDEX `dice_events_arcId_idx`(`arcId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `campaign_arcs` ADD CONSTRAINT `campaign_arcs_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_arcId_fkey` FOREIGN KEY (`arcId`) REFERENCES `campaign_arcs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `confirmed_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

