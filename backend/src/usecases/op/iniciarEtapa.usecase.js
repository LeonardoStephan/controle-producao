const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');
const { throwBusiness } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

async function execute({ params = {}, body = {} }) {
  const { id, etapa } = params;
  const { funcionarioId } = body;

  if (!id || !etapa) {
    return { status: 400, body: { erro: 'Parâmetros obrigatórios ausentes (id, etapa)' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId é obrigatório' } };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(funcionarioId, SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  if (!FLUXO_ETAPAS.includes(etapa) || etapa === 'finalizada') {
    return { status: 400, body: { erro: 'Etapa inválida para início manual' } };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  if (op.status !== etapa) {
    return {
      status: 400,
      body: { erro: `Não é possível iniciar ${etapa}. Etapa atual: ${op.status}` }
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.ordemProducao.updateMany({
        where: { id: String(id), status: etapa, version: op.version },
        data: { version: { increment: 1 } }
      });

      if (claimed.count === 0) {
        throwBusiness(
          409,
          'Conflito de concorrência: OP foi alterada por outro usuário. Atualize e tente novamente.',
          {
            code: 'CONCURRENCY_CONFLICT',
            detalhe: { recurso: 'OrdemProducao', opId: String(id), etapa: String(etapa) }
          }
        );
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
        throwBusiness(400, `Etapa ${etapa} já está iniciada`);
      }

      if (ultimoEvento.tipo === 'pausa') {
        throwBusiness(400, `Etapa ${etapa} está pausada. Use retorno`);
      }

      throwBusiness(400, `Não é possível iniciar ${etapa} após evento ${ultimoEvento.tipo}`);
    });

    return result;
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    console.error('Erro iniciarEtapa:', err);
    return { status: 500, body: { erro: 'Erro interno ao iniciar etapa' } };
  }
}

module.exports = { execute };

