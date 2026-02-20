-- Remove legacy single-series field from maintenance header.
-- Source of truth is now ManutencaoSerie (1:N).

DROP INDEX `Manutencao_serieProduto_idx` ON `Manutencao`;

ALTER TABLE `Manutencao`
DROP COLUMN `serieProduto`;
