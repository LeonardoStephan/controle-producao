// src/usecases/op/finalizarEtapa.usecase.js
const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM } = require('../../integrations/omie/omie.estrutura');
const { conflictResponse } = require('../../utils/httpErrors');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * ✅ Retry pequeno APENAS para falha intermitente do Omie ao consultar estrutura.
 * Mantém a validação como bloqueante, mas evita possíveis erros como: “falhou na 1ª tentativa e funcionou na 2ª”.
 */
async function consultarEstruturaComRetry(codProdutoOmie, empresa, { tentativas = 2 } = {}) {
  const cod = String(codProdutoOmie || '').trim();
  const emp = String(empresa || '').trim();
  if (!cod || !emp) return null;

  let lastErr = null;

  for (let i = 1; i <= tentativas; i++) {
    try {
      return await consultarEstruturaProduto(cod, emp);
    } catch (err) {
      lastErr = err;

      const msg = String(err?.message || '');
      const isFalhaEstrutura = msg.includes('FALHA_OMIE_CONSULTAR_ESTRUTURA');

      // só dá retry nesse erro conhecido
      if (!isFalhaEstrutura || i === tentativas) throw err;

      await sleep(500);
    }
  }

  throw lastErr;
}

async function execute({ params = {}, body = {} }) {
  const { id, etapa } = params;
  const { funcionarioId } = body;

  if (!id || !etapa) {
    return { status: 400, body: { erro: 'Parâmetros obrigatórios ausentes (id, etapa)' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId é obrigatório' } };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  if (op.status !== etapa) {
    return {
      status: 400,
      body: { erro: `Não é possível finalizar ${etapa}. Etapa atual: ${op.status}` }
    };
  }

  const index = FLUXO_ETAPAS.indexOf(etapa);
  if (index === -1) return { status: 400, body: { erro: 'Etapa inválida' } };

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(id), etapa);
  if (!ultimoEvento || ultimoEvento.tipo === 'pausa') {
    return {
      status: 400,
      body: { erro: 'Etapa não pode ser finalizada pausada ou sem início' }
    };
  }

  // próxima etapa default
  let proximaEtapa = FLUXO_ETAPAS[index + 1];

  /* =====================================================
     ✅ 1) OP de SUBPRODUTO/PLACA: exige registrar todas as etiquetas na montagem
     Regra: total registros (Subproduto) da OP deve bater com op.quantidadeProduzida
     Conta apenas registros "produzidos" (serieProdFinalId = null)
  ====================================================== */
  if (etapa === 'montagem' && op.tipoOp === 'subproduto') {
    const totalRegistrados = await subprodutoRepo.countRegistradosNaOp(String(id));
    const totalEsperado = Number(op.quantidadeProduzida || 0);

    const faltam = Math.max(0, totalEsperado - totalRegistrados);
    if (faltam > 0) {
      return {
        status: 400,
        body: {
          erro: `Não é possível finalizar montagem: faltam ${faltam} etiqueta(s) a serem registradas.`,
          totalEsperado,
          totalRegistrados
        }
      };
    }

    // fluxo: subproduto finaliza na montagem
    proximaEtapa = 'finalizada';
  }

  /* =====================================================
     ✅ 2) Regra antiga: se está finalizando TESTE e não existe PF, pode finalizar direto
  ====================================================== */
  if (etapa === 'teste' && proximaEtapa === 'embalagem_estoque') {
    const existePF = await produtoFinalRepo.existsAnyByOpId(String(id));
    if (!existePF) proximaEtapa = 'finalizada';
  }

  /* =====================================================
     ✅ 3) Validação BOM SubProduto (somente ao finalizar MONTAGEM de OP de produto final)
     - Só valida se existir PF com codProdutoOmie
     - Usa COUNT de consumos por codigoSubproduto (sem campo quantidade)
  ====================================================== */
  if (etapa === 'montagem' && op.tipoOp !== 'subproduto') {
    const empresaOk = String(op.empresa || '').trim();

    if (!empresaOk) {
      return {
        status: 400,
        body: {
          erro: 'OP sem empresa definida. Salve a empresa na OP (op/iniciar) para validar BOM de subprodutos.'
        }
      };
    }

    const pf = await produtoFinalRepo.findFirstWithCodProdutoOmie(String(id));
    const codOk = pf?.codProdutoOmie ? String(pf.codProdutoOmie).trim() : '';

    if (codOk) {
      let bomData;
      try {
        bomData = await consultarEstruturaComRetry(codOk, empresaOk, { tentativas: 2 });
      } catch (err) {
        console.error('Erro ConsultarEstrutura (finalizar montagem):', {
          opId: String(id),
          empresa: empresaOk,
          codProdutoOmie: codOk,
          msg: err?.message,
          data: err?.response?.data
        });
        return { status: 502, body: { erro: 'Falha ao consultar BOM no Omie' } };
      }

      const subprodutosBOM = extrairSubprodutosDoBOM(bomData);

      if (subprodutosBOM.length > 0) {
        // map { codigoSubproduto => qtdConsumida }
        const consumidoMap = await subprodutoRepo.countConsumidosNaOpAgrupado(String(id));

        const faltando = [];
        for (const sp of subprodutosBOM) {
          const obrigatorioTotal =
            Number(sp.qtdPorUnidade || 0) * Number(op.quantidadeProduzida || 0);

          const consumidoTotal = Number(consumidoMap[String(sp.codigo).trim()] || 0);

          if (consumidoTotal < obrigatorioTotal) {
            faltando.push({
              codigoSubproduto: sp.codigo,
              obrigatorioTotal,
              consumidoTotal,
              faltam: obrigatorioTotal - consumidoTotal
            });
          }
        }

        if (faltando.length > 0) {
          return {
            status: 400,
            body: {
              erro:
                'Não é possível finalizar a montagem: subprodutos obrigatórios incompletos (BOM família SubProduto).',
              codProdutoOmie: codOk,
              faltando
            }
          };
        }
      }
    }
  }

  /* =====================================================
     FINALIZAÇÃO
  ====================================================== */
  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventoOP.create({
        data: {
          id: crypto.randomUUID(),
          opId: String(id),
          tipo: 'fim',
          etapa,
          funcionarioId: String(funcionarioId)
        }
      });

      const claimed = await tx.ordemProducao.updateMany({
        where: { id: String(id), status: etapa, version: op.version },
        data: {
          status: proximaEtapa,
          version: { increment: 1 }
        }
      });

      if (claimed.count === 0) {
        const err = new Error('CONCURRENCY_CONFLICT');
        err.code = 'CONCURRENCY_CONFLICT';
        throw err;
      }
    });

    return {
      status: 200,
      body: {
        ok: true,
        etapaFinalizada: etapa,
        proximaEtapa,
        requerInicioManualProximaEtapa: proximaEtapa !== 'finalizada'
      }
    };
  } catch (err) {
    if (err?.code === 'CONCURRENCY_CONFLICT') {
      return conflictResponse(
        'Conflito de concorrencia: OP foi alterada por outro usuario. Atualize e tente novamente.',
        { recurso: 'OrdemProducao', opId: String(id), etapa: String(etapa) }
      );
    }
    console.error('Erro ao finalizar etapa:', err);
    return { status: 500, body: { erro: 'Erro interno ao finalizar etapa' } };
  }
}

module.exports = { execute };
