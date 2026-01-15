/*
  Warnings:

  - Added the required column `opNumeroSubproduto` to the `Subproduto` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `subproduto` ADD COLUMN `opNumeroSubproduto` VARCHAR(191) NOT NULL;
