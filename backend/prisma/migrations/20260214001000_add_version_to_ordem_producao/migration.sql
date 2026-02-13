-- Add optimistic-lock field to production order
ALTER TABLE `OrdemProducao`
ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;
