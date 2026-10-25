-- AlterTable
ALTER TABLE `campaign_players` ADD COLUMN `optional` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `minPlayers` INTEGER NULL,
    ADD COLUMN `requirementsSetAt` DATETIME(3) NULL;
