const { prisma } = require('../database/prisma');
const { STATUS_TERMINAIS_MANUTENCAO } = require('../domain/fluxoManutencao');

async function create(data) {
  return prisma.manutencao.create({ data });
}

async function findById(id) {
  return prisma.manutencao.findUnique({
    where: { id: String(id) }
  });
}

async function findByNumeroOS(numeroOS) {
  const os = String(numeroOS || '').trim();
  if (!os) return null;
  return prisma.manutencao.findUnique({
    where: { numeroOS: os }
  });
}

async function findByIdResumo(id) {
  return prisma.manutencao.findUnique({
    where: { id: String(id) },
    include: {
      series: { orderBy: { criadoEm: 'asc' } },
      eventos: { orderBy: { criadoEm: 'asc' } },
      pecasTrocadas: { orderBy: { criadoEm: 'asc' } }
    }
  });
}

async function findAtivaBySerie(serieProduto) {
  const serie = String(serieProduto || '').trim();
  if (!serie) return null;

  return prisma.manutencao.findFirst({
    where: {
      series: { some: { serie } },
      status: { notIn: STATUS_TERMINAIS_MANUTENCAO }
    },
    orderBy: { criadoEm: 'desc' }
  });
}

async function findAtivaBySerieExcluindoId(serieProduto, manutencaoId) {
  const serie = String(serieProduto || '').trim();
  if (!serie) return null;

  return prisma.manutencao.findFirst({
    where: {
      id: { not: String(manutencaoId) },
      series: { some: { serie } },
      status: { notIn: STATUS_TERMINAIS_MANUTENCAO }
    },
    orderBy: { criadoEm: 'desc' }
  });
}

async function update(id, data) {
  return prisma.manutencao.update({
    where: { id: String(id) },
    data
  });
}

module.exports = {
  create,
  findById,
  findByNumeroOS,
  findByIdResumo,
  findAtivaBySerie,
  findAtivaBySerieExcluindoId,
  update
};
