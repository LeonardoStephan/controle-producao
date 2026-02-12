-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_opId_fkey`;

-- AlterTable
ALTER TABLE `ordemproducao` ADD COLUMN `nCodOP` BIGINT NULL;

-- AlterTable
ALTER TABLE `subproduto` MODIFY `opId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
