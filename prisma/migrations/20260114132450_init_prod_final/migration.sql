/*
  Warnings:

  - You are about to drop the column `produto` on the `ordemproducao` table. All the data in the column will be lost.
  - You are about to drop the column `quantidade` on the `ordemproducao` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[numeroOP]` on the table `OrdemProducao` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `descricaoProduto` to the `OrdemProducao` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantidadePlanejada` to the `OrdemProducao` table without a default value. This is not possible if the table is not empty.
  - Made the column `numeroOP` on table `ordemproducao` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `ordemproducao` DROP COLUMN `produto`,
    DROP COLUMN `quantidade`,
    ADD COLUMN `descricaoProduto` VARCHAR(191) NOT NULL,
    ADD COLUMN `quantidadePlanejada` INTEGER NOT NULL,
    ADD COLUMN `quantidadeProduzida` INTEGER NOT NULL DEFAULT 0,
    MODIFY `numeroOP` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `OrdemProducao_numeroOP_key` ON `OrdemProducao`(`numeroOP`);
