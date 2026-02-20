const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const { TIPOS_EVENTO } = require('../../domain/fluxoOp');
const { validarSequenciaEvento } = require('../../domain/eventoSequencia');
const { isDentroJornada } = require('../../domain/jornadaTrabalho');
const ordemRepo = require('../../repositories/ordemProducao.repository');
const { throwBusiness } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

async function execute(input = {}) {
  const id = input?.id ?? input?.params?.id;
  const tipo = input?.tipo ?? input?.body?.tipo;
  const funcionarioId = input?.funcionarioId ?? input?.body?.funcionarioId;

  if (!id) {
    return { status: 400, body: { erro: 'id da OP é obrigatório' } };
  }

  if (!TIPOS_EVENTO.includes(tipo)) {
    return { status: 400, body: { erro: 'Tipo de evento inválido' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId é obrigatório' } };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(funcionarioId, SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  if (tipo === 'inicio' || tipo === 'fim') {
    return {
      status: 400,
      body: { erro: 'Use os endpoints específicos para início ou finalização' }
    };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  const etapaAtual = op.status;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.ordemProducao.updateMany({
        where: { id: String(id), status: etapaAtual, version: op.version },
        data: { version: { increment: 1 } }
      });

      if (claimed.count === 0) {
        throwBusiness(
          409,
          'Conflito de concorrência: OP foi alterada por outro usuário. Atualize e tente novamente.',
          {
            code: 'CONCURRENCY_CONFLICT',
            detalhe: { recurso: 'OrdemProducao', opId: String(id), etapa: String(etapaAtual) }
          }
        );
      }

      const ultimoEvento = await tx.eventoOP.findFirst({
        where: {
          opId: String(id),
          etapa: String(etapaAtual),
          tipo: { in: ['inicio', 'pausa', 'retorno', 'fim'] }
        },
        orderBy: { criadoEm: 'desc' }
      });

      const check = validarSequenciaEvento({
        ultimoTipo: ultimoEvento?.tipo || null,
        novoTipo: tipo,
        permitirFimSemPausa: false
      });

      if (!check.ok) {
        throwBusiness(400, check.erro);
      }

      if (tipo === 'retorno' && !isDentroJornada(new Date())) {
        throwBusiness(400, 'Retorno permitido somente na jornada: 07:00-12:00 e 13:00-17:00');
      }

      await tx.eventoOP.create({
        data: {
          id: crypto.randomUUID(),
          opId: String(id),
          tipo,
          etapa: etapaAtual,
          funcionarioId: String(funcionarioId)
        }
      });

      return { status: 200, body: { ok: true } };
    });

    return result;
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    console.error('Erro adicionarEvento OP:', err);
    return { status: 500, body: { erro: 'Erro interno ao adicionar evento' } };
  }
}

module.exports = { execute };

