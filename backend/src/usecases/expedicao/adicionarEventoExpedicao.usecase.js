const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const { validarSequenciaEvento } = require('../../domain/eventoSequencia');
const { isDentroJornada } = require('../../domain/jornadaTrabalho');
const { throwBusiness } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_EXPEDICAO } = require('../../domain/setorManutencao');

const TIPOS_EVENTO_EXPEDICAO = ['pausa', 'retorno'];

async function execute({ params, body }) {
  const { id } = params;
  const { tipo, funcionarioId } = body;

  if (!tipo || !funcionarioId) {
    return {
      status: 400,
      body: { erro: 'tipo e funcionarioId são obrigatórios' }
    };
  }

  if (!TIPOS_EVENTO_EXPEDICAO.includes(tipo)) {
    return {
      status: 400,
      body: { erro: 'Tipo de evento inválido' }
    };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(funcionarioId, SETOR_EXPEDICAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  const expedicao = await prisma.expedicao.findUnique({
    where: { id: String(id) },
    select: { id: true, status: true, version: true }
  });

  if (!expedicao || expedicao.status !== 'ativa') {
    return {
      status: 400,
      body: { erro: 'Expedição inválida ou não ativa' }
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
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

      const ultimoEvento = await tx.eventoExpedicao.findFirst({
        where: { expedicaoId: String(id) },
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

      await tx.eventoExpedicao.create({
        data: {
          id: crypto.randomUUID(),
          expedicaoId: String(id),
          tipo: String(tipo),
          funcionarioId: String(funcionarioId)
        }
      });
    });

    return {
      status: 200,
      body: { ok: true }
    };
  } catch (err) {
    if (err?.isBusiness) return { status: err.status, body: err.body };
    console.error('Erro adicionarEventoExpedicao:', err);
    return {
      status: 500,
      body: { erro: 'Erro interno ao adicionar evento da expedição' }
    };
  }
}

module.exports = { execute };

