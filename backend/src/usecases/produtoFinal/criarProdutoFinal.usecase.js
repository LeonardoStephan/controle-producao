const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { buscarEtiquetaProdutoFinal } = require('../../integrations/viaonda/viaonda.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { conflictResponse } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

async function execute(body) {
  const { opId, serieProdutoFinal, empresa, codProdutoOmie, funcionarioId } = body;
  let descricaoProduto = null;

  if (!opId || !serieProdutoFinal || !funcionarioId) {
    return { status: 400, body: { erro: 'opId, serieProdutoFinal e funcionarioId são obrigatórios' } };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  const op = await ordemRepo.findById(opId);
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  if (empresa && String(op.empresa || '').trim() && String(empresa).trim() !== String(op.empresa).trim()) {
    return {
      status: 400,
      body: { erro: `OP pertence à empresa '${op.empresa}'. Você enviou '${String(empresa).trim()}'.` }
    };
  }

  const empresaFinal = String(op.empresa || empresa || '').trim();
  if (!empresaFinal) {
    return { status: 400, body: { erro: 'empresa é obrigatória (salve empresa na OP ou envie no body)' } };
  }

  const serie = String(serieProdutoFinal).trim();
  const codProduto = codProdutoOmie ? String(codProdutoOmie).trim() : null;

  const pfExistenteDaOp = await produtoFinalRepo.findFirstCodProdutoOmieDaOp(opId);

  if (pfExistenteDaOp?.codProdutoOmie) {
    if (!codProduto) {
      return {
        status: 400,
        body: {
          erro: `Esta OP já está vinculada ao produto Omie '${pfExistenteDaOp.codProdutoOmie}'. Envie codProdutoOmie no body.`
        }
      };
    }

    if (String(pfExistenteDaOp.codProdutoOmie).trim() !== codProduto) {
      return {
        status: 400,
        body: {
          erro: `codProdutoOmie diferente do padrão da OP. Esta OP esta vinculada a: '${pfExistenteDaOp.codProdutoOmie}'.`
        }
      };
    }
  } else if (!codProduto) {
    return { status: 400, body: { erro: 'codProdutoOmie é obrigatório para criar Produto Final' } };
  }

  const jaExiste = await produtoFinalRepo.findBySerie(serie);
  if (jaExiste) return { status: 400, body: { erro: 'Produto final já registrado com esta série' } };

  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresaFinal);
  const pertence = Array.isArray(etiquetas) && etiquetas.some((e) => String(e.serie).trim() === serie);

  if (!pertence) {
    const seriesDaOpViaOnda = Array.isArray(etiquetas)
      ? etiquetas.map((e) => String(e.serie || '').trim()).filter(Boolean)
      : [];
    const seriesJaRegistradas = await produtoFinalRepo.listSeriesByOpId(String(opId));
    const setRegistradas = new Set(seriesJaRegistradas);
    const seriesPendentesDaOp = seriesDaOpViaOnda.filter((s) => !setRegistradas.has(s)).slice(0, 10);

    return {
      status: 400,
      body: {
        erro: 'Série não pertence à OP ou não foi impressa',
        serieEnviada: String(serieProdutoFinal),
        opNumero: String(op.numeroOP || ''),
        seriesPertencentesOp: seriesPendentesDaOp
      }
    };
  }

  const etiquetaDaSerie = Array.isArray(etiquetas)
    ? etiquetas.find((e) => String(e?.serie || '').trim() === serie)
    : null;
  const codigoEsperadoViaOnda = String(etiquetaDaSerie?.codigo || '').trim();

  if (!codigoEsperadoViaOnda) {
    return {
      status: 502,
      body: {
        erro: 'Etiquetadora não retornou o código do produto para esta série/OP',
        serieProdutoFinal: serie,
        opNumero: String(op.numeroOP || '')
      }
    };
  }

  if (codProduto && codProduto !== codigoEsperadoViaOnda) {
    return {
      status: 400,
      body: {
        erro: 'codProdutoOmie divergente do produto da etiqueta para esta série',
        codProdutoOmieEnviado: codProduto,
        codProdutoEsperado: codigoEsperadoViaOnda,
        serieProdutoFinal: serie
      }
    };
  }

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
            aviso: 'Produto final já estava registrado com esta série.',
            produtoFinal: {
              ...existenteAposConflito,
              descricaoProduto: descricaoProduto || null
            }
          }
        };
      }
      return conflictResponse('Conflito de concorrência ao criar Produto Final. Tente novamente.', {
        recurso: 'ProdutoFinal',
        serie
      });
    }
    throw err;
  }

  return {
    status: 200,
    body: {
      ok: true,
      produtoFinal: {
        ...produtoFinal,
        descricaoProduto: descricaoProduto || null
      }
    }
  };
}

module.exports = { execute };
