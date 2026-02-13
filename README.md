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

- Lock otimista em OP com campo `version` e controle de concorrencia em:
  - `POST /op/:id/iniciar/:etapa`
  - `POST /op/:id/eventos`
  - `POST /op/:id/finalizar/:etapa`
- Em conflito de concorrencia nesses endpoints, retorno padrao: `409`.
- Inicio manual da proxima etapa de OP (`POST /op/:id/iniciar/:etapa`).
- `finalizar/:etapa` nao cria mais inicio automatico da proxima etapa.
- Tempos por etapa com segundos (`5h30m10s`).
- Remocao de `finalizada` em `temposPorEtapa`.
- Padronizacao de `quantidadePlanejada` para `quantidade`.
- Datas formatadas em `dd/mm/aaaa - HH:mm:ss` nos resumos/rastreabilidade.
- Retorno de finalizacao da expedicao com status:
  - `{ "ok": true, "status": "finalizada" }`
- Persistencia de datas em UTC no banco e exibicao em horario do Brasil (`America/Sao_Paulo`) na API de resumo/rastreabilidade.

## Concorrencia Multiusuario (Ja Implementado)

Esta secao resume o que o sistema ja faz para suportar uso simultaneo (3+ usuarios) com consistencia de dados.

### Objetivo Atendido

- Evitar duas transicoes concorrentes na mesma OP.
- Evitar duplicidade de consumo no mesmo contexto.
- Evitar scan de serie duplicado na expedicao.
- Reduzir corridas entre leitura de estado e gravacao.

### Estrategia Implementada

1. Regras de unicidade no banco para pontos criticos.
2. Operacoes criticas em transacao.
3. Lock otimista por `version` em OP e expedicao.
4. Padronizacao de conflito com `409` e payload consistente.
5. Testes automatizados de concorrencia e smoke de carga.

### Escopo Implementado

Schema/migracoes:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*/migration.sql`

Usecases principais com hardening de concorrencia:

- `backend/src/usecases/op/iniciarEtapa.usecase.js`
- `backend/src/usecases/op/adicionarEvento.usecase.js`
- `backend/src/usecases/op/finalizarEtapa.usecase.js`
- `backend/src/usecases/op/iniciarOp.usecase.js`
- `backend/src/usecases/subproduto/registrarSubproduto.usecase.js`
- `backend/src/usecases/subproduto/consumirSubproduto.usecase.js`
- `backend/src/usecases/produtoFinal/criarProdutoFinal.usecase.js`
- `backend/src/usecases/peca/consumirPeca.usecase.js`
- `backend/src/usecases/expedicao/iniciarExpedicao.usecase.js`
- `backend/src/usecases/expedicao/adicionarEventoExpedicao.usecase.js`
- `backend/src/usecases/expedicao/scanSerie.usecase.js`
- `backend/src/usecases/expedicao/finalizarExpedicao.usecase.js`

Utilitarios/regras:

- `backend/src/utils/httpErrors.js`

### Comportamento Atual de Conflito

- Endpoints criticos retornam `409 Conflict` em disputa concorrente.
- Payload padrao de conflito:
  - `erro`
  - `code: "CONCURRENCY_CONFLICT"`
  - `detalhe`

### Status Funcional Consolidado

- [x] Lock otimista por `version` em OP.
- [x] Lock otimista por `version` em expedicao.
- [x] Fluxos criticos com transacao.
- [x] Tratamento de `P2002` nos pontos sensiveis (idempotencia/conflito amigavel).
- [x] Consumo de peca sem duas ativas do mesmo codigo/contexto.
- [x] Scan de serie blindado para corrida simultanea.
- [x] Inicio/finalizacao/eventos protegidos contra corrida.

### Testes Implementados

- Testes automatizados de concorrencia (Jest) para OP, subproduto e expedicao.
- Script de carga basica (smoke) com `autocannon`.

### Criterios Atendidos

- Nao ha dupla transicao valida conhecida da mesma OP por corrida.
- Nao ha duas pecas ativas do mesmo codigo/contexto apos concorrencia.
- Nao ha scan duplicado aceito da mesma serie em corrida.
- Endpoints criticos respondem `409` de forma consistente.

## Views SQL (Historico)

As views abaixo foram criadas para consultas futuras no MySQL (horarios e ordenacao de listagens):

### Views de horario UTC x BR

- `vw_eventoop_horarios`
- `vw_consumopeca_horarios`
- `vw_expedicao_horarios`
- `vw_eventoexpedicao_horarios`
- `vw_fotoexpedicao_horarios`
- `vw_fotoexpedicaogeral_horarios`

Consultas prontas:

- `SELECT * FROM vw_eventoop_horarios ORDER BY criadoEm_utc DESC LIMIT 50;`
- `SELECT * FROM vw_consumopeca_horarios ORDER BY inicioEm_utc DESC LIMIT 50;`
- `SELECT * FROM vw_expedicao_horarios ORDER BY iniciadoEm_utc DESC LIMIT 50;`
- `SELECT * FROM vw_eventoexpedicao_horarios ORDER BY criadoEm_utc DESC LIMIT 50;`
- `SELECT * FROM vw_fotoexpedicao_horarios ORDER BY criadoEm_utc DESC LIMIT 50;`
- `SELECT * FROM vw_fotoexpedicaogeral_horarios ORDER BY criadoEm_utc DESC LIMIT 50;`

### Views de ordenacao

- `vw_subproduto_ordenado`
- `vw_produtofinal_ordenado`
- `vw_expedicao_ordenada`

Consultas prontas:

- `SELECT * FROM vw_subproduto_ordenado;`
- `SELECT * FROM vw_produtofinal_ordenado;`
- `SELECT * FROM vw_expedicao_ordenada;`

## Execucao Local

No diretorio `backend/`:

1. Instalar dependencias:
   - `npm install`
2. Configurar variaveis de ambiente:
   - `backend/.env`
3. Rodar migracoes (se necessario):
   - `npx prisma migrate deploy`
   - se estiver em dev: `npx prisma migrate dev`
4. Subir API:
   - `npm run dev`
5. Rodar testes automatizados:
   - `npm test`
6. Rodar carga basica (smoke):
   - `npm run test:load`

## Testes de Fluxo (Postman)

Para roteiro completo de testes (OP, PF, subproduto, pecas e expedicao), use o guia interno validado no time.
