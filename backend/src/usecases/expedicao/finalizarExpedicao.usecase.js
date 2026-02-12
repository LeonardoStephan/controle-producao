const crypto = require('crypto');

const expedicaoRepo = require('../../repositories/expedicao.repository');
const eventoExpedicaoRepo = require('../../repositories/eventoExpedicao.repository');
const fotoGeralRepo = require('../../repositories/fotoExpedicaoGeral.repository');

const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../../domain/expedicao.rules');

async function execute({ params, body }) {
  try {
    const { id } = params;
    const { funcionarioId, empresa } = body;

    if (!funcionarioId) {
      return { status: 400, body: { erro: 'funcionarioId é obrigatório' } };
    }

    const expedicao = await expedicaoRepo.findByIdIncludeSeries(id);
    if (!expedicao) {
      return { status: 404, body: { erro: `Expedição não encontrada para o id ${id}` } };
    }

    if (expedicao.status !== 'ativa') {
      return {
        status: 400,
        body: {
          erro: `Expedição do pedido ${expedicao.numeroPedido} não está ativa`,
          numeroPedido: expedicao.numeroPedido,
          statusAtual: expedicao.status
        }
      };
    }

    const empresaResolvida = String(expedicao.empresa || empresa || '').trim();
    if (!empresaResolvida) {
      return { status: 400, body: { erro: 'Expedição sem empresa definida' } };
    }

    const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, empresaResolvida);
    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens)) {
      return { status: 502, body: { erro: 'Falha ao consultar pedido de venda no Omie' } };
    }

    let existeItemSemSerie = false;
    for (const item of pedidoOmie.itens) {
      const possuiSerie = await produtoPossuiSerieNoSistema(item.codProdutoOmie);
      if (!possuiSerie) existeItemSemSerie = true;
    }

    if (existeItemSemSerie) {
      const qtdFotosGerais = await fotoGeralRepo.countByExpedicaoId(id);
      if (qtdFotosGerais === 0) {
        return {
          status: 400,
          body: {
            erro:
              'O pedido possui itens sem número de série. Para finalizar, envie pelo menos 1 foto geral em /expedicao/fotos-gerais/upload.'
          }
        };
      }
    }

    for (const item of pedidoOmie.itens) {
      const possuiSerie = await produtoPossuiSerieNoSistema(item.codProdutoOmie);
      if (!possuiSerie) continue;

      const qtdEscaneadaComSerie = (expedicao.series || []).filter(
        (s) => s.codProdutoOmie === item.codProdutoOmie && s.serie !== null && s.serie !== ''
      ).length;

      if (qtdEscaneadaComSerie < Number(item.quantidade)) {
        return {
          status: 400,
          body: { erro: `Produto ${item.codProdutoOmie} incompleto (${qtdEscaneadaComSerie}/${item.quantidade})` }
        };
      }
    }

    await eventoExpedicaoRepo.create({
      id: crypto.randomUUID(),
      expedicaoId: id,
      tipo: 'fim',
      funcionarioId
    });

    await expedicaoRepo.update(id, {
      status: 'finalizada',
      finalizadoEm: new Date()
    });

    return { status: 200, body: { ok: true, status: 'finalizada' } };
  } catch (err) {
    console.error('Erro finalizarExpedicao:', err);
    return {
      status: 500,
      body: { erro: 'Erro interno ao finalizar expedição', detalhe: err.response?.data || err.message }
    };
  }
}

module.exports = { execute };
