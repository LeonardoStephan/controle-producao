/*
  Warnings:

  - You are about to drop the column `dados` on the `eventoop` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `eventoop` table. All the data in the column will be lost.
  - You are about to drop the column `quantidadePlanejada` on the `ordemproducao` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `eventoop` DROP COLUMN `dados`,
    DROP COLUMN `timestamp`,
    ADD COLUMN `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `ordemproducao` DROP COLUMN `quantidadePlanejada`,
    ALTER COLUMN `status` DROP DEFAULT,
    ALTER COLUMN `quantidadeProduzida` DROP DEFAULT;
