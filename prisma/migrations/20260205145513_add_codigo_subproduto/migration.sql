-- AlterTable
ALTER TABLE `ordemproducao` ADD COLUMN `empresa` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `subproduto` ADD COLUMN `codigoSubproduto` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Subproduto_codigoSubproduto_idx` ON `Subproduto`(`codigoSubproduto`);

-- RenameIndex
ALTER TABLE `subproduto` RENAME INDEX `Subproduto_opId_fkey` TO `Subproduto_opId_idx`;
