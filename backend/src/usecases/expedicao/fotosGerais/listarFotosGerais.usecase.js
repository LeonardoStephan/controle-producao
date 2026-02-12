const expedicaoRepo = require('../../../repositories/expedicao.repository');
const { consultarPedidoVenda } = require('../../../integrations/omie/omie.facade');
const { formatDateTimeBr } = require('../../../utils/dateBr');

async function execute(params) {
  try {
    const { expedicaoId } = params;

    if (!expedicaoId) {
      return { status: 400, body: { erro: 'expedicaoId e obrigatorio' } };
    }

    const expedicao = await expedicaoRepo.findResumoById(expedicaoId);
    if (!expedicao) {
      return { status: 404, body: { erro: 'Expedicao nao encontrada' } };
    }

    let cliente = null;
    const descricaoPorCodigo = {};

    try {
      const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, expedicao.empresa);
      cliente = pedidoOmie?.cliente || null;

      for (const item of pedidoOmie?.itens || []) {
        const codigo = String(item.codProdutoOmie || '').trim();
        if (!codigo) continue;
        descricaoPorCodigo[codigo] = item.descricao || null;
      }
    } catch (err) {
      console.warn('Aviso listarFotosGerais: falha ao buscar cliente/descricoes no Omie:', err.message);
    }

    const fotos = (expedicao.fotosGerais || []).map((f) => ({
      id: f.id,
      expedicaoId: f.expedicaoId,
      url: f.url,
      descricao: f.descricao || null,
      criadoEm: formatDateTimeBr(f.criadoEm, { withDash: true })
    }));

    const fotosSerie = [];
    for (const s of expedicao.series || []) {
      const codigo = String(s.codProdutoOmie || '').trim();
      const descricaoProduto = codigo ? descricaoPorCodigo[codigo] || null : null;

      for (const f of s.fotos || []) {
        fotosSerie.push({
          id: f.id,
          expedicaoSerieId: s.id,
          codProdutoOmie: codigo || null,
          descricaoProduto,
          serie: s.serie || null,
          url: f.url,
          criadoEm: formatDateTimeBr(f.criadoEm, { withDash: true })
        });
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        expedicaoId: expedicao.id,
        numeroPedido: expedicao.numeroPedido,
        cliente,
        fotos,
        fotosSerie
      }
    };
  } catch (err) {
    console.error('Erro listarFotosGerais:', err);
    return { status: 500, body: { erro: 'Erro interno ao listar fotos gerais' } };
  }
}

module.exports = { execute };
