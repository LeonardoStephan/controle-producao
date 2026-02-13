-- Maintenance domain
CREATE TABLE `Manutencao` (
  `id` VARCHAR(191) NOT NULL,
  `numeroOS` VARCHAR(191) NULL,
  `empresa` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `funcionarioAberturaId` VARCHAR(191) NOT NULL,
  `funcionarioAtualId` VARCHAR(191) NULL,
  `serieProduto` VARCHAR(191) NOT NULL,
  `codProdutoOmie` VARCHAR(191) NULL,
  `clienteNome` VARCHAR(191) NULL,
  `defeitoRelatado` TEXT NULL,
  `diagnostico` TEXT NULL,
  `emGarantia` BOOLEAN NULL,
  `aprovadoOrcamento` BOOLEAN NULL,
  `dataChegadaTransportadora` DATETIME(3) NULL,
  `dataEntrada` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dataAprovacao` DATETIME(3) NULL,
  `dataFinalizacao` DATETIME(3) NULL,
  `pesoKg` DOUBLE NULL,
  `volumeM3` DOUBLE NULL,
  `observacao` TEXT NULL,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` DATETIME(3) NOT NULL,
  `serieProdFinalId` VARCHAR(191) NULL,
  UNIQUE INDEX `Manutencao_numeroOS_key`(`numeroOS`),
  INDEX `Manutencao_serieProduto_idx`(`serieProduto`),
  INDEX `Manutencao_status_idx`(`status`),
  INDEX `Manutencao_dataEntrada_idx`(`dataEntrada`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ManutencaoEvento` (
  `id` VARCHAR(191) NOT NULL,
  `manutencaoId` VARCHAR(191) NOT NULL,
  `tipo` VARCHAR(191) NOT NULL,
  `funcionarioId` VARCHAR(191) NOT NULL,
  `observacao` TEXT NULL,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ManutencaoEvento_manutencaoId_criadoEm_idx`(`manutencaoId`, `criadoEm`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ManutencaoPecaTrocada` (
  `id` VARCHAR(191) NOT NULL,
  `manutencaoId` VARCHAR(191) NOT NULL,
  `codigoPeca` VARCHAR(191) NOT NULL,
  `qrCode` TEXT NULL,
  `qrId` VARCHAR(191) NULL,
  `quantidade` INTEGER NOT NULL DEFAULT 1,
  `funcionarioId` VARCHAR(191) NOT NULL,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ManutencaoPecaTrocada_manutencaoId_criadoEm_idx`(`manutencaoId`, `criadoEm`),
  INDEX `ManutencaoPecaTrocada_codigoPeca_idx`(`codigoPeca`),
  INDEX `ManutencaoPecaTrocada_qrId_idx`(`qrId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Manutencao`
ADD CONSTRAINT `Manutencao_serieProdFinalId_fkey`
FOREIGN KEY (`serieProdFinalId`) REFERENCES `ProdutoFinal`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ManutencaoEvento`
ADD CONSTRAINT `ManutencaoEvento_manutencaoId_fkey`
FOREIGN KEY (`manutencaoId`) REFERENCES `Manutencao`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ManutencaoPecaTrocada`
ADD CONSTRAINT `ManutencaoPecaTrocada_manutencaoId_fkey`
FOREIGN KEY (`manutencaoId`) REFERENCES `Manutencao`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
