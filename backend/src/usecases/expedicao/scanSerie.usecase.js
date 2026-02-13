const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const expedicaoRepo = require('../../repositories/expedicao.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { consultarPedidoVenda, consultarEstoquePadrao } = require('../../integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../../domain/expedicao.rules');
const { conflictResponse, throwBusiness } = require('../../utils/httpErrors');

async function execute({ params, body }) {
  try {
    const { id } = params;
    const { empresa, codProdutoOmie, serie } = body;

    if (!codProdutoOmie) {
      return { status: 400, body: { erro: 'codProdutoOmie e obrigatorio' } };
    }

    const expedicao = await expedicaoRepo.findByIdSelect(id, {
      id: true,
      numeroPedido: true,
      empresa: true,
      status: true,
      version: true
    });

    if (!expedicao || expedicao.status !== 'ativa') {
      return { status: 400, body: { erro: 'Expedicao invalida ou nao ativa' } };
    }

    const empresaResolvida = String(expedicao.empresa || empresa || '').trim();
    if (!empresaResolvida) {
      return { status: 400, body: { erro: 'Expedicao sem empresa definida' } };
    }

    const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, empresaResolvida);
    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return { status: 404, body: { erro: 'Pedido nao encontrado ou sem itens no Omie' } };
    }

    const itemPedido = pedidoOmie.itens.find((i) => i.codProdutoOmie === codProdutoOmie);
    if (!itemPedido) {
      return { status: 400, body: { erro: 'Produto nao pertence ao pedido' } };
    }

    const possuiSerie = await produtoPossuiSerieNoSistema(codProdutoOmie);

    if (!possuiSerie) {
      if (serie) {
        return {
          status: 400,
          body: {
            erro: `Produto ${codProdutoOmie} nao possui numero de serie no sistema. Para este produto, nao envie "serie".`
          }
        };
      }

      return {
        status: 200,
        body: {
          ok: true,
          tipo: 'sem_serie',
          mensagem:
            'Produto sem numero de serie. Nao e necessario escanear unidades. Para finalizar, envie ao menos 1 foto geral em /expedicao/fotos-gerais/upload.'
        }
      };
    }

    if (!serie) {
      return { status: 400, body: { erro: 'Produto exige numero de serie' } };
    }

    const produtoFinal = await produtoFinalRepo.findBySerie(serie);
    if (!produtoFinal) {
      return {
        status: 404,
        body: { erro: 'Serie nao encontrada no cadastro de produtos (produza/registre antes no fluxo de producao)' }
      };
    }

    if (produtoFinal.codProdutoOmie !== codProdutoOmie) {
      return { status: 400, body: { erro: 'Serie nao pertence a este produto' } };
    }

    const estoquePadrao = await consultarEstoquePadrao(codProdutoOmie, empresaResolvida);
    if (!estoquePadrao) {
      return { status: 502, body: { erro: 'Falha ao consultar estoque no Omie ou estoque padrao nao encontrado' } };
    }

    if (Number(estoquePadrao.nSaldo) <= 0) {
      return { status: 400, body: { erro: 'Produto sem saldo no estoque padrao' } };
    }

    const vinculo = await prisma.$transaction(async (tx) => {
      const claimed = await tx.expedicao.updateMany({
        where: { id: String(id), status: 'ativa', version: expedicao.version },
        data: { version: { increment: 1 } }
      });

      if (claimed.count === 0) {
        throwBusiness(
          409,
          'Conflito de concorrencia: expedicao foi alterada por outro usuario. Atualize e tente novamente.',
          { code: 'CONCURRENCY_CONFLICT', detalhe: { recurso: 'Expedicao', expedicaoId: String(id) } }
        );
      }

      const qtdComSerie = await tx.expedicaoSerie.count({
        where: {
          expedicaoId: String(id),
          codProdutoOmie: String(codProdutoOmie),
          serie: { not: null }
        }
      });

      if (qtdComSerie >= Number(itemPedido.quantidade)) {
        throwBusiness(400, `Quantidade maxima atingida para ${codProdutoOmie}`);
      }

      const serieJaExiste = await tx.expedicaoSerie.findFirst({
        where: { serie: String(serie) }
      });

      if (serieJaExiste) {
        throwBusiness(400, `Serie ${serie} ja foi utilizada no sistema`);
      }

      return tx.expedicaoSerie.create({
        data: {
          id: crypto.randomUUID(),
          expedicaoId: String(id),
          codProdutoOmie: String(codProdutoOmie),
          serieProdFinalId: String(produtoFinal.id),
          serie: String(serie)
        }
      });
    });

    return { status: 200, body: { ok: true, tipo: 'serie', vinculo } };
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    if (err?.code === 'P2002') {
      return conflictResponse('Conflito de concorrencia: serie ja vinculada na expedicao.', {
        recurso: 'ExpedicaoSerie',
        expedicaoId: String(params?.id || ''),
        serie: String(body?.serie || '')
      });
    }
    console.error('Erro scanSerie:', err);
    return { status: 500, body: { erro: 'Erro interno ao escanear serie' } };
  }
}

module.exports = { execute };
