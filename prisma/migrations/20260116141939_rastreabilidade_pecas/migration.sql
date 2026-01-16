/*
  Warnings:

  - You are about to drop the column `lotePecaId` on the `consumopeca` table. All the data in the column will be lost.
  - You are about to drop the `lotepeca` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `peca` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `codigoPeca` to the `ConsumoPeca` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qrCode` to the `ConsumoPeca` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `consumopeca` DROP FOREIGN KEY `ConsumoPeca_lotePecaId_fkey`;

-- DropForeignKey
ALTER TABLE `consumopeca` DROP FOREIGN KEY `ConsumoPeca_subprodutoId_fkey`;

-- DropForeignKey
ALTER TABLE `lotepeca` DROP FOREIGN KEY `LotePeca_pecaId_fkey`;

-- AlterTable
ALTER TABLE `consumopeca` DROP COLUMN `lotePecaId`,
    ADD COLUMN `codigoPeca` VARCHAR(191) NOT NULL,
    ADD COLUMN `produtoFinalId` VARCHAR(191) NULL,
    ADD COLUMN `qrCode` VARCHAR(191) NOT NULL,
    MODIFY `subprodutoId` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `lotepeca`;

-- DropTable
DROP TABLE `peca`;

-- CreateIndex
CREATE INDEX `ConsumoPeca_codigoPeca_idx` ON `ConsumoPeca`(`codigoPeca`);

-- CreateIndex
CREATE INDEX `ConsumoPeca_qrCode_idx` ON `ConsumoPeca`(`qrCode`);

-- CreateIndex
CREATE INDEX `ConsumoPeca_produtoFinalId_idx` ON `ConsumoPeca`(`produtoFinalId`);

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_produtoFinalId_fkey` FOREIGN KEY (`produtoFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_subprodutoId_fkey` FOREIGN KEY (`subprodutoId`) REFERENCES `Subproduto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
