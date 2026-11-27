-- DESTRUCTIVE, on purpose: every existing critical/fumble entry is deleted.
-- `dice_events.skill` (free text) is replaced by `skillId`, a required reference
-- to the new closed catalogue, and a text value cannot be turned into one. The
-- log only held test entries at this point (agreed with the DM); the real
-- history is loaded afterwards with scripts/ops/importDiceEvents.ts, against the
-- catalogue. Back up first if there is anything to keep.
DELETE FROM `dice_events`;

-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `systemId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `dice_events` DROP COLUMN `skill`,
    ADD COLUMN `detail` VARCHAR(60) NULL,
    ADD COLUMN `skillId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `role_systems` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `role_systems_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_skills` (
    `id` VARCHAR(191) NOT NULL,
    `systemId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `category` ENUM('SKILL', 'CONDITION') NOT NULL,
    `nameEs` VARCHAR(80) NOT NULL,
    `nameEn` VARCHAR(80) NOT NULL,
    `allowsDetail` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `system_skills_systemId_key_key`(`systemId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `dice_events_skillId_idx` ON `dice_events`(`skillId`);

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_systemId_fkey` FOREIGN KEY (`systemId`) REFERENCES `role_systems`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_skills` ADD CONSTRAINT `system_skills_systemId_fkey` FOREIGN KEY (`systemId`) REFERENCES `role_systems`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dice_events` ADD CONSTRAINT `dice_events_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `system_skills`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

