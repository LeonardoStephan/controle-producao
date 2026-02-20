ALTER TABLE `ManutencaoPecaTrocada`
ADD COLUMN `fimEm` DATETIME(3) NULL;

CREATE INDEX `ManutencaoPecaTrocada_manutencaoId_codigoPeca_fimEm_idx`
ON `ManutencaoPecaTrocada`(`manutencaoId`, `codigoPeca`, `fimEm`);

