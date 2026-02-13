const crypto = require('crypto');
const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const { buscarOpNaAPI } = require('../../integrations/viaonda/viaonda.op');
const { conflictResponse } = require('../../utils/httpErrors');

async function execute(body) {
  const { numeroOP, empresa, funcionarioId } = body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return {
      status: 400, body: { erro: 'numeroOP, empresa e funcionarioId sao obrigatorios' }
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
    return { status: 404, body: { erro: 'OP nao existe na API externa' } };
  }

  let op = await ordemRepo.findByNumeroOP(numero);

  if (!op) {
    try {
      op = await ordemRepo.create({
        id: crypto.randomUUID(),
        numeroOP: numero,
        descricaoProduto: externa.descricao_produto || '',
        quantidadeProduzida: Number(externa.quantidade_total || 0) || 0,
        status: 'montagem',
        empresa: emp
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        op = await ordemRepo.findByNumeroOP(numero);
        if (!op) {
          return conflictResponse('Conflito de concorrencia ao iniciar OP. Tente novamente.', {
            recurso: 'OrdemProducao',
            numeroOP: numero
          });
        }
      } else {
        throw err;
      }
    }
  }

  // nao permite trocar empresa
  if (op.empresa !== emp) {
    return {
      status: 400,
      body: { erro: `OP ja pertence a empresa '${op.empresa}'. Voce enviou '${emp}'.`, op }
    };
  }

  // nao reinicia se ja avancou
  if (op.status !== 'montagem') {
    return {
      status: 400,
      body: { erro: `OP ja esta em '${op.status}'. Nao e possivel iniciar montagem novamente.`, op }
    };
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
