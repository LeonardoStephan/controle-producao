const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');
const { conflictResponse, throwBusiness } = require('../../utils/httpErrors');

async function execute({ params = {}, body = {} }) {
  const { id, etapa } = params;
  const { funcionarioId } = body;

  if (!id || !etapa) {
    return { status: 400, body: { erro: 'Parametros obrigatorios ausentes (id, etapa)' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId e obrigatorio' } };
  }

  if (!FLUXO_ETAPAS.includes(etapa) || etapa === 'finalizada') {
    return { status: 400, body: { erro: 'Etapa invalida para inicio manual' } };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

  if (op.status !== etapa) {
    return {
      status: 400,
      body: { erro: `Nao e possivel iniciar ${etapa}. Etapa atual: ${op.status}` }
    };
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.ordemProducao.updateMany({
        where: { id: String(id), status: etapa, version: op.version },
        data: { version: { increment: 1 } }
      });

      if (claimed.count === 0) {
        throwBusiness(409, 'Conflito de concorrencia: OP foi alterada por outro usuario. Atualize e tente novamente.', {
          code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'OrdemProducao', opId: String(id), etapa: String(etapa) }
        });
      }

      const ultimoEvento = await tx.eventoOP.findFirst({
        where: {
          opId: String(id),
          etapa: String(etapa),
          tipo: { in: ['inicio', 'pausa', 'retorno', 'fim'] }
        },
        orderBy: { criadoEm: 'desc' }
      });

      if (!ultimoEvento) {
        await tx.eventoOP.create({
          data: {
            id: crypto.randomUUID(),
            opId: String(id),
            etapa,
            tipo: 'inicio',
            funcionarioId: String(funcionarioId)
          }
        });
        return { status: 200, body: { ok: true, etapaIniciada: etapa } };
      }

      if (ultimoEvento.tipo === 'inicio' || ultimoEvento.tipo === 'retorno') {
        throwBusiness(400, `Etapa ${etapa} ja esta iniciada`);
      }

      if (ultimoEvento.tipo === 'pausa') {
        throwBusiness(400, `Etapa ${etapa} esta pausada. Use retorno`);
      }

      throwBusiness(400, `Nao e possivel iniciar ${etapa} apos evento ${ultimoEvento.tipo}`);
    });

    return result;
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    console.error('Erro iniciarEtapa:', err);
    return { status: 500, body: { erro: 'Erro interno ao iniciar etapa' } };
  }
}

module.exports = { execute };
