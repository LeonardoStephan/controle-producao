const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');

const { buscarEtiquetaProdutoFinal } = require('../../integrations/viaonda/viaonda.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM } = require('../../integrations/omie/omie.estrutura');
const { extrairCodigoDoQr } = require('../../utils/subprodutoQr');
const { conflictResponse, throwBusiness } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

function extrairCodigoProdutoDaOpViaOnda(item) {
  const codigo = item?.codigo ? String(item.codigo).trim() : null;
  return codigo || null;
}

async function execute(body) {
  const {
    opId,
    serieProdFinalId,
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
      body: { erro: 'opId, serieProdFinalId, opNumeroSubproduto, série e funcionarioId são obrigatórios' }
    };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  if (Number(quantidade) !== 1) {
    return {
      status: 400,
      body: { erro: 'quantidade deve ser 1 (uma etiqueta por consumo de subproduto).' }
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

  const jaExisteMesmoCodigoNoMesmoPF = await subprodutoRepo.findMesmoCodigoNoMesmoPF({
    serieProdFinalId: String(serieProdFinalId),
    codigoSubproduto: String(codigoDetectado).trim(),
    etiquetaIdNot: serieNorm
  });

  if (jaExisteMesmoCodigoNoMesmoPF) {
    return {
      status: 400,
      body: {
        erro: `Já existe um número de série vinculado a este produto final (serie ja usada: ${jaExisteMesmoCodigoNoMesmoPF.etiquetaId}).`
      }
    };
  }

  // ViaOnda: uma unica consulta por OP (cache + in-flight dedupe no adapter)
  let etiquetas;
  try {
    etiquetas = await buscarEtiquetaProdutoFinal(String(opNumeroSubproduto).trim(), empresaResolvida);
  } catch (_err) {
    return { status: 502, body: { erro: 'Falha ao consultar etiquetadora (ViaOnda)' } };
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return { status: 400, body: { erro: 'OP de subproduto não encontrada na ViaOnda' } };
  }

  const pertence = etiquetas.some((e) => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    return { status: 400, body: { erro: 'Etiqueta não pertence à OP do subproduto' } };
  }

  const etiquetaDaSerie = etiquetas.find((e) => String(e.serie || '').trim() === serieNorm) || null;
  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(etiquetaDaSerie);
  if (!codigoEsperado) {
    return {
      status: 502,
      body: { erro: `A etiquetadora não retornou o campo "codigo" para a série ${serieNorm} na OP ${opNumeroSubproduto}` }
    };
  }

  if (String(codigoDetectado).trim() !== String(codigoEsperado).trim()) {
    return {
      status: 400,
      body: { erro: `codigoSubproduto inválido para a OP ${opNumeroSubproduto}. Esperado: ${codigoEsperado}` }
    };
  }

  // Omie: valida produto com cache
  try {
    const produtoOmie = await consultarProdutoNoOmie(codigoDetectado, empresaResolvida);
    if (!produtoOmie) {
      return { status: 400, body: { erro: 'codigoSubproduto inválido: produto não encontrado no Omie' } };
    }
  } catch (err) {
    if (err.message === 'FALHA_OMIE_CONSULTAR_PRODUTO') {
      return { status: 502, body: { erro: 'Falha ao validar produto no Omie' } };
    }
    return { status: 500, body: { erro: 'Erro interno ao validar codigoSubproduto' } };
  }

  let codProdutoOmieFinal = pf.codProdutoOmie ? String(pf.codProdutoOmie).trim() : null;
  if (!codProdutoOmieFinal && codProdutoOmie) codProdutoOmieFinal = String(codProdutoOmie).trim();

  if (codProdutoOmieFinal) {
    let bomData;
    try {
      bomData = await consultarEstruturaProduto(codProdutoOmieFinal, empresaResolvida);
    } catch (_err) {
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
            'Conflito de concorrência: subproduto foi vinculado por outro usuário. Atualize e tente novamente.',
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
      return conflictResponse('Conflito de concorrência: subproduto ja foi vinculado neste contexto.', {
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
