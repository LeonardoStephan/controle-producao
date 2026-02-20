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

## Endpoints Oficiais (Atual)

Operacionais (execucao por modulo):

- OP:
  - `POST /op/iniciar`
  - `POST /op/:id/iniciar/:etapa`
  - `POST /op/:id/eventos`
  - `POST /op/:id/finalizar/:etapa`
  - `GET /op/:empresa/:numeroOP/resumo`
  - `GET /op/:empresa/:numeroOP/rastreabilidade-materiais`
- Produto final:
  - `POST /produto-final/criar`
- Subproduto:
  - `POST /subproduto/registrar`
  - `POST /subproduto/consumir`
- Pecas:
  - `POST /pecas/consumir`
  - `POST /pecas/substituir`
- Expedicao:
  - `POST /expedicao/iniciar`
  - `POST /expedicao/:id/eventos`
  - `POST /expedicao/:id/scan-serie`
  - `POST /expedicao/serie/:id/foto`
  - `POST /expedicao/fotos-gerais/upload`
  - `GET /expedicao/fotos-gerais/:expedicaoId`
  - `POST /expedicao/:id/finalizar`
  - `GET /expedicao/:empresa/:numeroPedido/resumo`
- Manutencao:
  - `POST /manutencao/abrir`
  - `POST /manutencao/:id/avancar`
  - `POST /manutencao/:id/scan-serie`
  - `POST /manutencao/:id/pecas`
  - `POST /manutencao/:id/finalizar`
  - `GET /manutencao/:empresa/:numeroOS/resumo`
- Admin (funcionarios):
  - `GET /admin/funcionarios`
  - `POST /admin/funcionarios`
  - `PUT /admin/funcionarios/:id`
  - `PATCH /admin/funcionarios/:id/ativo`
  - `DELETE /admin/funcionarios/:id`

Rastreabilidade unificada (consulta oficial por serie):

- `GET /series/:serie/timeline`

Padrao de operador nos resumos/rastreabilidade:

- `funcionarioNome`: nome resolvido via cadastro `Funcionario` (quando existir)

Observacao:

- Endpoints legados de historico fragmentado foram removidos em favor da consulta unificada.
- Validacao de setor por funcionario agora usa cadastro em banco (`Funcionario`).
- Endpoints de resumo operacional usam chave de negocio (`empresa + numero`) e nao mais `id`.
## Perfis Web (sugestao de uso)

Financeiro:

- Foco em operacao de manutencao no setor financeiro.
- Fluxo principal:
  - `POST /manutencao/abrir`
  - `POST /manutencao/:id/avancar` (etapas do financeiro)
  - `GET /manutencao/:empresa/:numeroOS/resumo`

Admin (consulta geral):

- Foco em consulta e auditoria ponta a ponta.
- Endpoints de consulta:
  - `GET /series/:serie/timeline` (principal)
  - `GET /op/:empresa/:numeroOP/resumo`
  - `GET /op/:empresa/:numeroOP/rastreabilidade-materiais`
  - `GET /expedicao/:empresa/:numeroPedido/resumo`
  - `GET /expedicao/fotos-gerais/:expedicaoId`
  - `GET /manutencao/:empresa/:numeroOS/resumo`

## Consulta Unificada por Serie

Rota:

- `GET /series/:serie/timeline`

Exemplo:

- `GET /series/3004656/timeline`

Retorna em uma unica resposta:

- `producao` (produto final, OP, subprodutos e pecas consumidas)
- `expedicao` (pedidos/series/eventos/fotos)
- `manutencao` (OS, eventos e pecas trocadas da serie)
- `timeline` (eventos ordenados por data para consumo no web)

### Estrategia de consulta

- Operacionais (processo por modulo): usar endpoints de `resumo` por recurso (`op`, `expedicao`, `manutencao`).
- Rastreabilidade unificada (visao ponta a ponta): usar `GET /series/:serie/timeline`.
- Endpoints legados de historico fragmentado foram removidos.

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
- `GET /op/:empresa/:numeroOP/resumo`
- `GET /op/:empresa/:numeroOP/rastreabilidade-materiais`

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
- `GET /expedicao/:empresa/:numeroPedido/resumo`

