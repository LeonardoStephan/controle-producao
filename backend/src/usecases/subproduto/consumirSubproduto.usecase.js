// src/usecases/subproduto/consumirSubproduto.usecase.js
const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { buscarEtiquetaProdutoFinal, buscarOP } = require('../../integrations/viaonda/viaonda.facade');
const { validarProdutoExisteNoOmie } = require('../../integrations/omie/omie.produto');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM } = require('../../integrations/omie/omie.estrutura');
const { extrairCodigoDoQr } = require('../../utils/subprodutoQr');

function extrairCodigoProdutoDaOpViaOnda(item) {
  const codigo = item?.codigo ? String(item.codigo).trim() : null;
  return codigo || null;
}

async function execute(body) {
  const {
    opId,
    serieProdFinalId, // ✅ único campo aceito (API)
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
      body: { erro: 'opId, serieProdFinalId, opNumeroSubproduto, serie e funcionarioId são obrigatórios' }
    };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 (uma etiqueta por consumo de subproduto).' }
    };
  }

  const op = await ordemRepo.findById(String(opId));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return {
      status: 400,
      body: { erro: 'Empresa não definida. Salve empresa na OP (op/iniciar) ou envie "empresa" no body.' }
    };
  }

  if (op.status !== 'montagem') {
    return { status: 400, body: { erro: 'Consumo de subproduto permitido apenas na montagem' } };
  }

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(opId), 'montagem');
  if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
    return { status: 400, body: { erro: 'Montagem não está ativa' } };
  }

  const pf = await produtoFinalRepo.findByIdSelect(String(serieProdFinalId), {
    id: true,
    opId: true,
    codProdutoOmie: true
  });

  if (!pf) return { status: 404, body: { erro: 'Produto final não encontrado' } };
  if (String(pf.opId) !== String(opId)) {
    return { status: 400, body: { erro: 'Produto final não pertence à OP informada' } };
  }

  const serieNorm = String(serie).trim();

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return {
      status: 400,
      body: { erro: 'Não foi possível identificar o código do subproduto. Envie "codigoSubproduto".' }
    };
  }

  // trava: não permitir 2 subprodutos do MESMO tipo no mesmo PF
  const jaExisteMesmoCodigoNoMesmoPF = await subprodutoRepo.findMesmoCodigoNoMesmoPF({
    serieProdFinalId: String(serieProdFinalId),
    codigoSubproduto: String(codigoDetectado).trim(),
    etiquetaIdNot: serieNorm
  });

  if (jaExisteMesmoCodigoNoMesmoPF) {
    return {
      status: 400,
      body: {
        erro: `Já existe um número de série vinculado a este produto final (série já usada: ${jaExisteMesmoCodigoNoMesmoPF.etiquetaId}).`
      }
    };
  }

  // ViaOnda: valida etiqueta pertence à OP + valida código esperado da OP
  let etiquetas, dadosOpSub;
  try {
    [etiquetas, dadosOpSub] = await Promise.all([
      buscarEtiquetaProdutoFinal(String(opNumeroSubproduto).trim(), empresaResolvida),
      buscarOP(String(opNumeroSubproduto).trim(), empresaResolvida)
    ]);
  } catch (err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto não encontrada na ViaOnda' } };
  }

  const pertence = etiquetas.some((e) => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    return { status: 400, body: { erro: 'Etiqueta não pertence à OP do subproduto' } };
  }

  if (!Array.isArray(dadosOpSub) || dadosOpSub.length === 0) {
    return { status: 400, body: { erro: `OP do subproduto ${opNumeroSubproduto} não encontrada na etiquetadora` } };
  }

  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(dadosOpSub[0]);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora não retornou o campo "codigo" para a OP ${opNumeroSubproduto}` }
    };
  }

  if (String(codigoDetectado).trim() !== String(codigoEsperado).trim()) {
    return {
      status: 400,
      body: { erro: `codigoSubproduto inválido para a OP ${opNumeroSubproduto}. Esperado: ${codigoEsperado}` }
    };
  }

  // Omie: valida produto existe (bloqueante)
  try {
    const ok = await validarProdutoExisteNoOmie(codigoDetectado, empresaResolvida);
    if (!ok) return { status: 400, body: { erro: 'codigoSubproduto inválido: produto não encontrado no Omie' } };
  } catch (err) {
    if (err.message === 'FALHA_OMIE_CONSULTAR_PRODUTO') {
      return { status: 502, body: { erro: 'Falha ao validar produto no Omie' } };
    }
    return { status: 500, body: { erro: 'Erro interno ao validar codigoSubproduto' } };
  }

  // BOM: valida subproduto pertence ao BOM do PF (família SubProduto), se existir
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
        return { status: 400, body: { erro: 'Subproduto não pertence ao BOM do produto (família SubProduto)' } };
      }
    }
  }

  // vincula por etiquetaId
  const existente = await subprodutoRepo.findByEtiquetaId(serieNorm);

  let subproduto;
  if (existente) {
    if (existente.serieProdFinalId) {
      return { status: 400, body: { erro: 'Etiqueta de subproduto já utilizada' } };
    }

    subproduto = await subprodutoRepo.updateByEtiquetaId(serieNorm, {
      serieProdFinalId: String(serieProdFinalId),
      opNumeroSubproduto: String(opNumeroSubproduto),
      funcionarioId: String(funcionarioId),
      codigoSubproduto: String(codigoDetectado).trim()
    });
  } else {
    subproduto = await subprodutoRepo.create({
      id: crypto.randomUUID(),
      opId: String(opId),
      serieProdFinalId: String(serieProdFinalId),
      opNumeroSubproduto: String(opNumeroSubproduto),
      etiquetaId: serieNorm,
      funcionarioId: String(funcionarioId),
      codigoSubproduto: String(codigoDetectado).trim()
    });
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
