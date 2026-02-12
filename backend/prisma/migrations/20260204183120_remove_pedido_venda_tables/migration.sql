/*
  Warnings:

  - You are about to drop the column `pedidoVendaId` on the `expedicao` table. All the data in the column will be lost.
  - You are about to drop the `pedidovenda` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pedidovendaitem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `expedicao` DROP FOREIGN KEY `Expedicao_pedidoVendaId_fkey`;

-- DropForeignKey
ALTER TABLE `pedidovendaitem` DROP FOREIGN KEY `PedidoVendaItem_pedidoVendaId_fkey`;

-- AlterTable
ALTER TABLE `expedicao` DROP COLUMN `pedidoVendaId`;

-- DropTable
DROP TABLE `pedidovenda`;

-- DropTable
DROP TABLE `pedidovendaitem`;
