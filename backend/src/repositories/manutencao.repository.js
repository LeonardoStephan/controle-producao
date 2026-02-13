const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.manutencao.create({ data });
}

async function findById(id) {
  return prisma.manutencao.findUnique({
    where: { id: String(id) }
  });
}

async function findByIdResumo(id) {
  return prisma.manutencao.findUnique({
    where: { id: String(id) },
    include: {
      eventos: { orderBy: { criadoEm: 'asc' } },
      pecasTrocadas: { orderBy: { criadoEm: 'asc' } }
    }
  });
}

async function findHistoricoBySerie(serieProduto) {
  return prisma.manutencao.findMany({
    where: { serieProduto: String(serieProduto) },
    include: {
      eventos: { orderBy: { criadoEm: 'asc' } },
      pecasTrocadas: { orderBy: { criadoEm: 'asc' } }
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
  findByIdResumo,
  findHistoricoBySerie,
  update
};
