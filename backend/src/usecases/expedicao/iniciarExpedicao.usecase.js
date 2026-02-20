const crypto = require('crypto');
const expedicaoRepo = require('../../repositories/expedicao.repository');
const eventoExpedicaoRepo = require('../../repositories/eventoExpedicao.repository');
const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');
const { conflictResponse } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_EXPEDICAO } = require('../../domain/setorManutencao');

async function execute(body) {
  try {
    const { numeroPedido, empresa, funcionarioId } = body;

    if (!numeroPedido || !empresa || !funcionarioId) {
      return { status: 400, body: { erro: 'numeroPedido, empresa e funcionarioId são obrigatórios' } };
    }

    const pedido = String(numeroPedido).trim();
    const emp = String(empresa).trim();
    const func = String(funcionarioId).trim();

    const checkFuncionario = await validarFuncionarioAtivoNoSetor(func, SETOR_EXPEDICAO);
    if (!checkFuncionario.ok) {
      return { status: 403, body: { erro: checkFuncionario.erro } };
    }

    const pedidoOmie = await consultarPedidoVenda(pedido, emp);
    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return { status: 404, body: { erro: 'Pedido não encontrado ou sem itens no Omie' } };
    }

    const jaAtiva = await expedicaoRepo.findAtivaByNumeroPedido(pedido);
    if (jaAtiva) {
      return {
        status: 400,
        body: {
          erro: `Já existe uma expedição ATIVA para este pedido (${pedido}).`,
          expedicaoId: jaAtiva.id
        }
      };
    }

    let expedicao;
    try {
      expedicao = await expedicaoRepo.create({
        id: crypto.randomUUID(),
        numeroPedido: pedido,
        chaveAtiva: pedido,
        empresa: emp,
        funcionarioId: func,
        status: 'ativa'
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        const ativaDepoisConflito = await expedicaoRepo.findAtivaByNumeroPedido(pedido);
        if (ativaDepoisConflito) {
          return conflictResponse(`Já existe uma expedição ATIVA para este pedido (${pedido}).`, {
            recurso: 'Expedicao',
            numeroPedido: pedido,
            expedicaoId: ativaDepoisConflito.id
          });
        }
        return conflictResponse('Conflito de concorrência ao iniciar expedição. Tente novamente.', {
          recurso: 'Expedicao',
          numeroPedido: pedido
        });
      }
      throw err;
    }

    await eventoExpedicaoRepo.create({
      id: crypto.randomUUID(),
      expedicaoId: expedicao.id,
      tipo: 'inicio',
      funcionarioId: func
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

