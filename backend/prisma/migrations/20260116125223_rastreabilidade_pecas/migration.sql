-- CreateTable
CREATE TABLE `OrdemProducao` (
    `id` VARCHAR(191) NOT NULL,
    `numeroOP` VARCHAR(191) NOT NULL,
    `descricaoProduto` VARCHAR(191) NOT NULL,
    `quantidadeProduzida` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrdemProducao_numeroOP_key`(`numeroOP`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoOP` (
    `id` VARCHAR(191) NOT NULL,
    `opId` VARCHAR(191) NOT NULL,
    `etapa` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdutoFinal` (
    `id` VARCHAR(191) NOT NULL,
    `opId` VARCHAR(191) NOT NULL,
    `serie` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProdutoFinal_serie_key`(`serie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subproduto` (
    `id` VARCHAR(191) NOT NULL,
    `produtoFinalId` VARCHAR(191) NOT NULL,
    `opNumeroSubproduto` VARCHAR(191) NOT NULL,
    `etiquetaId` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Subproduto_etiquetaId_key`(`etiquetaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Peca` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Peca_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LotePeca` (
    `id` VARCHAR(191) NOT NULL,
    `pecaId` VARCHAR(191) NOT NULL,
    `qrCode` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LotePeca_qrCode_key`(`qrCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsumoPeca` (
    `id` VARCHAR(191) NOT NULL,
    `subprodutoId` VARCHAR(191) NOT NULL,
    `lotePecaId` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `inicioEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fimEm` DATETIME(3) NULL,

    INDEX `ConsumoPeca_subprodutoId_idx`(`subprodutoId`),
    INDEX `ConsumoPeca_lotePecaId_idx`(`lotePecaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventoOP` ADD CONSTRAINT `EventoOP_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutoFinal` ADD CONSTRAINT `ProdutoFinal_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_produtoFinalId_fkey` FOREIGN KEY (`produtoFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LotePeca` ADD CONSTRAINT `LotePeca_pecaId_fkey` FOREIGN KEY (`pecaId`) REFERENCES `Peca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_subprodutoId_fkey` FOREIGN KEY (`subprodutoId`) REFERENCES `Subproduto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_lotePecaId_fkey` FOREIGN KEY (`lotePecaId`) REFERENCES `LotePeca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
