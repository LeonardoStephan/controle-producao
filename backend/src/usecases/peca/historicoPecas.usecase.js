const consumoPecaRepo = require('../../repositories/consumoPeca.repository');

async function execute(query) {
  const { subprodutoId, serieProdFinalId, opId } = query;

  if (subprodutoId && serieProdFinalId) {
    return { status: 400, body: { erro: 'Informe apenas subprodutoId OU serieProdFinalId' } };
  }

  try {
    const consumos = await consumoPecaRepo.findMany({
      opId: opId || undefined,
      subprodutoId: subprodutoId || undefined,
      serieProdFinalId: serieProdFinalId || undefined
    });

    return { status: 200, body: { consumos } };
  } catch (err) {
    console.error('Erro historicoPecas:', err);
    return { status: 500, body: { erro: 'Erro interno ao buscar histórico de peças' } };
  }
}

module.exports = { execute };
