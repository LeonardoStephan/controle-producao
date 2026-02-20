const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { buscarEtiquetaProdutoFinal } = require('../../integrations/viaonda/viaonda.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { extrairCodigoDoQr } = require('../../utils/subprodutoQr');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

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
    return { status: 400, body: { erro: 'opId, série e funcionarioId são obrigatórios' } };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 para registro de subproduto (uma etiqueta por registro).' }
    };
  }

  const op = await ordemRepo.findById(String(opId));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  if (empresa && String(op.empresa || '').trim() && String(empresa).trim() !== String(op.empresa).trim()) {
    return {
      status: 400,
      body: { erro: `OP pertence à empresa '${op.empresa}'. Você enviou '${String(empresa).trim()}'.` }
    };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

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
    return { status: 400, body: { erro: 'Montagem não está ativa' } };
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

  let etiquetas;
  try {
    etiquetas = await buscarEtiquetaProdutoFinal(opNumero, empresaResolvida);
  } catch (_err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto não encontrada na ViaOnda' } };
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
        erro: 'Etiqueta não pertence à OP do subproduto',
        serieEnviada: String(serie),
        opNumeroSubproduto: opNumero,
        seriesPertencentesOp: seriesPendentesDaOp
      }
    };
  }

  const etiquetaDaSerie = etiquetas.find((e) => String(e.serie || '').trim() === serieNorm) || null;
  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(etiquetaDaSerie);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora não retornou o campo "codigo" para a série ${serieNorm} na OP ${opNumero}` }
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
    // Usa caminho com cache de 10 min para reduzir latencia entre series sequenciais.
    const produtoOmie = await consultarProdutoNoOmie(codigoDetectado, empresaResolvida);
    if (!produtoOmie) {
      return {
        status: 400,
        body: { erro: `Produto não encontrado no Omie: ${String(codigoDetectado).trim()}` }
      };
    }
  } catch (_err) {
    return { status: 502, body: { erro: 'Falha ao validar produto no Omie' } };
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
    if (err?.code === 'P2002') {
      const existenteAposConflito = await subprodutoRepo.findByEtiquetaId(serieNorm);
      if (existenteAposConflito && !existenteAposConflito.serieProdFinalId) {
        return {
          status: 200,
          body: { ok: true, aviso: 'Subproduto já está registrado.' }
        };
      }
      if (existenteAposConflito && existenteAposConflito.serieProdFinalId) {
        return { status: 400, body: { erro: 'Etiqueta de subproduto já utilizada' } };
      }
      return {
        status: 409,
        body: {
          erro: 'Conflito de concorrência ao registrar subproduto. Tente novamente.',
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
