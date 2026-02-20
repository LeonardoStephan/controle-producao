-- CreateTable
CREATE TABLE `ManutencaoSerie` (
  `id` VARCHAR(191) NOT NULL,
  `manutencaoId` VARCHAR(191) NOT NULL,
  `serie` VARCHAR(191) NOT NULL,
  `codProdutoOmie` VARCHAR(191) NULL,
  `descricaoProduto` VARCHAR(191) NULL,
  `serieProdFinalId` VARCHAR(191) NULL,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ManutencaoSerie_manutencaoId_serie_key`(`manutencaoId`, `serie`),
  INDEX `ManutencaoSerie_serie_idx`(`serie`),
  INDEX `ManutencaoSerie_manutencaoId_criadoEm_idx`(`manutencaoId`, `criadoEm`),
  INDEX `ManutencaoSerie_serieProdFinalId_idx`(`serieProdFinalId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `ManutencaoPecaTrocada`
  ADD COLUMN `manutencaoSerieId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ManutencaoPecaTrocada_manutencaoSerieId_idx`
  ON `ManutencaoPecaTrocada`(`manutencaoSerieId`);

-- AddForeignKey
ALTER TABLE `ManutencaoSerie`
  ADD CONSTRAINT `ManutencaoSerie_manutencaoId_fkey`
  FOREIGN KEY (`manutencaoId`) REFERENCES `Manutencao`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManutencaoSerie`
  ADD CONSTRAINT `ManutencaoSerie_serieProdFinalId_fkey`
  FOREIGN KEY (`serieProdFinalId`) REFERENCES `ProdutoFinal`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManutencaoPecaTrocada`
  ADD CONSTRAINT `ManutencaoPecaTrocada_manutencaoSerieId_fkey`
  FOREIGN KEY (`manutencaoSerieId`) REFERENCES `ManutencaoSerie`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

