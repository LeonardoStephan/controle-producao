const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const expedicaoRepo = require('../../repositories/expedicao.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');

const { consultarPedidoVenda, consultarEstoquePadrao } = require('../../integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../../domain/expedicao.rules');
const { conflictResponse, throwBusiness } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_EXPEDICAO } = require('../../domain/setorManutencao');

async function execute({ params, body }) {
  try {
    const { id } = params;
    const { empresa, codProdutoOmie, serie, funcionarioId } = body;

    if (!codProdutoOmie || !funcionarioId) {
      return { status: 400, body: { erro: 'codProdutoOmie e funcionarioId são obrigatórios' } };
    }

    const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_EXPEDICAO);
    if (!checkFuncionario.ok) {
      return { status: 403, body: { erro: checkFuncionario.erro } };
    }

    const expedicao = await expedicaoRepo.findByIdSelect(id, {
      id: true,
      numeroPedido: true,
      empresa: true,
      status: true,
      version: true
    });

    if (!expedicao || expedicao.status !== 'ativa') {
      return { status: 400, body: { erro: 'Expedição inválida ou não ativa' } };
    }

    if (empresa && String(expedicao.empresa || '').trim() && String(empresa).trim() !== String(expedicao.empresa).trim()) {
      return {
        status: 400,
        body: {
          erro: `Expedição pertence à empresa '${expedicao.empresa}'. Você enviou '${String(empresa).trim()}'.`
        }
      };
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

    const vinculo = await prisma.$transaction(async (tx) => {
      const claimed = await tx.expedicao.updateMany({
        where: { id: String(id), status: 'ativa', version: expedicao.version },
        data: { version: { increment: 1 } }
      });

      if (claimed.count === 0) {
        throwBusiness(
          409,
          'Conflito de concorrência: expedição foi alterada por outro usuário. Atualize e tente novamente.',
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
        throwBusiness(400, `Quantidade máxima atingida para ${codProdutoOmie}`);
      }

      const serieJaExiste = await tx.expedicaoSerie.findFirst({
        where: { serie: String(serie) }
      });

      if (serieJaExiste) {
        throwBusiness(400, `Série ${serie} já foi utilizada no sistema`);
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
      return conflictResponse('Conflito de concorrência: série já vinculada na expedição.', {
        recurso: 'ExpedicaoSerie',
        expedicaoId: String(params?.id || ''),
        serie: String(body?.serie || '')
      });
    }
    console.error('Erro scanSerie:', err);
    return { status: 500, body: { erro: 'Erro interno ao escanear série' } };
  }
}

module.exports = { execute };
