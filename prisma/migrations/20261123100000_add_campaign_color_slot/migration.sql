-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `colorSlot` INTEGER NOT NULL DEFAULT 0;

-- Give the existing campaigns distinct colours, in creation order.
UPDATE `campaigns` c
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (ORDER BY `createdAt`, `id`) - 1 AS `slot`
  FROM `campaigns`
) r ON r.`id` = c.`id`
SET c.`colorSlot` = r.`slot`;
