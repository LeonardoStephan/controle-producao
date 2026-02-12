const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const { validarSequenciaEvento } = require('../../domain/eventoSequencia');
const { isDentroJornada } = require('../../domain/jornadaTrabalho');

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

  const expedicao = await prisma.expedicao.findUnique({
    where: { id }
  });

  if (!expedicao || expedicao.status !== 'ativa') {
    return {
      status: 400,
      body: { erro: 'Expedição inválida ou não ativa' }
    };
  }

  const ultimoEvento = await prisma.eventoExpedicao.findFirst({
    where: { expedicaoId: id },
    orderBy: { criadoEm: 'desc' }
  });

  const check = validarSequenciaEvento({
    ultimoTipo: ultimoEvento?.tipo || null,
    novoTipo: tipo,
    permitirFimSemPausa: false
  });

  if (!check.ok) {
    return { status: 400, body: { erro: check.erro } };
  }

  if (tipo === 'retorno' && !isDentroJornada(new Date())) {
    return {
      status: 400,
      body: { erro: 'Retorno permitido somente na jornada: 07:00-12:00 e 13:00-17:00' }
    };
  }

  await prisma.eventoExpedicao.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoId: id,
      tipo,
      funcionarioId: String(funcionarioId)
    }
  });

  return {
    status: 200,
    body: { ok: true }
  };
}

module.exports = { execute };
