-- CreateTable
CREATE TABLE `PedidoVenda` (
    `id` VARCHAR(191) NOT NULL,
    `numeroPV` VARCHAR(191) NOT NULL,
    `cliente` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PedidoVenda_numeroPV_key`(`numeroPV`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PedidoVendaItem` (
    `id` VARCHAR(191) NOT NULL,
    `pedidoVendaId` VARCHAR(191) NOT NULL,
    `codProdutoOmie` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `quantidade` INTEGER NOT NULL,

    INDEX `PedidoVendaItem_codProdutoOmie_idx`(`codProdutoOmie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expedicao` (
    `id` VARCHAR(191) NOT NULL,
    `numeroPedido` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `iniciadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finalizadoEm` DATETIME(3) NULL,
    `pedidoVendaId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoExpedicao` (
    `id` VARCHAR(191) NOT NULL,
    `expedicaoId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpedicaoSerie` (
    `id` VARCHAR(191) NOT NULL,
    `expedicaoId` VARCHAR(191) NOT NULL,
    `codProdutoOmie` VARCHAR(191) NOT NULL,
    `produtoFinalId` VARCHAR(191) NULL,
    `serie` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExpedicaoSerie_codProdutoOmie_idx`(`codProdutoOmie`),
    INDEX `ExpedicaoSerie_serie_idx`(`serie`),
    UNIQUE INDEX `ExpedicaoSerie_serie_key`(`serie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FotoExpedicao` (
    `id` VARCHAR(191) NOT NULL,
    `expedicaoSerieId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FotoExpedicao_expedicaoSerieId_idx`(`expedicaoSerieId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FotoExpedicaoGeral` (
    `id` VARCHAR(191) NOT NULL,
    `expedicaoId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FotoExpedicaoGeral_expedicaoId_idx`(`expedicaoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PedidoVendaItem` ADD CONSTRAINT `PedidoVendaItem_pedidoVendaId_fkey` FOREIGN KEY (`pedidoVendaId`) REFERENCES `PedidoVenda`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expedicao` ADD CONSTRAINT `Expedicao_pedidoVendaId_fkey` FOREIGN KEY (`pedidoVendaId`) REFERENCES `PedidoVenda`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoExpedicao` ADD CONSTRAINT `EventoExpedicao_expedicaoId_fkey` FOREIGN KEY (`expedicaoId`) REFERENCES `Expedicao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpedicaoSerie` ADD CONSTRAINT `ExpedicaoSerie_expedicaoId_fkey` FOREIGN KEY (`expedicaoId`) REFERENCES `Expedicao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpedicaoSerie` ADD CONSTRAINT `ExpedicaoSerie_produtoFinalId_fkey` FOREIGN KEY (`produtoFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FotoExpedicao` ADD CONSTRAINT `FotoExpedicao_expedicaoSerieId_fkey` FOREIGN KEY (`expedicaoSerieId`) REFERENCES `ExpedicaoSerie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FotoExpedicaoGeral` ADD CONSTRAINT `FotoExpedicaoGeral_expedicaoId_fkey` FOREIGN KEY (`expedicaoId`) REFERENCES `Expedicao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
