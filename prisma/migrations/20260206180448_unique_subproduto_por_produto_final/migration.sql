/*
  Warnings:

  - A unique constraint covering the columns `[produtoFinalId,codigoSubproduto]` on the table `Subproduto` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Subproduto_produtoFinalId_codigoSubproduto_key` ON `Subproduto`(`produtoFinalId`, `codigoSubproduto`);
