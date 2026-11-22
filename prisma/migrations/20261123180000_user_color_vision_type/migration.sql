-- AlterTable: the boolean "colour-blind mode" becomes a vision type (NULL = off).
ALTER TABLE `users` ADD COLUMN `colorVision` ENUM('protan', 'deutan', 'tritan', 'all') NULL;

-- Whoever had the single safe palette keeps exactly that one ("all").
UPDATE `users` SET `colorVision` = 'all' WHERE `colorBlindMode` = true;

ALTER TABLE `users` DROP COLUMN `colorBlindMode`;
