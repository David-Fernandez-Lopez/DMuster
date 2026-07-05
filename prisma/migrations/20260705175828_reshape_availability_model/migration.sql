-- DropForeignKey
ALTER TABLE `session_dates` DROP FOREIGN KEY `session_dates_createdById_fkey`;

-- DropForeignKey
ALTER TABLE `availabilities` DROP FOREIGN KEY `availabilities_sessionDateId_fkey`;

-- DropIndex
DROP INDEX `availabilities_sessionDateId_userId_key` ON `availabilities`;

-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `tag` VARCHAR(2) NOT NULL;

-- AlterTable
ALTER TABLE `availabilities` DROP COLUMN `sessionDateId`,
    ADD COLUMN `date` DATE NOT NULL,
    MODIFY `status` ENUM('YES', 'NO') NOT NULL;

-- DropTable
DROP TABLE `session_dates`;

-- CreateTable
CREATE TABLE `holidays` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `holidays_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `availabilities_date_userId_key` ON `availabilities`(`date`, `userId`);

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
