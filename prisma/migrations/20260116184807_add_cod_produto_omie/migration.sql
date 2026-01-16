/*
  Warnings:

  - A unique constraint covering the columns `[qrCode,fimEm]` on the table `ConsumoPeca` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `produtofinal` ADD COLUMN `codProdutoOmie` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ConsumoPeca_qrCode_fimEm_key` ON `ConsumoPeca`(`qrCode`, `fimEm`);
