const crypto = require('crypto');

const expedicaoRepo = require('../../repositories/expedicao.repository');
const expedicaoSerieRepo = require('../../repositories/expedicaoSerie.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { consultarPedidoVenda, consultarEstoquePadrao } = require('../../integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../../domain/expedicao.rules');

async function execute({ params, body }) {
  try {
    const { id } = params;
    const { empresa, codProdutoOmie, serie } = body;

    if (!codProdutoOmie) {
      return { status: 400, body: { erro: 'codProdutoOmie é obrigatório' } };
    }

    const expedicao = await expedicaoRepo.findByIdIncludeSeries(id);
    if (!expedicao || expedicao.status !== 'ativa') {
      return { status: 400, body: { erro: 'Expedição inválida ou não ativa' } };
    }

    const empresaResolvida = String(expedicao.empresa || empresa || '').trim();
    if (!empresaResolvida) {
      return { status: 400, body: { erro: 'Expedição sem empresa definida' } };
    }

    const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, empresaResolvida);
    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return { status: 404, body: { erro: 'Pedido não encontrado ou sem itens no Omie' } };
    }

    const itemPedido = pedidoOmie.itens.find((i) => i.codProdutoOmie === codProdutoOmie);
    if (!itemPedido) {
      return { status: 400, body: { erro: 'Produto não pertence ao pedido' } };
    }

    const possuiSerie = await produtoPossuiSerieNoSistema(codProdutoOmie);

    if (!possuiSerie) {
      if (serie) {
        return {
          status: 400,
          body: {
            erro: `Produto ${codProdutoOmie} não possui número de série no sistema. Para este produto, não envie "serie".`
          }
        };
      }

      return {
        status: 200,
        body: {
          ok: true,
          tipo: 'sem_serie',
          mensagem:
            'Produto sem número de série. Não é necessário escanear unidades. Para finalizar, envie ao menos 1 foto geral em /expedicao/fotos-gerais/upload.'
        }
      };
    }

    if (!serie) {
      return { status: 400, body: { erro: 'Produto exige número de série' } };
    }

    const qtdComSerie = (expedicao.series || []).filter(
      (s) => s.codProdutoOmie === codProdutoOmie && s.serie !== null && s.serie !== ''
    ).length;

    if (qtdComSerie >= Number(itemPedido.quantidade)) {
      return { status: 400, body: { erro: `Quantidade máxima atingida para ${codProdutoOmie}` } };
    }

    const serieJaExiste = await expedicaoSerieRepo.findBySerieGlobal(serie);
    if (serieJaExiste) {
      return { status: 400, body: { erro: `Série ${serie} já foi utilizada no sistema` } };
    }

    const produtoFinal = await produtoFinalRepo.findBySerie(serie);
    if (!produtoFinal) {
      return {
        status: 404,
        body: { erro: 'Série não encontrada no cadastro de produtos (produza/registre antes no fluxo de produção)' }
      };
    }

    if (produtoFinal.codProdutoOmie !== codProdutoOmie) {
      return { status: 400, body: { erro: 'Série não pertence a este produto' } };
    }

    const estoquePadrao = await consultarEstoquePadrao(codProdutoOmie, empresaResolvida);
    if (!estoquePadrao) {
      return { status: 502, body: { erro: 'Falha ao consultar estoque no Omie ou estoque padrão não encontrado' } };
    }

    if (Number(estoquePadrao.nSaldo) <= 0) {
      return { status: 400, body: { erro: 'Produto sem saldo no estoque padrão' } };
    }

    const vinculo = await expedicaoSerieRepo.create({
      id: crypto.randomUUID(),
      expedicaoId: id,
      codProdutoOmie,
      serieProdFinalId: produtoFinal.id,
      serie: String(serie)
    });

    return { status: 200, body: { ok: true, tipo: 'serie', vinculo } };
  } catch (err) {
    console.error('Erro scanSerie:', err);
    return { status: 500, body: { erro: 'Erro interno ao escanear série' } };
  }
}

module.exports = { execute };
