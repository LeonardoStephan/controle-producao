const crypto = require('crypto');
const expedicaoRepo = require('../../repositories/expedicao.repository');
const eventoExpedicaoRepo = require('../../repositories/eventoExpedicao.repository');
const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');

async function execute(body) {
  try {
    const { numeroPedido, empresa, funcionarioId } = body;

    if (!numeroPedido || !empresa || !funcionarioId) {
      return { status: 400, body: { erro: 'numeroPedido, empresa e funcionarioId são obrigatórios' } };
    }

    const pedidoOmie = await consultarPedidoVenda(String(numeroPedido), String(empresa));

    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return { status: 404, body: { erro: 'Pedido não encontrado ou sem itens no Omie' } };
    }

    const jaAtiva = await expedicaoRepo.findAtivaByNumeroPedido(numeroPedido);
    if (jaAtiva) {
      return {
        status: 400,
        body: {
          erro: `Já existe uma expedição ATIVA para este pedido (${numeroPedido}).`,
          expedicaoId: jaAtiva.id
        }
      };
    }

    const expedicao = await expedicaoRepo.create({
      id: crypto.randomUUID(),
      numeroPedido: String(numeroPedido),
      empresa: String(empresa),
      funcionarioId: String(funcionarioId),
      status: 'ativa'
    });

    await eventoExpedicaoRepo.create({
      id: crypto.randomUUID(),
      expedicaoId: expedicao.id,
      tipo: 'inicio',
      funcionarioId: String(funcionarioId)
    });

    return {
      status: 200,
      body: {
        ok: true,
        expedicaoId: expedicao.id,
        pedido: {
          numeroPedido: pedidoOmie.numeroPedido,
          cliente: pedidoOmie.cliente,
          itens: pedidoOmie.itens
        }
      }
    };
  } catch (err) {
    console.error('Erro iniciarExpedicao:', err.response?.data || err.message);
    return {
      status: 502,
      body: { erro: 'Falha ao consultar pedido no Omie', detalhe: err.response?.data || err.message }
    };
  }
}

module.exports = { execute };
