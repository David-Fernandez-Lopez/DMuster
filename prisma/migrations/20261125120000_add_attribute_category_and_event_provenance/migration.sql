-- AlterTable
ALTER TABLE `system_skills` MODIFY `category` ENUM('SKILL', 'ATTRIBUTE', 'CONDITION') NOT NULL;

-- AlterTable
ALTER TABLE `dice_events` ADD COLUMN `note` VARCHAR(255) NULL,
    ADD COLUMN `originalText` VARCHAR(60) NULL;

