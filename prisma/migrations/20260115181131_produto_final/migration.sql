/*
  Warnings:

  - You are about to drop the column `opId` on the `subproduto` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `subproduto` table. All the data in the column will be lost.
  - Added the required column `produtoFinalId` to the `Subproduto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_opId_fkey`;

-- AlterTable
ALTER TABLE `subproduto` DROP COLUMN `opId`,
    DROP COLUMN `tipo`,
    ADD COLUMN `produtoFinalId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `ProdutoFinal` (
    `id` VARCHAR(191) NOT NULL,
    `opId` VARCHAR(191) NOT NULL,
    `serie` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProdutoFinal_serie_key`(`serie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProdutoFinal` ADD CONSTRAINT `ProdutoFinal_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_produtoFinalId_fkey` FOREIGN KEY (`produtoFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
