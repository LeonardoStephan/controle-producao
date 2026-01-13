-- CreateTable
CREATE TABLE `OrdemProducao` (
    `id` VARCHAR(191) NOT NULL,
    `numeroOP` VARCHAR(191) NULL,
    `produto` VARCHAR(191) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'montagem',
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoOP` (
    `id` VARCHAR(191) NOT NULL,
    `op_id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `etapa` VARCHAR(191) NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `dados` JSON NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subproduto` (
    `id` VARCHAR(191) NOT NULL,
    `op_id` VARCHAR(191) NOT NULL,
    `etiquetaId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `funcionarioId` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Subproduto_etiquetaId_key`(`etiquetaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventoOP` ADD CONSTRAINT `EventoOP_op_id_fkey` FOREIGN KEY (`op_id`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_op_id_fkey` FOREIGN KEY (`op_id`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
