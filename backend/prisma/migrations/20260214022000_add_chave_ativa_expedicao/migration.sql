-- Guarantees only one active shipping per order number (allows many finalized rows).
ALTER TABLE `Expedicao`
ADD COLUMN `chaveAtiva` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Expedicao_chaveAtiva_key` ON `Expedicao`(`chaveAtiva`);
