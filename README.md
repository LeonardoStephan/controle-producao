# Controle de Producao

Backend Node.js/Express + Prisma + MySQL para controle de producao, rastreabilidade de materiais e expedicao.

## Visao Geral

O sistema cobre tres frentes principais:

- Producao por OP (etapas, pausas/retornos, tempos e resumo)
- Rastreabilidade de materiais (subprodutos e pecas por QR Code)
- Expedicao por pedido (scan de serie, fotos 1:1, fotos gerais, finalizacao)

Trilha ponta a ponta:

`OP -> Produto Final -> Subprodutos vinculados -> Pecas consumidas (QR) -> Expedicao`

## Stack

- Node.js + Express
- Prisma ORM
- MySQL
- Integracoes Omie e ViaOnda (etiquetadora dos numeros de serie)

## Estrutura do Projeto

O codigo da API esta em:

- `backend/`

Principais pastas:

- `backend/src/routes`
- `backend/src/controllers`
- `backend/src/usecases`
- `backend/src/repositories`
- `backend/src/domain`
- `backend/src/integrations`

## Base URL

- `http://localhost:3333`

## Fluxo de OP

Etapas atuais (codigo):

- `montagem`
- `teste`
- `embalagem_estoque`
- `finalizada`

Rotas principais:

- `POST /op/iniciar`
- `POST /op/:id/iniciar/:etapa`
- `POST /op/:id/eventos`
- `POST /op/:id/finalizar/:etapa`
- `GET /op/:id/resumo`
- `GET /op/:id/rastreabilidade-materiais`

Observacoes:

- Apos finalizar uma etapa, a proxima etapa exige inicio manual.
- Exemplo: finalizar `montagem` -> chamar `POST /op/:id/iniciar/teste`.
- Consumos sao permitidos apenas com OP em `montagem` ativa.
- `retorno` respeita janela de jornada configurada no dominio.

## Produto Final

Rota:

- `POST /produto-final/criar`

Campos mais usados:

- `opId`
- `serieProdutoFinal`
- `codProdutoOmie`

Observacoes:

- Validacao de serie por ViaOnda.
- Coerencia de `codProdutoOmie` por OP.
- Retorno inclui `descricaoProduto` quando resolvida no Omie.

## Subproduto

Rotas:

- `POST /subproduto/registrar` (producao da placa/subproduto)
- `POST /subproduto/consumir` (vinculo no produto final)

Observacoes:

- Campo correto para vinculo ao PF: `serieProdFinalId`.
- Nao usar `produtoFinalId` nesse fluxo.

## Pecas (QR Code)

Rotas:

- `POST /pecas/consumir`
- `POST /pecas/substituir`
- `GET /pecas/historico`

Regras importantes:

- QR validado por codigo da peca.
- `qrId` salvo com base no ultimo trecho do QR (ex.: `ID:177038...`).
- Bloqueio de duplicidade por `qrCode` e por `qrId`.
- Se ja existir a mesma `codigoPeca` ativa no mesmo contexto (PF/subproduto), o sistema encerra todas as anteriores (`fimEm`) e registra a nova automaticamente.

## Expedicao

Rotas:

- `POST /expedicao/iniciar`
- `POST /expedicao/:id/eventos`
- `POST /expedicao/:id/scan-serie`
- `POST /expedicao/serie/:id/foto`
- `POST /expedicao/fotos-gerais/upload`
- `GET /expedicao/fotos-gerais/:expedicaoId`
- `POST /expedicao/:id/finalizar`
- `GET /expedicao/:id/resumo`

Observacoes:

- `scan-serie` usa `:id` da expedicao na URL.
- Foto 1:1 usa `:id` de `expedicaoSerieId` na URL.
- Finalizacao usa a empresa da propria expedicao como fonte principal.
- `GET /expedicao/fotos-gerais/:expedicaoId` retorna tambem `cliente` e `fotosSerie` (fotos 1:1 com descricao do produto quando disponivel).

## Ajustes Recentes

- Inicio manual da proxima etapa de OP (`POST /op/:id/iniciar/:etapa`).
- `finalizar/:etapa` nao cria mais inicio automatico da proxima etapa.
- Tempos por etapa com segundos (`5h30m10s`).
- Remocao de `finalizada` em `temposPorEtapa`.
- Padronizacao de `quantidadePlanejada` para `quantidade`.
- Datas formatadas em `dd/mm/aaaa - HH:mm:ss` nos resumos/rastreabilidade.
- Retorno de finalizacao da expedicao com status:
  - `{ "ok": true, "status": "finalizada" }`
- Persistencia de datas em UTC no banco e exibicao em horario do Brasil (`America/Sao_Paulo`) na API de resumo/rastreabilidade.

## Execucao Local

No diretorio `backend/`:

1. Instalar dependencias:
   - `npm install`
2. Configurar variaveis de ambiente:
   - `backend/.env`
3. Rodar migracoes (se necessario):
   - `npx prisma migrate deploy`
4. Subir API:
   - `npm run dev`

## Testes de Fluxo (Postman)

Para roteiro completo de testes (OP, PF, subproduto, pecas e expedicao), use o guia interno validado no time.
