const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const expedicaoRepo = require('../../repositories/expedicao.repository');
const fotoGeralRepo = require('../../repositories/fotoExpedicaoGeral.repository');

const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../../domain/expedicao.rules');
const { throwBusiness } = require('../../utils/httpErrors');

async function execute({ params, body }) {
  try {
    const { id } = params;
    const { funcionarioId, empresa } = body;

    if (!funcionarioId) {
      return { status: 400, body: { erro: 'funcionarioId e obrigatorio' } };
    }

    const expedicao = await expedicaoRepo.findByIdIncludeSeries(id);
    if (!expedicao) {
      return { status: 404, body: { erro: `Expedicao nao encontrada para o id ${id}` } };
    }

    if (expedicao.status !== 'ativa') {
      return {
        status: 400,
        body: {
          erro: `Expedicao do pedido ${expedicao.numeroPedido} nao esta ativa`,
          numeroPedido: expedicao.numeroPedido,
          statusAtual: expedicao.status
        }
      };
    }

    const empresaResolvida = String(expedicao.empresa || empresa || '').trim();
    if (!empresaResolvida) {
      return { status: 400, body: { erro: 'Expedicao sem empresa definida' } };
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
              'O pedido possui itens sem numero de serie. Para finalizar, envie pelo menos 1 foto geral em /expedicao/fotos-gerais/upload.'
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

    await prisma.$transaction(async (tx) => {
      await tx.eventoExpedicao.create({
        data: {
          id: crypto.randomUUID(),
          expedicaoId: String(id),
          tipo: 'fim',
          funcionarioId: String(funcionarioId)
        }
      });

      const claimed = await tx.expedicao.updateMany({
        where: { id: String(id), status: 'ativa', version: expedicao.version },
        data: {
          status: 'finalizada',
          chaveAtiva: null,
          finalizadoEm: new Date(),
          version: { increment: 1 }
        }
      });

      if (claimed.count === 0) {
        throwBusiness(
          409,
          'Conflito de concorrencia: expedicao foi alterada por outro usuario. Atualize e tente novamente.',
          { code: 'CONCURRENCY_CONFLICT', detalhe: { recurso: 'Expedicao', expedicaoId: String(id) } }
        );
      }
    });

    return { status: 200, body: { ok: true, status: 'finalizada' } };
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    console.error('Erro finalizarExpedicao:', err);
    return {
      status: 500,
      body: { erro: 'Erro interno ao finalizar expedicao', detalhe: err.response?.data || err.message }
    };
  }
}

module.exports = { execute };
