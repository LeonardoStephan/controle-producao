/*
  Warnings:

  - You are about to drop the column `op_id` on the `eventoop` table. All the data in the column will be lost.
  - You are about to drop the column `op_id` on the `subproduto` table. All the data in the column will be lost.
  - Added the required column `opId` to the `EventoOP` table without a default value. This is not possible if the table is not empty.
  - Added the required column `opId` to the `Subproduto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `eventoop` DROP FOREIGN KEY `EventoOP_op_id_fkey`;

-- DropForeignKey
ALTER TABLE `subproduto` DROP FOREIGN KEY `Subproduto_op_id_fkey`;

-- DropIndex
DROP INDEX `EventoOP_op_id_fkey` ON `eventoop`;

-- DropIndex
DROP INDEX `Subproduto_op_id_fkey` ON `subproduto`;

-- AlterTable
ALTER TABLE `eventoop` DROP COLUMN `op_id`,
    ADD COLUMN `opId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `subproduto` DROP COLUMN `op_id`,
    ADD COLUMN `opId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `EventoOP` ADD CONSTRAINT `EventoOP_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subproduto` ADD CONSTRAINT `Subproduto_opId_fkey` FOREIGN KEY (`opId`) REFERENCES `OrdemProducao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
