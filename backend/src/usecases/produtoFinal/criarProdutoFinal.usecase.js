const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { buscarEtiquetaProdutoFinal } = require('../../integrations/viaonda/viaonda.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { conflictResponse } = require('../../utils/httpErrors');

async function execute(body) {
  const { opId, serieProdutoFinal, empresa, codProdutoOmie } = body;
  let descricaoProduto = null;

  // Rule:
  // true  => requires codProdutoOmie when creating PF
  // false => optional, but validates when provided
  const STRICT_COD_PRODUTO = true;

  if (!opId || !serieProdutoFinal) {
    return { status: 400, body: { erro: 'opId e serieProdutoFinal sao obrigatorios' } };
  }

  const op = await ordemRepo.findById(opId);
  if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

  const empresaFinal = String(op.empresa || empresa || '').trim();
  if (!empresaFinal) {
    return { status: 400, body: { erro: 'empresa e obrigatoria (salve empresa na OP ou envie no body)' } };
  }

  const serie = String(serieProdutoFinal).trim();
  const codProduto = codProdutoOmie ? String(codProdutoOmie).trim() : null;

  // 1) OP consistency lock:
  // if OP already has PF with codProdutoOmie, force same code
  const pfExistenteDaOp = await produtoFinalRepo.findFirstCodProdutoOmieDaOp(opId);

  if (pfExistenteDaOp?.codProdutoOmie) {
    if (!codProduto) {
      return {
        status: 400,
        body: {
          erro: `Esta OP ja esta vinculada ao produto Omie '${pfExistenteDaOp.codProdutoOmie}'. Envie codProdutoOmie no body.`
        }
      };
    }

    if (String(pfExistenteDaOp.codProdutoOmie).trim() !== codProduto) {
      return {
        status: 400,
        body: {
          erro: `codProdutoOmie diferente do padrao da OP. Esta OP esta vinculada a: '${pfExistenteDaOp.codProdutoOmie}'.`
        }
      };
    }
  } else if (STRICT_COD_PRODUTO && !codProduto) {
    // 2) If OP has no previous standard, choose whether code is mandatory
    return { status: 400, body: { erro: 'codProdutoOmie e obrigatorio para criar Produto Final' } };
  }

  // 3) Blocks duplicated serial
  const jaExiste = await produtoFinalRepo.findBySerie(serie);
  if (jaExiste) return { status: 400, body: { erro: 'Produto final ja registrado com esta serie' } };

  // 4) Validates serial in ViaOnda
  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresaFinal);
  const pertence =
    Array.isArray(etiquetas) &&
    etiquetas.some((e) => String(e.serie).trim() === serie);

  if (!pertence) {
    const seriesDaOpViaOnda = Array.isArray(etiquetas)
      ? etiquetas.map((e) => String(e.serie || '').trim()).filter(Boolean)
      : [];

    const seriesJaRegistradas = await produtoFinalRepo.listSeriesByOpId(String(opId));
    const setRegistradas = new Set(seriesJaRegistradas);
    const seriesPendentesDaOp = seriesDaOpViaOnda
      .filter((s) => !setRegistradas.has(s))
      .slice(0, 10);

    return {
      status: 400,
      body: {
        erro: 'Serie nao pertence a OP ou nao foi impressa',
        serieEnviada: String(serieProdutoFinal),
        opNumero: String(op.numeroOP || ''),
        seriesPertencentesOp: seriesPendentesDaOp
      }
    };
  }

  // 5) Validates codProdutoOmie in Omie and fetches product description
  if (codProduto) {
    try {
      const produtoOmie = await consultarProdutoNoOmie(codProduto, empresaFinal);
      if (!produtoOmie) {
        return { status: 400, body: { erro: 'codProdutoOmie invalido: produto nao encontrado no Omie' } };
      }
      descricaoProduto = produtoOmie.descricao || null;
    } catch (e) {
      console.error('Erro consultarProdutoNoOmie:', e.message);
      return { status: 502, body: { erro: 'Falha ao consultar produto no Omie' } };
    }
  }

  let produtoFinal;
  try {
    produtoFinal = await produtoFinalRepo.create({
      id: crypto.randomUUID(),
      opId: String(opId),
      serie,
      codProdutoOmie: codProduto
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      const existenteAposConflito = await produtoFinalRepo.findBySerie(serie);
      if (existenteAposConflito) {
        return {
          status: 200,
          body: {
            ok: true,
            aviso: 'Produto final ja estava registrado com esta serie.',
            produtoFinal: existenteAposConflito,
            descricaoProduto
          }
        };
      }
      return conflictResponse('Conflito de concorrencia ao criar Produto Final. Tente novamente.', {
        recurso: 'ProdutoFinal',
        serie
      });
    }
    throw err;
  }

  return { status: 200, body: { ok: true, produtoFinal, descricaoProduto } };
}

module.exports = { execute };
