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
    return { status: 400, body: { erro: 'opId, serie e funcionarioId sao obrigatorios' } };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 para registro de subproduto (uma etiqueta por registro).' }
    };
  }

  const op = await ordemRepo.findById(String(opId));
  if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return {
      status: 400,
      body: { erro: 'Empresa nao definida. Salve empresa na OP (op.empresa) ou envie "empresa" no body.' }
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
    return { status: 400, body: { erro: 'Montagem nao esta ativa' } };
  }

  const serieNorm = String(serie).trim();

  const existente = await subprodutoRepo.findByEtiquetaId(serieNorm);
  if (existente) {
    if (!existente.serieProdFinalId) {
      return {
        status: 200,
        body: { ok: true, aviso: 'Subproduto ja esta registrado.' }
      };
    }
    return { status: 400, body: { erro: 'Etiqueta de subproduto ja utilizada' } };
  }

  const opNumero = String(opNumeroSubproduto || op.numeroOP || '').trim();
  if (!opNumero) {
    return {
      status: 400,
      body: { erro: 'opNumeroSubproduto e obrigatorio (ou OP precisa ter numeroOP)' }
    };
  }

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return {
      status: 400,
      body: { erro: 'Nao foi possivel identificar o codigo do subproduto. Envie "codigoSubproduto".' }
    };
  }

  let etiquetas;
  let dadosOp;
  try {
    [etiquetas, dadosOp] = await Promise.all([
      buscarEtiquetaProdutoFinal(opNumero, empresaResolvida),
      buscarOP(opNumero, empresaResolvida)
    ]);
  } catch (err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto nao encontrada na ViaOnda' } };
  }

  const pertence = etiquetas.some((e) => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    const seriesDaOpViaOnda = etiquetas
      .map((e) => String(e.serie || '').trim())
      .filter(Boolean);

    const etiquetasJaRegistradas = await subprodutoRepo.listEtiquetasByOpId(String(opId));
    const setRegistradas = new Set(etiquetasJaRegistradas);

    const seriesPendentesDaOp = seriesDaOpViaOnda
      .filter((s) => !setRegistradas.has(s))
      .slice(0, 10);

    return {
      status: 400,
      body: {
        erro: 'Etiqueta nao pertence a OP do subproduto',
        serieEnviada: String(serie),
        opNumeroSubproduto: opNumero,
        seriesPertencentesOp: seriesPendentesDaOp
      }
    };
  }

  if (!Array.isArray(dadosOp) || dadosOp.length === 0) {
    return { status: 400, body: { erro: `OP do subproduto ${opNumero} nao encontrada na etiquetadora` } };
  }

  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(dadosOp[0]);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora nao retornou o campo "codigo" para a OP ${opNumero}` }
    };
  }

  if (String(codigoDetectado).trim() !== String(codigoEsperado).trim()) {
    return {
      status: 400,
      body: {
        erro: `codigoSubproduto invalido para a OP ${opNumero}. Esperado: ${codigoEsperado}`,
        enviado: String(codigoDetectado).trim()
      }
    };
  }

  try {
    const ok = await validarProdutoExisteNoOmie(codigoDetectado, empresaResolvida);
    if (!ok) {
      console.warn('[registrarSubproduto] Aviso: produto nao encontrado no Omie (ignorado):', codigoDetectado);
    }
  } catch (err) {
    console.warn('[registrarSubproduto] Aviso: falha na validacao do Omie (ignorado):', err.message);
  }

  let subproduto;
  try {
    subproduto = await subprodutoRepo.create({
      id: crypto.randomUUID(),
      opId: String(opId),
      serieProdFinalId: null,
      opNumeroSubproduto: opNumero,
      etiquetaId: serieNorm,
      funcionarioId: String(funcionarioId),
      codigoSubproduto: String(codigoDetectado).trim()
    });
  } catch (err) {
    // Corrida de concorrencia: outro cliente pode ter criado a mesma etiqueta entre o check e o create.
    if (err?.code === 'P2002') {
      const existenteAposConflito = await subprodutoRepo.findByEtiquetaId(serieNorm);
      if (existenteAposConflito && !existenteAposConflito.serieProdFinalId) {
        return {
          status: 200,
          body: { ok: true, aviso: 'Subproduto ja esta registrado.' }
        };
      }
      if (existenteAposConflito && existenteAposConflito.serieProdFinalId) {
        return { status: 400, body: { erro: 'Etiqueta de subproduto ja utilizada' } };
      }
      return {
        status: 409,
        body: {
          erro: 'Conflito de concorrencia ao registrar subproduto. Tente novamente.',
          code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'Subproduto', etiquetaId: serieNorm, opId: String(opId) }
        }
      };
    }

    console.error('Erro registrarSubproduto create:', err);
    return { status: 500, body: { erro: 'Erro interno ao registrar subproduto' } };
  }

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
