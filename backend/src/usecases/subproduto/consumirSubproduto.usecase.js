// src/usecases/subproduto/consumirSubproduto.usecase.js
const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { buscarEtiquetaProdutoFinal, buscarOP } = require('../../integrations/viaonda/viaonda.facade');
const { validarProdutoExisteNoOmie } = require('../../integrations/omie/omie.produto');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM } = require('../../integrations/omie/omie.estrutura');
const { extrairCodigoDoQr } = require('../../utils/subprodutoQr');
const { conflictResponse, throwBusiness } = require('../../utils/httpErrors');

function extrairCodigoProdutoDaOpViaOnda(item) {
  const codigo = item?.codigo ? String(item.codigo).trim() : null;
  return codigo || null;
}

async function execute(body) {
  const {
    opId,
    serieProdFinalId, // unico campo aceito (API)
    opNumeroSubproduto,
    serie,
    funcionarioId,
    quantidade = 1,
    codigoSubproduto,
    qrCode,
    codProdutoOmie,
    empresa
  } = body;

  if (!opId || !serieProdFinalId || !opNumeroSubproduto || !serie || !funcionarioId) {
    return {
      status: 400,
      body: { erro: 'opId, serieProdFinalId, opNumeroSubproduto, serie e funcionarioId sao obrigatorios' }
    };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 (uma etiqueta por consumo de subproduto).' }
    };
  }

  const op = await ordemRepo.findById(String(opId));
  if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return {
      status: 400,
      body: { erro: 'Empresa nao definida. Salve empresa na OP (op/iniciar) ou envie "empresa" no body.' }
    };
  }

  if (op.status !== 'montagem') {
    return { status: 400, body: { erro: 'Consumo de subproduto permitido apenas na montagem' } };
  }

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(opId), 'montagem');
  if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
    return { status: 400, body: { erro: 'Montagem nao esta ativa' } };
  }

  const pf = await produtoFinalRepo.findByIdSelect(String(serieProdFinalId), {
    id: true,
    opId: true,
    codProdutoOmie: true
  });

  if (!pf) return { status: 404, body: { erro: 'Produto final nao encontrado' } };
  if (String(pf.opId) !== String(opId)) {
    return { status: 400, body: { erro: 'Produto final nao pertence a OP informada' } };
  }

  const serieNorm = String(serie).trim();

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return {
      status: 400,
      body: { erro: 'Nao foi possivel identificar o codigo do subproduto. Envie "codigoSubproduto".' }
    };
  }

  // trava: nao permitir 2 subprodutos do mesmo tipo no mesmo PF
  const jaExisteMesmoCodigoNoMesmoPF = await subprodutoRepo.findMesmoCodigoNoMesmoPF({
    serieProdFinalId: String(serieProdFinalId),
    codigoSubproduto: String(codigoDetectado).trim(),
    etiquetaIdNot: serieNorm
  });

  if (jaExisteMesmoCodigoNoMesmoPF) {
    return {
      status: 400,
      body: {
        erro: `Ja existe um numero de serie vinculado a este produto final (serie ja usada: ${jaExisteMesmoCodigoNoMesmoPF.etiquetaId}).`
      }
    };
  }

  // ViaOnda: valida etiqueta pertence a OP + valida codigo esperado da OP
  let etiquetas;
  let dadosOpSub;
  try {
    [etiquetas, dadosOpSub] = await Promise.all([
      buscarEtiquetaProdutoFinal(String(opNumeroSubproduto).trim(), empresaResolvida),
      buscarOP(String(opNumeroSubproduto).trim(), empresaResolvida)
    ]);
  } catch (err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto nao encontrada na ViaOnda' } };
  }

  const pertence = etiquetas.some((e) => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    return { status: 400, body: { erro: 'Etiqueta nao pertence a OP do subproduto' } };
  }

  if (!Array.isArray(dadosOpSub) || dadosOpSub.length === 0) {
    return { status: 400, body: { erro: `OP do subproduto ${opNumeroSubproduto} nao encontrada na etiquetadora` } };
  }

  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(dadosOpSub[0]);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora nao retornou o campo "codigo" para a OP ${opNumeroSubproduto}` }
    };
  }

  if (String(codigoDetectado).trim() !== String(codigoEsperado).trim()) {
    return {
      status: 400,
      body: { erro: `codigoSubproduto invalido para a OP ${opNumeroSubproduto}. Esperado: ${codigoEsperado}` }
    };
  }

  // Omie: valida produto existe (bloqueante)
  try {
    const ok = await validarProdutoExisteNoOmie(codigoDetectado, empresaResolvida);
    if (!ok) return { status: 400, body: { erro: 'codigoSubproduto invalido: produto nao encontrado no Omie' } };
  } catch (err) {
    if (err.message === 'FALHA_OMIE_CONSULTAR_PRODUTO') {
      return { status: 502, body: { erro: 'Falha ao validar produto no Omie' } };
    }
    return { status: 500, body: { erro: 'Erro interno ao validar codigoSubproduto' } };
  }

  // BOM: valida subproduto pertence ao BOM do PF (familia SubProduto), se existir
  let codProdutoOmieFinal = pf.codProdutoOmie ? String(pf.codProdutoOmie).trim() : null;
  if (!codProdutoOmieFinal && codProdutoOmie) codProdutoOmieFinal = String(codProdutoOmie).trim();

  if (codProdutoOmieFinal) {
    let bomData;
    try {
      bomData = await consultarEstruturaProduto(codProdutoOmieFinal, empresaResolvida);
    } catch (err) {
      return { status: 502, body: { erro: 'Falha ao consultar BOM no Omie' } };
    }

    const subprodutosBOM = extrairSubprodutosDoBOM(bomData);
    if (subprodutosBOM.length > 0) {
      const existeNoBOM = subprodutosBOM.some(
        (sp) => String(sp.codigo).trim() === String(codigoDetectado).trim()
      );
      if (!existeNoBOM) {
        return { status: 400, body: { erro: 'Subproduto nao pertence ao BOM do produto (familia SubProduto)' } };
      }
    }
  }

  let subproduto;
  try {
    subproduto = await prisma.$transaction(async (tx) => {
      const existenteTx = await tx.subproduto.findUnique({
        where: { etiquetaId: serieNorm }
      });

      if (existenteTx) {
        if (existenteTx.serieProdFinalId) {
          throwBusiness(400, 'Etiqueta de subproduto ja utilizada');
        }

        const claimed = await tx.subproduto.updateMany({
          where: { etiquetaId: serieNorm, serieProdFinalId: null },
          data: {
            serieProdFinalId: String(serieProdFinalId),
            opNumeroSubproduto: String(opNumeroSubproduto),
            funcionarioId: String(funcionarioId),
            codigoSubproduto: String(codigoDetectado).trim()
          }
        });

        if (claimed.count === 0) {
          throwBusiness(
            409,
            'Conflito de concorrencia: subproduto foi vinculado por outro usuario. Atualize e tente novamente.',
            {
              code: 'CONCURRENCY_CONFLICT',
              detalhe: { recurso: 'Subproduto', etiquetaId: serieNorm, opId: String(opId) }
            }
          );
        }

        return tx.subproduto.findUnique({
          where: { etiquetaId: serieNorm }
        });
      }

      return tx.subproduto.create({
        data: {
          id: crypto.randomUUID(),
          opId: String(opId),
          serieProdFinalId: String(serieProdFinalId),
          opNumeroSubproduto: String(opNumeroSubproduto),
          etiquetaId: serieNorm,
          funcionarioId: String(funcionarioId),
          codigoSubproduto: String(codigoDetectado).trim()
        }
      });
    });
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };

    if (err?.code === 'P2002') {
      return conflictResponse('Conflito de concorrencia: subproduto ja foi vinculado neste contexto.', {
        recurso: 'Subproduto',
        etiquetaId: serieNorm,
        opId: String(opId)
      });
    }

    console.error('Erro concorrencia consumirSubproduto:', err);
    return { status: 500, body: { erro: 'Erro interno ao consumir subproduto' } };
  }

  await eventoRepo.create({
    id: crypto.randomUUID(),
    opId: String(opId),
    etapa: 'montagem',
    tipo: 'consumo_subproduto',
    funcionarioId: String(funcionarioId)
  });

  return { status: 200, body: { ok: true, subproduto } };
}

module.exports = { execute };
