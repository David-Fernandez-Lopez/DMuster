-- AlterTable
ALTER TABLE `availabilities` MODIFY `status` ENUM('YES', 'NO', 'MAYBE', 'ONLINE') NOT NULL;
