CREATE TABLE `Funcionario` (
  `id` VARCHAR(191) NOT NULL,
  `cracha` VARCHAR(191) NOT NULL,
  `nome` VARCHAR(191) NOT NULL,
  `setores` VARCHAR(191) NOT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT true,
  `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Funcionario_cracha_key`(`cracha`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

