# ROADMAP

Plano de evolucao do projeto com foco em estabilidade operacional, rastreabilidade ponta a ponta e escala.

## Objetivos

- Melhorar desempenho e previsibilidade das integracoes (Omie/ViaOnda)
- Consolidar historico por serie (producao, manutencao e expedicao)
- Estruturar dominio fiscal (NF-e) com rastreio de eventos
- Evoluir experiencia operacional para ambiente movel
- Garantir precisao de tempo por etapa com inicio operacional manual

## Trilhas de Evolucao

### 1) Manutencao (novo dominio)

Escopo inicial (MVP):

- Abertura de manutencao vinculada a serie (`ProdutoFinal`)
- Andamento por etapas internas
- Finalizacao de manutencao
- Registro de pecas trocadas na manutencao
- Historico de retornos por produto/serie
- Controle de permissao por setor (financeiro/manutencao) por etapa do fluxo
- Auditoria de setor nos eventos de manutencao

Entidades sugeridas:

- `Manutencao`
- `ManutencaoEvento`
- `ManutencaoPecaTrocada`

Beneficio:

- Rastreio completo de pos-venda (`producao + manutencao`).

### 2) NF-e / Fiscal (novo dominio)

Escopo:

- Emissao de saida
- Remessa/retorno de manutencao (quando aplicavel)
- Historico de eventos fiscais por documento

Entidades sugeridas:

- `NFe`
- `NFeEvento`

Decisao tecnica pendente:

- Provedor fiscal (`Omie` vs emissor dedicado vs outro servico)

### 3) Rastreabilidade Unificada

Objetivo:

- Unificar historico de `producao + manutencao + expedicao` por serie

Entrega sugerida:

- Endpoint de timeline por serie (ex.: `GET /series/:serie/timeline`)

### 4) Frontend Operacional e Gestao

Operacao (chao de fabrica):

- App Android com React Native/Expo
- Scanner, camera e fluxo guiado por etapa

Gestao (opcional):

- Web admin para supervisao e relatorios

### 5) Padronizacao Tecnica e Qualidade

- Padrao de runtime: Node 20 LTS (`engines` + `.nvmrc`)
- Testes automatizados minimos para fluxos criticos:
  - producao completa
  - expedicao completa
  - bloqueios de duplicidade de QR
  - validacoes de etapa

## Fases

### Fase 1 (curto prazo, alto impacto)

Foco:

- Performance das integracoes Omie/ViaOnda-Etiquetadora
- Testes de fluxo critico
- Padronizacao de ambiente

Entregas:

- Cache, retry controlado e controle de concorrencia
- Suite minima de testes para endpoints principais
- Ambiente previsivel em dev/homolog/prod
- Fluxo OP validado com inicio manual por etapa (sem inicio automatico pos-finalizacao)

### Fase 2 (medio prazo, produto)

Foco:

- Modulo de Manutencao (MVP)
- Historico consolidado por serie
- Painel web operacional (opcional)

Entregas:

- Abertura/andamento/finalizacao de manutencao
- Registro de pecas trocadas em manutencao
- Timeline unica: `producao -> manutencao -> expedicao`
- Regras de setor aplicadas no backend por acao:
  - `abrir` -> financeiro
  - `scan-serie`, `pecas`, `finalizar` -> manutencao
  - `avancar` -> setor valido conforme status de destino

Status atual da Fase 2:

- Concluido:
  - Fluxo de manutencao ponta a ponta no backend
  - Consulta unificada por serie implementada no backend:
    - `GET /series/:serie/timeline`
    - agrega producao + expedicao + manutencao em uma unica resposta
  - Estrategia de consulta consolidada:
    - Operacional: endpoints de `resumo` por modulo
    - Rastreabilidade: endpoint unificado por serie
  - Resumos operacionais padronizados por chave de negocio (`empresa + numero`):
    - `GET /op/:empresa/:numeroOP/resumo`
    - `GET /op/:empresa/:numeroOP/rastreabilidade-materiais`
    - `GET /expedicao/:empresa/:numeroPedido/resumo`
    - `GET /manutencao/:empresa/:numeroOS/resumo`
  - Legados de historico fragmentado removidos (`/manutencao/serie/:serie/historico` e `/pecas/historico`)
  - Rotas de manutencao consolidadas:
    - `POST /manutencao/abrir`
    - `POST /manutencao/:id/avancar`
    - `POST /manutencao/:id/scan-serie`
    - `POST /manutencao/:id/pecas`
    - `POST /manutencao/:id/finalizar`
    - `GET /manutencao/:empresa/:numeroOS/resumo`
  - Validacao de permissao por setor via cadastro de funcionarios
  - Auditoria de setor em `ManutencaoEvento`
  - Testes automatizados de permissao por setor
  - Cadastro administrativo de funcionarios implementado no backend:
    - `GET /admin/funcionarios`
    - `POST /admin/funcionarios`
    - `PUT /admin/funcionarios/:id`
    - `PATCH /admin/funcionarios/:id/ativo`
    - `DELETE /admin/funcionarios/:id`
  - Validacao de setor por funcionario aplicada em:
    - manutencao (abrir, avancar, scan-serie, pecas, finalizar)
    - producao OP (iniciar, iniciar etapa, eventos, finalizar etapa)
    - expedicao (iniciar, eventos, scan-serie, finalizar)
  - Padronizacao de operador em payloads de consulta:
    - `funcionarioNome` (resolvido pelo cadastro)
  - Manutencao reforcada para rastreabilidade:
    - `scan-serie` permitido somente com historico de expedicao
    - ultima expedicao da serie deve estar `finalizada`
- Pendente:
  - Painel web operacional

### Fase 3 (medio/longo prazo, escala)

Foco:

- Modulo de NF-e
- Observabilidade completa
- Evolucao para app operacional React Native (se aprovado)

Entregas:

- Emissao e rastreio de documentos fiscais
- Logs estruturados, metricas e alertas
- Diagnostico rapido de falhas em producao

## Ordem Recomendada

1. Fase 1 completa
2. Fase 2 (MVP de manutencao primeiro)
3. Fase 3 apos estabilidade operacional

## Criterios de Pronto por Fase

### Fase 1

- P95 das chamadas externas monitorado
- Regressao coberta pelos testes criticos
- Setup de ambiente reproduzivel no time

### Fase 2

- Fluxo de manutencao operando fim a fim
- Pecas de manutencao refletidas no historico por serie
- Timeline consolidada disponivel por endpoint

### Fase 3

- Emissao fiscal homologada no provedor escolhido
- Alertas ativos para falhas de integracao e fluxo
- Operacao movel validada em piloto


