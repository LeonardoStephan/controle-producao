/*
  Warnings:

  - Added the required column `opId` to the `ConsumoPeca` table without a default value. This is not possible if the table is not empty.
  - Made the column `empresa` on table `ordemproducao` required. This step will fail if there are existing NULL values in that column.
  - Made the column `opId` on table `subproduto` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_opId_fkey`;

-- AlterTable
ALTER TABLE `consumopeca` ADD COLUMN `opId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `ordemproducao` MODIFY `empresa` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `subproduto` MODIFY `opId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `ConsumoPeca_opId_idx` ON `ConsumoPeca`(`opId`);

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumoPeca` ADD CONSTRAINT `ConsumoPeca_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