Observacoes:

- `scan-serie` usa `:id` da expedicao na URL.
- Foto 1:1 usa `:id` de `expedicaoSerieId` na URL.
- Finalizacao usa a empresa da propria expedicao como fonte principal.
- `GET /expedicao/fotos-gerais/:expedicaoId` retorna tambem `cliente` e `fotosSerie` (fotos 1:1 com descricao do produto quando disponivel).

## Manutencao

Rotas:

- `POST /manutencao/abrir`
- `POST /manutencao/:id/avancar`
- `POST /manutencao/:id/scan-serie`
- `POST /manutencao/:id/pecas`
- `POST /manutencao/:id/finalizar`
- `GET /manutencao/:empresa/:numeroOS/resumo`

Fluxo de etapas:

- `recebida -> conferencia_inicial -> conferencia_manutencao -> avaliacao_garantia -> aguardando_aprovacao -> reparo -> embalagem -> finalizada`
- Caminho alternativo sem aprovacao: `aguardando_aprovacao -> devolvida` ou `aguardando_aprovacao -> descarte`.
- `emGarantia` so pode ser informado na etapa `avaliacao_garantia`.
- `scan-serie` da manutencao exige historico de expedicao da serie e ultima expedicao `finalizada`.

Permissão por setor (via cadastro de funcionário):

Cadastro oficial de funcionários:

- Recurso: `Funcionario` (tabela no banco)
- Campos: `cracha`, `nome`, `setores` e `ativo`
- Uso no backend:
  - Manutencao: valida setor por etapa
  - Producao: valida setor `producao` em inicio/eventos/finalizacao de OP
  - Expedicao: valida setor `expedicao` em iniciar/eventos/scan-serie/finalizar

Regras por endpoint:

- `abrir`: somente `financeiro`
- `scan-serie`: somente `manutencao`
- `pecas`: somente `manutencao`
- `finalizar`: somente `manutencao`
- `avancar`: valida automaticamente o setor esperado para o status de destino

### JSONs Admin (funcionarios)

Criar:

`POST /admin/funcionarios`

```json
{
  "cracha": "12345",
  "nome": "Idalha",
  "setores": ["financeiro"],
  "ativo": true
}
```

Atualizar:

`PUT /admin/funcionarios/:id`

```json
{
  "nome": "Fernando Silva",
  "setores": ["manutencao", "expedicao"]
}
```

Ativar/Desativar:

`PATCH /admin/funcionarios/:id/ativo`

```json
{
  "ativo": false
}
```

Resumo de manutencao:

- `GET /manutencao/:empresa/:numeroOS/resumo` retorna apenas `ok` e `manutencao`.
- Campos `exigeSerie` e `pendenteSerie` foram removidos do payload para simplificar o consumo no frontend.
- Eventos e pecas trocadas retornam apenas `funcionarioNome`.

Auditoria:

- Eventos de manutencao agora armazenam `setor` alem de `funcionarioId`.
- Logs operacionais por acao (bloqueio/sucesso) incluem `manutencaoId`, `funcionarioId`, `setor` e status.
- A serie principal na tabela `Manutencao` foi removida; a fonte oficial de series da manutencao e `ManutencaoSerie` (1:N).

### JSONs de teste (ordem recomendada)

Base:

- `http://localhost:3333`
- Financeiro: `Idalha`
- Manutencao: `Fernando`
- Exemplo de OS: `405`

1. Abrir manutencao (financeiro):

`POST /manutencao/abrir`

```json
{
  "numeroOS": "405",
  "empresa": "marchi",
  "funcionarioId": "Idalha",
  "defeitoRelatado": "Nao liga",
  "clienteEmail": "adm@gaolavanderia.com.br"
}
```

