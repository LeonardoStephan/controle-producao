/*
  Warnings:

  - Added the required column `opId` to the `Subproduto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_produtoFinalId_fkey`;

-- AlterTable
ALTER TABLE `subproduto` ADD COLUMN `opId` VARCHAR(191) NOT NULL,
    MODIFY `produtoFinalId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_produtoFinalId_fkey` FOREIGN KEY (`produtoFinalId`) REFERENCES `ProdutoFinal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
