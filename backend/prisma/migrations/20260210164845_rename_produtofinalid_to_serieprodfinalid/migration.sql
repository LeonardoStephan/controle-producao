/*
  Warnings:

  - You are about to drop the column `produtoFinalId` on the `consumopeca` table. All the data in the column will be lost.
  - You are about to drop the column `criadoEm` on the `expedicaoserie` table. All the data in the column will be lost.
  - You are about to drop the column `produtoFinalId` on the `expedicaoserie` table. All the data in the column will be lost.
  - You are about to drop the column `criadoEm` on the `subproduto` table. All the data in the column will be lost.
  - You are about to drop the column `produtoFinalId` on the `subproduto` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[serieProdFinalId,codigoSubproduto]` on the table `Subproduto` will be added. If there are existing duplicate values, this will fail.
  - Made the column `codigoSubproduto` on table `subproduto` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `consumopeca` DROP FOREIGN KEY `ConsumoPeca_produtoFinalId_fkey`;

-- DropForeignKey
ALTER TABLE `expedicaoserie` DROP FOREIGN KEY `ExpedicaoSerie_produtoFinalId_fkey`;

-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_produtoFinalId_fkey`;

-- DropIndex
DROP INDEX `ExpedicaoSerie_serie_idx` ON `expedicaoserie`;

-- DropIndex
DROP INDEX `ExpedicaoSerie_serie_key` ON `expedicaoserie`;

-- DropIndex
DROP INDEX `Subproduto_produtoFinalId_codigoSubproduto_key` ON `subproduto`;

-- AlterTable
ALTER TABLE `consumopeca` DROP COLUMN `produtoFinalId`,
    ADD COLUMN `serieProdFinalId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `expedicaoserie` DROP COLUMN `criadoEm`,
    DROP COLUMN `produtoFinalId`,
    ADD COLUMN `serieProdFinalId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `subproduto` DROP COLUMN `criadoEm`,
    DROP COLUMN `produtoFinalId`,
    ADD COLUMN `serieProdFinalId` VARCHAR(191) NULL,
    MODIFY `codigoSubproduto` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `ConsumoPeca_serieProdFinalId_idx` ON `ConsumoPeca`(`serieProdFinalId`);

-- CreateIndex
CREATE INDEX `ExpedicaoSerie_serieProdFinalId_idx` ON `ExpedicaoSerie`(`serieProdFinalId`);

-- CreateIndex
CREATE UNIQUE INDEX `Subproduto_serieProdFinalId_codigoSubproduto_key` ON `Subproduto`(`serieProdFinalId`, `codigoSubproduto`);

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_serieProdFinalId_fkey` FOREIGN KEY (`serieProdFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_serieProdFinalId_fkey` FOREIGN KEY (`serieProdFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpedicaoSerie` ADD CONSTRAINT `ExpedicaoSerie_serieProdFinalId_fkey` FOREIGN KEY (`serieProdFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `expedicaoserie` RENAME INDEX `ExpedicaoSerie_expedicaoId_fkey` TO `ExpedicaoSerie_expedicaoId_idx`;
