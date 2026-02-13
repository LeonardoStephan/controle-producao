-- Add optimistic-lock field to shipping order
ALTER TABLE `Expedicao`
ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;
