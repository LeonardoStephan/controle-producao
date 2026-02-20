-- AlterTable
ALTER TABLE `manutencao` MODIFY `defeitoRelatado` VARCHAR(191) NULL,
    MODIFY `diagnostico` VARCHAR(191) NULL,
    MODIFY `observacao` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `manutencaoevento` MODIFY `observacao` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `manutencaopecatrocada` MODIFY `qrCode` VARCHAR(191) NULL;
