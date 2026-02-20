-- Add setor audit field to maintenance events
ALTER TABLE `ManutencaoEvento`
ADD COLUMN `setor` VARCHAR(191) NULL;
