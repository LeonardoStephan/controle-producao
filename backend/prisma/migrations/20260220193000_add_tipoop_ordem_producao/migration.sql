ALTER TABLE `OrdemProducao`
  ADD COLUMN `tipoOp` VARCHAR(191) NOT NULL DEFAULT 'produto_final';

UPDATE `OrdemProducao`
SET `tipoOp` = 'produto_final'
WHERE `tipoOp` IS NULL OR TRIM(`tipoOp`) = '';