Observacao: `clienteEmail` e opcional. Se nao for enviado, o sistema tenta buscar no Omie.

2. Conferencia inicial (financeiro):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "conferencia_inicial",
  "funcionarioId": "Idalha",
  "observacao": null
}
```

3. Conferencia manutencao (manutencao):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "conferencia_manutencao",
  "funcionarioId": "Fernando",
  "observacao": null
}
```

4. Avaliacao garantia (manutencao):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "avaliacao_garantia",
  "funcionarioId": "Fernando",
  "diagnostico": "Falha no modulo RTC",
  "emGarantia": false,
  "observacao": null
}
```

5. Aguardando aprovacao (financeiro):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "aguardando_aprovacao",
  "funcionarioId": "Idalha",
  "observacao": null
}
```

6. Scan de series (manutencao) - repetir para cada serie:

`POST /manutencao/{{MAN_ID}}/scan-serie`

```json
{
  "serieProduto": "3004656",
  "funcionarioId": "Fernando"
}
```

7. Resumo para pegar `manutencaoSerieId` da serie alvo:

`GET /manutencao/{{EMPRESA}}/{{NUMERO_OS}}/resumo`

8A. Fluxo aprovado: ir para reparo (manutencao):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "reparo",
  "funcionarioId": "Fernando",
  "aprovadoOrcamento": true,
  "observacao": "Cliente aprovou o orcamento"
}
```

9A. Registrar peca trocada (manutencao):

`POST /manutencao/{{MAN_ID}}/pecas`

```json
{
  "manutencaoSerieId": "{{MAN_SERIE_ID}}",
  "codigoPeca": "ACPL217",
  "funcionarioId": "Fernando",
  "qrCode": "06/02/2026 09:25:30;ACPL217;fab;123;456;06/02/2026;Limeira;ID:1770380731993",
  "quantidade": 1
}
```

10A. Embalagem (manutencao):

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "embalagem",
  "funcionarioId": "Fernando",
  "observacao": null
}
```

11A. Finalizar (manutencao):

`POST /manutencao/{{MAN_ID}}/finalizar`

```json
{
  "funcionarioId": "Fernando",
  "pesoKg": "2,5",
  "altura": "0,12",
  "largura": "0,20",
  "comprimento": "0,30",
  "observacao": "Embalado e pronto para envio"
}
```

8B. Fluxo nao aprovado com devolucao:

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "devolucao",
  "funcionarioId": "Fernando",
  "emGarantia": false,
  "aprovadoOrcamento": false,
  "observacao": "Cliente nao aprovou o orcamento"
}
```

9B. Embalagem apos devolucao:

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "embalagem",
  "funcionarioId": "Fernando",
  "observacao": null
}
```

10B. Finalizar devolucao:

`POST /manutencao/{{MAN_ID}}/finalizar`

```json
{
  "funcionarioId": "Fernando",
  "observacao": "Devolvido ao cliente sem reparo"
}
```

8C. Fluxo nao aprovado com descarte:

`POST /manutencao/{{MAN_ID}}/avancar`

```json
{
  "status": "descarte",
  "funcionarioId": "Fernando",
  "emGarantia": false,
  "aprovadoOrcamento": false,
  "observacao": "Sem aprovacao do cliente; produto destinado a descarte"
}
```

9C. Finalizar descarte:

`POST /manutencao/{{MAN_ID}}/finalizar`

```json
{
  "funcionarioId": "Fernando",
  "observacao": "Processo encerrado por descarte"
}
```

Consultas finais:

- `GET /manutencao/{{EMPRESA}}/{{NUMERO_OS}}/resumo`

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
- Testes de permissao por setor no fluxo de manutencao:
  - `backend/tests/manutencao.setor.permissoes.test.js`
  - `backend/tests/manutencao.registrarPeca.validacoes.test.js`
    - cobre bloqueio quando existe manutencao com multi-produto sem `manutencaoSerieId`
    - cobre bloqueio de divergencia entre `codigoPeca` e codigo extraido do `qrCode`
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


