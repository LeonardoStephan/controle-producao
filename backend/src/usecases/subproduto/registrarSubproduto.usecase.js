// src/usecases/subproduto/registrarSubproduto.usecase.js
const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { buscarEtiquetaProdutoFinal, buscarOP } = require('../../integrations/viaonda/viaonda.facade');
const { validarProdutoExisteNoOmie } = require('../../integrations/omie/omie.produto');
const { extrairCodigoDoQr } = require('../../utils/subprodutoQr');

function extrairCodigoProdutoDaOpViaOnda(item) {
  const codigo = item?.codigo ? String(item.codigo).trim() : null;
  return codigo || null;
}

async function execute(body) {
  const {
    opId,
    opNumeroSubproduto,
    serie,
    funcionarioId,
    quantidade = 1,
    codigoSubproduto,
    qrCode,
    empresa
  } = body;

  if (!opId || !serie || !funcionarioId) {
    return { status: 400, body: { erro: 'opId, serie e funcionarioId são obrigatórios' } };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 para registro de subproduto (uma etiqueta por registro).' }
    };
  }

  const op = await ordemRepo.findById(String(opId));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return {
      status: 400,
      body: { erro: 'Empresa não definida. Salve empresa na OP (op.empresa) ou envie "empresa" no body.' }
    };
  }

  if (op.status !== 'montagem') {
    return {
      status: 400,
      body: { erro: `Registro de subproduto permitido apenas na etapa de montagem. Status atual: ${op.status}` }
    };
  }

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(opId), 'montagem');
  if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
    return { status: 400, body: { erro: 'Montagem não esté ativa' } };
  }

  const serieNorm = String(serie).trim();

  const existente = await subprodutoRepo.findByEtiquetaId(serieNorm);
  if (existente) {
    if (!existente.serieProdFinalId) {
      return {
        status: 200,
        body: { ok: true, aviso: 'Subproduto já está registrado.' }
      };
    }
    return { status: 400, body: { erro: 'Etiqueta de subproduto já utilizada' } };
  }

  const opNumero = String(opNumeroSubproduto || op.numeroOP || '').trim();
  if (!opNumero) {
    return {
      status: 400,
      body: { erro: 'opNumeroSubproduto é obrigatório (ou OP precisa ter numeroOP)' }
    };
  }

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return {
      status: 400,
      body: { erro: 'Não foi possível identificar o código do subproduto. Envie "codigoSubproduto".' }
    };
  }

  let etiquetas, dadosOp;
  try {
    [etiquetas, dadosOp] = await Promise.all([
      buscarEtiquetaProdutoFinal(opNumero, empresaResolvida),
      buscarOP(opNumero, empresaResolvida)
    ]);
  } catch (err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto não encontrada na ViaOnda' } };
  }

  const pertence = etiquetas.some((e) => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    const amostra = etiquetas
      .map((e) => String(e.serie || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    return {
      status: 400,
      body: {
        erro: 'Etiqueta não pertence à OP do subproduto',
        serieEnviada: String(serie),
        serieNormalizada: serieNorm,
        opNumeroSubproduto: opNumero,
        amostraSeriesViaOnda: amostra
      }
    };
  }

  if (!Array.isArray(dadosOp) || dadosOp.length === 0) {
    return { status: 400, body: { erro: `OP do subproduto ${opNumero} não encontrada na etiquetadora` } };
  }

  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(dadosOp[0]);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora não retornou o campo "codigo" para a OP ${opNumero}` }
    };
  }

  if (String(codigoDetectado).trim() !== String(codigoEsperado).trim()) {
    return {
      status: 400,
      body: {
        erro: `codigoSubproduto inválido para a OP ${opNumero}. Esperado: ${codigoEsperado}`,
        enviado: String(codigoDetectado).trim()
      }
    };
  }

  try {
    const ok = await validarProdutoExisteNoOmie(codigoDetectado, empresaResolvida);
    if (!ok) {
      console.warn('[registrarSubproduto] Aviso: produto não encontrado no Omie (ignorado):', codigoDetectado);
    }
  } catch (err) {
    console.warn('[registrarSubproduto] Aviso: falha na validação do Omie (ignorado):', err.message);
  }

  const subproduto = await subprodutoRepo.create({
    id: crypto.randomUUID(),
    opId: String(opId),
    serieProdFinalId: null,
    opNumeroSubproduto: opNumero,
    etiquetaId: serieNorm,
    funcionarioId: String(funcionarioId),
    codigoSubproduto: String(codigoDetectado).trim()
  });

  await eventoRepo.create({
    id: crypto.randomUUID(),
    opId: String(opId),
    etapa: 'montagem',
    tipo: 'registro_subproduto',
    funcionarioId: String(funcionarioId)
  });

  return { status: 200, body: { ok: true, subproduto } };
}

module.exports = { execute };
