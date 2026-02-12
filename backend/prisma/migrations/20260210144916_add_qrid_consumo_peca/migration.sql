/*
  Warnings:

  - A unique constraint covering the columns `[qrId]` on the table `ConsumoPeca` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `consumopeca` ADD COLUMN `qrId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ConsumoPeca_qrId_key` ON `ConsumoPeca`(`qrId`);
