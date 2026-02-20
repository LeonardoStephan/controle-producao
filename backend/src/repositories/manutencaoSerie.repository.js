const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.manutencaoSerie.create({ data });
}

async function findByManutencaoId(manutencaoId) {
  return prisma.manutencaoSerie.findMany({
    where: { manutencaoId: String(manutencaoId) },
    orderBy: { criadoEm: 'asc' }
  });
}

async function findByManutencaoIdAndSerie(manutencaoId, serie) {
  return prisma.manutencaoSerie.findUnique({
    where: {
      manutencaoId_serie: {
        manutencaoId: String(manutencaoId),
        serie: String(serie)
      }
    }
  });
}

module.exports = {
  create,
  findByManutencaoId,
  findByManutencaoIdAndSerie
};

