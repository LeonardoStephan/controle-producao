const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { buscarEtiquetaProdutoFinal } = require('../../integrations/viaonda/viaonda.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');

async function execute(body) {
  const { opId, serieProdutoFinal, empresa, codProdutoOmie } = body;
  let descricaoProduto = null;

  // Rule:
  // true  => requires codProdutoOmie when creating PF
  // false => optional, but validates when provided
  const STRICT_COD_PRODUTO = true;

  if (!opId || !serieProdutoFinal) {
    return { status: 400, body: { erro: 'opId e serieProdutoFinal são obrigatórios' } };
  }

  const op = await ordemRepo.findById(opId);
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  const empresaFinal = String(op.empresa || empresa || '').trim();
  if (!empresaFinal) {
    return { status: 400, body: { erro: 'empresa é obrigatória (salve empresa na OP ou envie no body)' } };
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
          erro: `Esta OP ja está vinculada ao produto Omie '${pfExistenteDaOp.codProdutoOmie}'. Envie codProdutoOmie no body.`
        }
      };
    }

    if (String(pfExistenteDaOp.codProdutoOmie).trim() !== codProduto) {
      return {
        status: 400,
        body: {
          erro: `codProdutoOmie diferente do padrão da OP. Esta OP está vinculada a: '${pfExistenteDaOp.codProdutoOmie}'.`
        }
      };
    }
  } else if (STRICT_COD_PRODUTO && !codProduto) {
    // 2) If OP has no previous standard, choose whether code is mandatory
    return { status: 400, body: { erro: 'codProdutoOmie e obrigatório para criar Produto Final' } };
  }

  // 3) Blocks duplicated serial
  const jaExiste = await produtoFinalRepo.findBySerie(serie);
  if (jaExiste) return { status: 400, body: { erro: 'Produto final já registrado com esta série' } };

  // 4) Validates serial in ViaOnda
  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresaFinal);
  const pertence =
    Array.isArray(etiquetas) &&
    etiquetas.some((e) => String(e.serie).trim() === serie);

  if (!pertence) {
    return { status: 400, body: { erro: 'Série não pertence a OP ou não foi impressa' } };
  }

  // 5) Validates codProdutoOmie in Omie and fetches product description
  if (codProduto) {
    try {
      const produtoOmie = await consultarProdutoNoOmie(codProduto, empresaFinal);
      if (!produtoOmie) {
        return { status: 400, body: { erro: 'codProdutoOmie inválido: produto não encontrado no Omie' } };
      }
      descricaoProduto = produtoOmie.descricao || null;
    } catch (e) {
      console.error('Erro consultarProdutoNoOmie:', e.message);
      return { status: 502, body: { erro: 'Falha ao consultar produto no Omie' } };
    }
  }

  // 6) Creates PF
  const produtoFinal = await produtoFinalRepo.create({
    id: crypto.randomUUID(),
    opId: String(opId),
    serie,
    codProdutoOmie: codProduto
  });

  return { status: 200, body: { ok: true, produtoFinal, descricaoProduto } };
}

module.exports = { execute };
