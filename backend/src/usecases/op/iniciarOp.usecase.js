const crypto = require('crypto');
const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const { buscarOpNaAPI } = require('../../integrations/viaonda/viaonda.op');

async function execute(body) {
  const { numeroOP, empresa, funcionarioId } = body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return {
      status: 400, body: { erro: 'numeroOP, empresa e funcionarioId são obrigatórios' }
    };
  }

  const numero = String(numeroOP).trim();
  const emp = String(empresa).trim();
  const funcionario = String(funcionarioId).trim();

  let externa;
  try {
    externa = await buscarOpNaAPI(numero, emp);
  } catch (err) {
    return { status: 400, body: { erro: err.message } };
  }

  if (!externa) {
    return { status: 404, body: { erro: 'OP não existe na API externa' } };
  }

  let op = await ordemRepo.findByNumeroOP(numero);

  // não permite trocar empresa
  if (op && op.empresa !== emp) {
    return {
      status: 400,
      body: { erro: `OP já pertence à empresa '${op.empresa}'. Você enviou '${emp}'.`, op }
    };
  }

  // não reinicia se já avançou
  if (op && op.status !== 'montagem') {
    return {
      status: 400,
      body: { erro: `OP já está em '${op.status}'. Não é possível iniciar montagem novamente.`, op }
    };
  }

  if (!op) {
    op = await ordemRepo.create({
      id: crypto.randomUUID(),
      numeroOP: numero,
      descricaoProduto: externa.descricao_produto || '',
      quantidadeProduzida: Number(externa.quantidade_total || 0) || 0,
      status: 'montagem',
      empresa: emp
    });
  }

  const ultimoEventoMontagem = await eventoRepo.findUltimoEvento(op.id, 'montagem');

  const precisaReiniciarMontagem =
    !ultimoEventoMontagem ||
    ['pausa', 'fim'].includes(ultimoEventoMontagem.tipo);

  if (precisaReiniciarMontagem) {
    await eventoRepo.create({
      id: crypto.randomUUID(),
      opId: op.id,
      tipo: 'inicio',
      etapa: 'montagem',
      funcionarioId: funcionario
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      codigoProduto: externa?.codigo ? String(externa.codigo).trim() : null,
      op
    }
  };
}

module.exports = { execute };
